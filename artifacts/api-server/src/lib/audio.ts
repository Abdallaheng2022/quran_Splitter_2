import { execFile } from "node:child_process";
import { promisify } from "node:util";

const pexec = promisify(execFile);

const MAX_BUFFER = 32 * 1024 * 1024;

export interface SilenceInterval {
  start: number;
  end: number;
}

/** Probe the duration of an audio file in seconds. */
export async function probeDuration(file: string): Promise<number> {
  const { stdout } = await pexec(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ],
    { maxBuffer: MAX_BUFFER },
  );
  const dur = parseFloat(stdout.trim());
  if (!Number.isFinite(dur) || dur <= 0) {
    throw new Error("تعذّر قراءة مدة الملف الصوتي");
  }
  return dur;
}

/**
 * Detect silence intervals using ffmpeg silencedetect.
 * noiseDb is negative (e.g. -30). minSilenceSec is the minimum silence length.
 */
export async function detectSilences(
  file: string,
  noiseDb: number,
  minSilenceSec: number,
): Promise<SilenceInterval[]> {
  let stderr = "";
  try {
    const res = await pexec(
      "ffmpeg",
      [
        "-hide_banner",
        "-i",
        file,
        "-af",
        `silencedetect=noise=${noiseDb}dB:d=${minSilenceSec}`,
        "-f",
        "null",
        "-",
      ],
      { maxBuffer: MAX_BUFFER },
    );
    stderr = res.stderr;
  } catch (err) {
    // ffmpeg may exit non-zero but still produce the analysis on stderr.
    const e = err as { stderr?: string };
    stderr = e.stderr ?? "";
    if (!stderr) throw err;
  }

  const intervals: SilenceInterval[] = [];
  let pendingStart: number | null = null;
  for (const line of stderr.split("\n")) {
    const startMatch = line.match(/silence_start:\s*(-?[\d.]+)/);
    if (startMatch) {
      pendingStart = parseFloat(startMatch[1]!);
      continue;
    }
    const endMatch = line.match(/silence_end:\s*(-?[\d.]+)/);
    if (endMatch && pendingStart !== null) {
      const end = parseFloat(endMatch[1]!);
      intervals.push({ start: Math.max(0, pendingStart), end });
      pendingStart = null;
    }
  }
  return intervals;
}

/**
 * Choose targetCount-1 split points (in seconds) from detected silences.
 * Picks the most prominent (longest) silences; if there are not enough,
 * fills in by repeatedly bisecting the longest remaining segment.
 */
export function chooseSplits(
  silences: SilenceInterval[],
  duration: number,
  targetCount: number,
): number[] {
  const needed = targetCount - 1;
  if (needed <= 0) return [];

  const edge = Math.min(0.2, duration * 0.02);
  const candidates = silences
    .map((s) => ({ t: (s.start + s.end) / 2, dur: s.end - s.start }))
    .filter((c) => c.t > edge && c.t < duration - edge);

  let splits: number[];
  if (candidates.length >= needed) {
    splits = [...candidates]
      .sort((a, b) => b.dur - a.dur)
      .slice(0, needed)
      .map((c) => c.t)
      .sort((a, b) => a - b);
  } else {
    splits = candidates.map((c) => c.t).sort((a, b) => a - b);
    while (splits.length < needed) {
      const bounds = [0, ...splits, duration];
      let bestIdx = 0;
      let bestLen = -1;
      for (let i = 0; i < bounds.length - 1; i++) {
        const len = bounds[i + 1]! - bounds[i]!;
        if (len > bestLen) {
          bestLen = len;
          bestIdx = i;
        }
      }
      const mid = (bounds[bestIdx]! + bounds[bestIdx + 1]!) / 2;
      splits.push(mid);
      splits.sort((a, b) => a - b);
    }
  }
  return splits;
}

export interface AnalyzeOptions {
  noiseDb: number;
  minSilenceSec: number;
}

export interface TimeBoundary {
  startSec: number;
  endSec: number;
}

/**
 * Analyze a file and produce exactly targetCount contiguous time segments.
 */
