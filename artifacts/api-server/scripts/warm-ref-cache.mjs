// Pre-computes the per-ayah reference duration cache for every reciter and
// writes it to artifacts/api-server/ref-cache/{edition}.json. These cache files
// are committed to the repo so production never has to probe the alquran.cloud
// CDN live (production egress to cdn.islamic.network is blocked/throttled).
//
// Duration is derived from the CDN file's Content-Length over a HEAD request:
// the CDN serves constant-bitrate 128 kbps MP3, so bytes / 16000 = seconds.
// This MUST match the formula in src/lib/reference.ts.
//
// Usage: node ./scripts/warm-ref-cache.mjs [edition ...]
// With no args, warms all editions in EDITIONS below.

import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const refCacheDir = path.resolve(__dirname, "..", "ref-cache");

const BYTES_PER_SECOND = 16000;
const TOTAL_AYAHS = 6236; // global ayah count across the whole Quran
const CONCURRENCY = 64;

// Must stay in sync with RECITERS in src/lib/reference.ts.
const EDITIONS = [
  "ar.alafasy",
  "ar.husary",
  "ar.husarymujawwad",
  "ar.abdulsamad",
  "ar.abdurrahmaansudais",
  "ar.shaatree",
  "ar.ahmedajamy",
  "ar.mahermuaiqly",
  "ar.saoodshuraym",
  "ar.hudhaify",
  "ar.hanirifai",
  "ar.muhammadayyoub",
];

function cdnUrl(edition, ayahNumber) {
  return `https://cdn.islamic.network/quran/audio/128/${edition}/${ayahNumber}.mp3`;
}

async function probeUrlDuration(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
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

async function mapPool(items, limit, fn) {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const idx = cursor++;
        await fn(items[idx], idx);
      }
    },
  );
  await Promise.all(workers);
}

async function loadCache(edition) {
  try {
    return JSON.parse(
      await fsp.readFile(path.join(refCacheDir, `${edition}.json`), "utf8"),
    );
  } catch {
    return {};
  }
}

async function saveCache(edition, cache) {
  await fsp.writeFile(
    path.join(refCacheDir, `${edition}.json`),
    JSON.stringify(cache),
  );
}

async function warmEdition(edition) {
  const cache = await loadCache(edition);
  const all = [];
  for (let n = 1; n <= TOTAL_AYAHS; n++) all.push(n);

  // Probe missing entries, then retry whatever still failed once more.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const missing = all.filter((n) => !Number.isFinite(cache[n]));
    if (missing.length === 0) break;
    let done = 0;
    await mapPool(missing, CONCURRENCY, async (n) => {
      const d = await probeUrlDuration(cdnUrl(edition, n));
      if (Number.isFinite(d)) cache[n] = d;
      if (++done % 1000 === 0) {
        process.stdout.write(
          `  ${edition}: pass ${attempt} ${done}/${missing.length}\n`,
        );
        await saveCache(edition, cache); // checkpoint so interrupts don't lose work
      }
    });
    await saveCache(edition, cache);
  }

  const known = all.filter((n) => Number.isFinite(cache[n])).length;
  console.log(`DONE ${edition}: ${known}/${TOTAL_AYAHS} ayahs cached`);
  return known;
}

async function main() {
  await fsp.mkdir(refCacheDir, { recursive: true });
  const targets = process.argv.slice(2);
  const editions = targets.length > 0 ? targets : EDITIONS;
  console.log(`Warming ${editions.length} edition(s) -> ${refCacheDir}`);
  for (const edition of editions) {
    await warmEdition(edition);
  }
  console.log("All done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
