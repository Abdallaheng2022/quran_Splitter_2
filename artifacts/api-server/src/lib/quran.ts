import { SURAHS, AYAHS, type SurahMeta } from "../data/quranMeta";

export type SplitLevel = "ayah" | "page" | "rub" | "hizb" | "juz";

export const SPLIT_LEVELS: SplitLevel[] = ["ayah", "page", "rub", "hizb", "juz"];

export interface AyahRef {
  surah: number;
  ayah: number;
}

export interface SegmentLabel {
  index: number;
  level: SplitLevel;
  labelAr: string;
  subtitleAr: string;
  ayahStart: AyahRef;
  ayahEnd: AyahRef;
  ayahCount: number;
}

interface AyahRow {
  g: number;
  s: number;
  n: number;
  j: number;
  p: number;
  h: number;
}

export function getSurahs(): SurahMeta[] {
  return SURAHS;
}

export function getSurah(num: number): SurahMeta | undefined {
  return SURAHS.find((s) => s.number === num);
}

function surahName(num: number): string {
  return getSurah(num)?.name ?? `سورة ${num}`;
}

/** 0-based index into AYAHS for a given surah/ayah, or -1 if not found. */
export function findGlobalIndex(surah: number, ayah: number): number {
  // AYAHS is ordered; do a linear scan bounded by surah for clarity/safety.
  for (let i = 0; i < AYAHS.length; i++) {
    const row = AYAHS[i]!;
    if (row[0] === surah && row[1] === ayah) return i;
  }
  return -1;
}

function rowAt(i: number): AyahRow {
  const t = AYAHS[i]!;
  return { g: i, s: t[0], n: t[1], j: t[2], p: t[3], h: t[4] };
}

function groupKey(level: SplitLevel, row: AyahRow): number {
  switch (level) {
    case "ayah":
      return row.g;
    case "page":
      return row.p;
    case "juz":
      return row.j;
    case "rub":
      return row.h;
    case "hizb":
      return Math.floor((row.h - 1) / 4) + 1;
  }
}

function labelFor(
  level: SplitLevel,
  first: AyahRow,
  last: AyahRow,
): { labelAr: string; subtitleAr: string } {
  const range =
    first.s === last.s && first.n === last.n
      ? `${surahName(first.s)} • آية ${first.n}`
      : `${surahName(first.s)} ${first.n} ← ${surahName(last.s)} ${last.n}`;

  switch (level) {
    case "ayah":
      return {
        labelAr: `${surahName(first.s)} • آية ${first.n}`,
        subtitleAr: `الجزء ${first.j} • صفحة ${first.p}`,
      };
    case "page":
      return { labelAr: `صفحة ${first.p}`, subtitleAr: range };
    case "juz":
      return { labelAr: `الجزء ${first.j}`, subtitleAr: range };
    case "hizb": {
      const hizbNum = Math.floor((first.h - 1) / 4) + 1;
      return { labelAr: `الحزب ${hizbNum}`, subtitleAr: range };
    }
    case "rub": {
      const hizbNum = Math.floor((first.h - 1) / 4) + 1;
      const quarter = ((first.h - 1) % 4) + 1;
      const quarterNames = ["ربع", "نصف", "ثلاثة أرباع", "حزب كامل"];
      return {
        labelAr: `${quarterNames[quarter - 1]} • الحزب ${hizbNum}`,
        subtitleAr: range,
      };
    }
  }
}

export interface ComputeRange {
  surahStart: number;
  ayahStart: number;
  surahEnd: number;
  ayahEnd: number;
  level: SplitLevel;
}

/**
 * Compute the ordered list of target segments for a Quran range at a level.
 * Throws on an invalid range.
 */
export function computeSegments(range: ComputeRange): SegmentLabel[] {
  const startIdx = findGlobalIndex(range.surahStart, range.ayahStart);
  const endIdx = findGlobalIndex(range.surahEnd, range.ayahEnd);

  if (startIdx < 0) {
    throw new Error(
      `بداية غير صحيحة: سورة ${range.surahStart} آية ${range.ayahStart}`,
    );
  }
  if (endIdx < 0) {
    throw new Error(
      `نهاية غير صحيحة: سورة ${range.surahEnd} آية ${range.ayahEnd}`,
    );
  }
  if (endIdx < startIdx) {
    throw new Error("النهاية يجب أن تكون بعد البداية");
  }

  const segments: SegmentLabel[] = [];
  let groupStart = startIdx;
  let currentKey = groupKey(range.level, rowAt(startIdx));

  const flush = (from: number, to: number): void => {
    const first = rowAt(from);
    const last = rowAt(to);
    const { labelAr, subtitleAr } = labelFor(range.level, first, last);
    segments.push({
      index: segments.length,
      level: range.level,
      labelAr,
      subtitleAr,
      ayahStart: { surah: first.s, ayah: first.n },
      ayahEnd: { surah: last.s, ayah: last.n },
      ayahCount: to - from + 1,
    });
  };

  for (let i = startIdx + 1; i <= endIdx; i++) {
    const key = groupKey(range.level, rowAt(i));
    if (key !== currentKey) {
      flush(groupStart, i - 1);
      groupStart = i;
      currentKey = key;
    }
  }
  flush(groupStart, endIdx);

  return segments;
}