export async function analyzeSegments(
  file: string,
  targetCount: number,
  opts: AnalyzeOptions,
): Promise<{ duration: number; boundaries: TimeBoundary[] }> {
  const duration = await probeDuration(file);
  const silences = await detectSilences(file, opts.noiseDb, opts.minSilenceSec);
  const splits = chooseSplits(silences, duration, targetCount);
  const edges = [0, ...splits, duration];
  const boundaries: TimeBoundary[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    boundaries.push({ startSec: edges[i]!, endSec: edges[i + 1]! });
  }
  return { duration, boundaries };
}

/**
 * Reference-guided analysis. Uses a reference reciter's per-ayah durations to
 * place expected ayah boundaries proportionally on the user's timeline, then
 * snaps each interior boundary to the nearest real pause (silence) in the user's
 * recitation. Finally groups the per-ayah edges into the requested segments.
 *
 * refAyahDurations: one entry per ayah in the range (reference reciter timing).
 * groupAyahCounts: ayah count of each output segment; the sum must equal
 * refAyahDurations.length.
 */
export async function analyzeReferenceSegments(
  file: string,
  refAyahDurations: number[],
  groupAyahCounts: number[],
  opts: AnalyzeOptions,
): Promise<{ duration: number; boundaries: TimeBoundary[] }> {
  const duration = await probeDuration(file);
  const n = refAyahDurations.length;

  if (n === 0) {
    return { duration, boundaries: [{ startSec: 0, endSec: duration }] };
  }

  const refTotal = refAyahDurations.reduce((a, b) => a + b, 0) || 1;

  // Expected ayah edges scaled onto the user's timeline (n + 1 edges).
  const edges: number[] = [0];
  let cum = 0;
  for (let k = 0; k < n; k++) {
    cum += refAyahDurations[k]!;
    edges.push((cum / refTotal) * duration);
  }
  edges[n] = duration;

  // Snap interior edges to the nearest pause centre, staying ordered.
  const silences = await detectSilences(file, opts.noiseDb, opts.minSilenceSec);
  const centers = silences
    .map((s) => (s.start + s.end) / 2)
    .sort((a, b) => a - b);
  const meanAyah = duration / n;
  const window = Math.min(meanAyah * 0.5, 4);

  for (let k = 1; k < n; k++) {
    const expected = edges[k]!;
    const floor = edges[k - 1]! + 0.2;
    let best = expected;
    let bestDist = window;
    for (const c of centers) {
      if (c <= floor) continue;
      const dist = Math.abs(c - expected);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    edges[k] = best;
  }

  // Enforce strictly increasing edges so no segment collapses.
  for (let k = 1; k <= n; k++) {
    if (edges[k]! <= edges[k - 1]!) {
      edges[k] = Math.min(duration, edges[k - 1]! + 0.1);
    }
  }

  // Group per-ayah edges into the requested output segments.
  const boundaries: TimeBoundary[] = [];
  let idx = 0;
  for (const count of groupAyahCounts) {
    const startSec = edges[idx]!;
    idx += count;
    const endSec = edges[Math.min(idx, n)]!;
    boundaries.push({ startSec, endSec });
  }
  return { duration, boundaries };
}

/** Cut a single clip [startSec, endSec) from input to an mp3 output file. */
export async function cutClip(
  input: string,
  output: string,
  startSec: number,
  endSec: number,
): Promise<void> {
  const dur = Math.max(0.05, endSec - startSec);
  // -ss BEFORE -i = fast input seek (ffmpeg jumps near the timestamp instead of
  // decoding the whole file from 0 for every clip). Re-encoding with libmp3lame
  // keeps the cut accurate. Putting -ss after -i is O(startSec) per clip, which
  // makes long surahs (many clips, long file) take minutes and time out.
  await pexec(
    "ffmpeg",
    [
      "-hide_banner",
      "-y",
      "-ss",
      startSec.toFixed(3),
      "-i",
      input,
      "-t",
      dur.toFixed(3),
      "-c:a",
      "libmp3lame",
      "-q:a",
      "2",
      output,
    ],
    { maxBuffer: MAX_BUFFER },
  );
}
