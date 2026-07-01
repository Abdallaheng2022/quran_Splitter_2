import path from "node:path";
import fs from "node:fs";

const workspaceRoot = process.cwd().endsWith(path.join("artifacts", "api-server"))
  ? path.resolve(process.cwd(), "../..")
  : process.cwd();

export const uploadsDir = path.resolve(
  workspaceRoot,
  "artifacts/api-server/uploads",
);
export const tmpDir = path.resolve(workspaceRoot, "artifacts/api-server/tmp");

// Bundled demo recitation (Surah An-Nahl) served to the app for one-tap testing.
export const sampleAudioPath = path.resolve(
  workspaceRoot,
  "artifacts/api-server/assets/sample-an-nahl.mp3",
);

// Persistent cache for reference reciter per-ayah durations (keyed by edition).
export const refCacheDir = path.resolve(
  workspaceRoot,
  "artifacts/api-server/ref-cache",
);

fs.mkdirSync(uploadsDir, { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });
fs.mkdirSync(refCacheDir, { recursive: true });

/**
 * Remove files in a directory older than maxAgeMs. Best-effort, never throws.
 */
export function sweepOldFiles(dir: string, maxAgeMs: number): void {
  try {
    const now = Date.now();
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      try {
        const stat = fs.statSync(full);
        if (now - stat.mtimeMs > maxAgeMs) {
          fs.rmSync(full, { force: true, recursive: true });
        }
      } catch {
        // ignore individual file errors
      }
    }
  } catch {
    // ignore directory errors
  }
}
