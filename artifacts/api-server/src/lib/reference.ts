// Reference reciter engine: fetches a famous reciter's per-ayah recitation
// durations from the alquran.cloud audio CDN and caches them on disk. These
// durations describe how long each ayah takes for that reciter, which the audio
// engine scales onto the user's own recitation timeline to guide the split.
import fsp from "node:fs/promises";
import path from "node:path";
import { refCacheDir } from "./paths";

// The CDN serves constant-bitrate 128 kbps MP3 (see the "/128/" path segment),
// so 128000 bits / 8 = 16000 bytes per second of audio.
const BYTES_PER_SECOND = 16000;

export interface Reciter {
  id: string;
  nameAr: string;
}

// Curated set of well-known reciters (valid alquran.cloud verse-by-verse
// audio editions). The default reference is Mishary Alafasy.
export const RECITERS: Reciter[] = [
  { id: "ar.alafasy", nameAr: "مشاري راشد العفاسي" },
  { id: "ar.husary", nameAr: "محمود خليل الحصري" },
  { id: "ar.husarymujawwad", nameAr: "الحصري (المجوّد)" },
  { id: "ar.abdulsamad", nameAr: "عبد الباسط عبد الصمد" },
  { id: "ar.abdurrahmaansudais", nameAr: "عبد الرحمن السديس" },
  { id: "ar.shaatree", nameAr: "أبو بكر الشاطري" },
  { id: "ar.ahmedajamy", nameAr: "أحمد بن علي العجمي" },
  { id: "ar.mahermuaiqly", nameAr: "ماهر المعيقلي" },
  { id: "ar.saoodshuraym", nameAr: "سعود الشريم" },
  { id: "ar.hudhaify", nameAr: "علي الحذيفي" },
  { id: "ar.hanirifai", nameAr: "هاني الرفاعي" },
  { id: "ar.muhammadayyoub", nameAr: "محمد أيوب" },
];

const RECITER_IDS = new Set(RECITERS.map((r) => r.id));

// Reciter used as a proportion fallback when a requested reciter's durations
// can't be fetched. Its cache is bundled in the repo (see scripts/warm-ref-cache.mjs).
export const DEFAULT_EDITION = RECITERS[0]!.id; // ar.alafasy

export function isValidReciter(id: string): boolean {
  return RECITER_IDS.has(id);
}

function cdnUrl(edition: string, ayahNumber: number): string {
  return `https://cdn.islamic.network/quran/audio/128/${edition}/${ayahNumber}.mp3`;
}

// Estimate an ayah's duration from the CDN file's Content-Length via a cheap
// HEAD request. Downloading each mp3 with ffprobe was far slower and the CDN
// throttled it under concurrency (most probes returned nothing). Only the
// relative proportions between ayahs matter here, and the engine later snaps
// every boundary to the user's nearest real pause, so an approximate duration
// from the constant 128 kbps bitrate is accurate enough.
// The alquran.cloud CDN throttles concurrent cache-miss requests hard (high
// concurrency yields mostly timeouts), so probing stays at low concurrency.
const PROBE_TIMEOUT_MS = 10000;
const PROBE_CONCURRENCY = 8;
const MIN_KNOWN_RATIO = 0.7;
// Overall wall-clock budget for live probing per reciter, so a partially
// reachable but heavily throttled CDN can't drag a request out indefinitely.
const PROBE_BUDGET_MS = 12000;

// Returns NaN on any failure (bad status, missing length, timeout) instead of
// throwing, so callers can treat an unreachable CDN as "unknown" and degrade.
async function probeUrlDuration(url: string): Promise<number> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    if (!res.ok) return NaN;
    const len = Number(res.headers.get("content-length"));
    if (!Number.isFinite(len) || len <= 0) return NaN;
    const d = len / BYTES_PER_SECOND;
    return Number.isFinite(d) && d > 0 ? d : NaN;
  } catch {
    return NaN;
  } finally {
    clearTimeout(timer);
  }
}

type Cache = Record<number, number>;

function cachePath(edition: string): string {
  return path.join(refCacheDir, `${edition}.json`);
}

async function loadCache(edition: string): Promise<Cache> {
  try {
    return JSON.parse(await fsp.readFile(cachePath(edition), "utf8")) as Cache;
  } catch {
    return {};
  }
}

