import { Router, type IRouter } from "express";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { ZipArchive } from "archiver";
import { uploadsDir, tmpDir } from "../lib/paths";
import { cutClip } from "../lib/audio";
import { requireAuth } from "../middlewares/auth";
import { startJob, finishJob, failJob, getJob } from "../lib/jobs";

const router: IRouter = Router();

interface ClipRequest {
  label: string;
  startSec: number;
  endSec: number;
}

function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim();
  return cleaned.length > 0 ? cleaned.slice(0, 80) : "clip";
}

// POST /clips — validate synchronously, then cut every requested segment and
// build a zip as a background job (a long surah has many segments and the cuts
// can take longer than the request timeout on the VM). Returns a jobId; the
// client polls GET /clips/status/:jobId for the downloadId. The bytes are then
// fetched via GET /clips/download/:id so React Native's FileSystem.downloadAsync
// (GET only) can retrieve them.
router.post("/clips", requireAuth, async (req, res): Promise<void> => {
  const audioId = String(req.body?.audioId ?? "");
  const rawSegments = req.body?.segments;

  // Prevent path traversal: only allow the bare multer filename.
  if (!/^[A-Za-z0-9_-]+$/.test(audioId)) {
    res.status(400).json({ error: "معرّف الملف غير صحيح" });
    return;
  }
  const inputPath = path.join(uploadsDir, audioId);
  if (!fs.existsSync(inputPath)) {
    res.status(404).json({ error: "انتهت صلاحية الملف، يرجى إعادة التحليل" });
    return;
  }

  if (!Array.isArray(rawSegments) || rawSegments.length === 0) {
    res.status(400).json({ error: "لا توجد مقاطع للتقطيع" });
    return;
  }

  const segments: ClipRequest[] = [];
  for (const s of rawSegments) {
    const startSec = Number(s?.startSec);
    const endSec = Number(s?.endSec);
    const label = String(s?.label ?? "clip");
    if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
      res.status(400).json({ error: "حدود المقاطع غير صحيحة" });
      return;
    }
    segments.push({ label, startSec, endSec });
  }

  const jobId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const userId = req.userId!;
  const log = req.log;
  startJob(jobId, userId);

  void (async () => {
    const workDir = path.join(
      tmpDir,
      `clips_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    );
    try {
      await fsp.mkdir(workDir, { recursive: true });

      // Cut clips with bounded concurrency (long surahs have many segments, e.g.
      // Al-Qasas = 88, Al-Baqarah = 286). Order is preserved via the index.
      const files: { path: string; name: string }[] = new Array(segments.length);
      const CONCURRENCY = 4;
      let next = 0;
      const worker = async (): Promise<void> => {
        for (let i = next++; i < segments.length; i = next++) {
          const seg = segments[i]!;
          const num = String(i + 1).padStart(2, "0");
          const name = `${num}_${sanitizeFilename(seg.label)}.mp3`;
          const out = path.join(workDir, name);
          await cutClip(inputPath, out, seg.startSec, seg.endSec);
          files[i] = { path: out, name };
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, segments.length) }, worker),
      );

      const downloadId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const zipPath = path.join(tmpDir, `${downloadId}.zip`);

      await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = new ZipArchive({ zlib: { level: 6 } });
        output.on("close", () => resolve());
        output.on("error", reject);
        archive.on("error", reject);
        archive.pipe(output);
        for (const f of files) {
          archive.file(f.path, { name: f.name });
        }
        void archive.finalize();
      });

      await fsp.rm(workDir, { recursive: true, force: true });
      finishJob(jobId, { downloadId, count: files.length });
    } catch (err) {
      log.error({ err }, "clip generation failed");
      await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
      failJob(jobId, "فشل توليد المقاطع", 500);
    }
  })();

  res.status(202).json({ jobId });
});

// GET /clips/status/:jobId — poll target for the clips job.
router.get("/clips/status/:jobId", requireAuth, (req, res): void => {
  const job = getJob(String(req.params.jobId));
  if (!job || job.userId !== req.userId) {
    res.status(404).json({ error: "انتهت صلاحية المهمة، يرجى إعادة المحاولة" });
    return;
  }
  if (job.status === "processing") {
    res.json({ status: "processing" });
    return;
  }
  if (job.status === "error") {
    res.json({
      status: "error",
      error: job.error ?? "فشل توليد المقاطع",
      statusCode: job.statusCode ?? 500,
    });
    return;
  }
  res.json({ status: "done", ...(job.result as object) });
});

// GET /clips/download/:id — stream a previously generated zip.
router.get("/clips/download/:id", async (req, res): Promise<void> => {
  const id = String(req.params.id ?? "");
  if (!/^[A-Za-z0-9_]+$/.test(id)) {
    res.status(400).json({ error: "معرّف التنزيل غير صحيح" });
    return;
  }
  const zipPath = path.join(tmpDir, `${id}.zip`);
  if (!fs.existsSync(zipPath)) {
    res.status(404).json({ error: "انتهت صلاحية ملف التنزيل" });
    return;
  }
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", 'attachment; filename="quran_clips.zip"');
  const stream = fs.createReadStream(zipPath);
  stream.on("error", (err) => {
    req.log.error({ err }, "zip stream error");
    if (!res.headersSent) res.status(500).end();
  });
  stream.pipe(res);
});

export default router;