async function saveCache(edition: string, cache: Cache): Promise<void> {
  try {
    await fsp.writeFile(cachePath(edition), JSON.stringify(cache));
  } catch {
    // Best-effort: a failed cache write only costs a re-probe next time.
  }
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        out[idx] = await fn(items[idx]!);
      }
    },
  );
  await Promise.all(workers);
  return out;
}

// Probe the CDN for any ayah numbers missing from `cache`, writing successes
// back in. Starts with a tiny reachability sample: if it all fails, the CDN is
// assumed unreachable here (e.g. blocked production egress) and the rest is
// skipped, so a blocked environment fails fast instead of hanging on every
// ayah's timeout.
async function fillMissingFromCdn(
  edition: string,
  numbers: number[],
  cache: Cache,
): Promise<void> {
  const missing = numbers.filter((n) => !Number.isFinite(cache[n]));
  if (missing.length === 0) return;

  const sample = missing.slice(0, Math.min(4, missing.length));
  const sampled = await mapPool(sample, sample.length, async (n) => ({
    n,
    d: await probeUrlDuration(cdnUrl(edition, n)),
  }));
  let reachable = false;
  for (const { n, d } of sampled) {
    if (Number.isFinite(d)) {
      cache[n] = d;
      reachable = true;
    }
  }
  if (!reachable) return;

  const rest = missing.filter((n) => !Number.isFinite(cache[n]));
  if (rest.length > 0) {
    // Cap total probing time: once the budget is spent, remaining probes
    // short-circuit to NaN so a partially throttled CDN can't run the request
    // out to rest.length × PROBE_TIMEOUT_MS. Missing entries degrade to the mean.
    const deadline = Date.now() + PROBE_BUDGET_MS;
    const probed = await mapPool(rest, PROBE_CONCURRENCY, async (n) => ({
      n,
      d: Date.now() > deadline ? NaN : await probeUrlDuration(cdnUrl(edition, n)),
    }));
    for (const { n, d } of probed) if (Number.isFinite(d)) cache[n] = d;
  }
  await saveCache(edition, cache);
}

function knownRatio(numbers: number[], cache: Cache): number {
  if (numbers.length === 0) return 1;
  const known = numbers.filter((n) => Number.isFinite(cache[n])).length;
  return known / numbers.length;
}

// Fill any missing entries with the mean of the known durations so the returned
// array always has one positive value per ayah.
function fillWithMean(numbers: number[], cache: Cache): number[] {
  const known = numbers
    .map((n) => cache[n])
    .filter((d): d is number => Number.isFinite(d));
  const mean = known.length
    ? known.reduce((a, b) => a + b, 0) / known.length
    : 1;
  return numbers.map((n) => (Number.isFinite(cache[n]) ? cache[n]! : mean));
}

/**
 * Per-ayah reference durations for the global ayah numbers [startNum..endNum]
 * (1-based, matching the CDN's global ayah numbering).
 *
 * Resolution order — designed to NEVER hard-fail, since only the relative
 * proportions matter and every boundary is later snapped to the user's nearest
 * real pause:
 *   1. The requested reciter's bundled cache, topped up by live probing where
 *      the CDN is reachable.
 *   2. The default reciter's bundled cache (per-ayah proportions are similar
 *      across reciters).
 *   3. Uniform proportions (equal-length ayahs) as a last resort.
 */
export async function getReferenceDurations(
  edition: string,
  startNum: number,
  endNum: number,
): Promise<number[]> {
  if (!isValidReciter(edition)) throw new Error("قارئ غير معروف");
  if (endNum < startNum) throw new Error("نطاق غير صحيح");

  const numbers: number[] = [];
  for (let n = startNum; n <= endNum; n++) numbers.push(n);

  // 1. The requested reciter (disk cache + best-effort live probing).
  const cache = await loadCache(edition);
  await fillMissingFromCdn(edition, numbers, cache);
  if (knownRatio(numbers, cache) >= MIN_KNOWN_RATIO) {
    return fillWithMean(numbers, cache);
  }

  // 2. Fall back to the default reciter's bundled cache.
  if (edition !== DEFAULT_EDITION) {
    const fallback = await loadCache(DEFAULT_EDITION);
    await fillMissingFromCdn(DEFAULT_EDITION, numbers, fallback);
    if (knownRatio(numbers, fallback) >= MIN_KNOWN_RATIO) {
      return fillWithMean(numbers, fallback);
    }
  }

  // 3. Uniform proportions: refdtw degrades to snapping evenly spaced
  // boundaries onto the user's real pauses rather than erroring out.
  return numbers.map(() => 1);
}
