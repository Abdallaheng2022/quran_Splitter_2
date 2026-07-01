import { Router, type IRouter } from "express";
import multer from "multer";
import { uploadsDir, sweepOldFiles } from "../lib/paths";
import {
  computeSegments,
  findGlobalIndex,
  SPLIT_LEVELS,
  type SplitLevel,
} from "../lib/quran";
import { analyzeSegments, analyzeReferenceSegments } from "../lib/audio";
import { getReferenceDurations, isValidReciter } from "../lib/reference";
import { requireAuth } from "../middlewares/auth";
import {
  getUser,
  incrementTrials,
  trialsRemaining,
  FREE_TRIALS,
} from "../lib/users";
import { startJob, finishJob, failJob, getJob } from "../lib/jobs";
import { isEntitledPro } from "../lib/revenuecat";

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 250 * 1024 * 1024 },
});

const router: IRouter = Router();

function parseIntField(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : null;
}

function parseFloatField(value: unknown, fallback: number): number {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// POST /analyze — validate + gate synchronously (so the paywall can be returned
// immediately), then run the heavy ffmpeg work as a background job and return a
// jobId. The client polls GET /analyze/status/:jobId for the result. This keeps
// every request short, so a long recitation (whose full-file decode can take
// well over the gateway/client timeout on the VM) never fails with a timeout.
router.post(
  "/analyze",
  requireAuth,
  upload.single("audio"),
  async (req, res): Promise<void> => {
    // Best-effort cleanup of stale uploads (older than 3h).
    sweepOldFiles(uploadsDir, 3 * 60 * 60 * 1000);

    if (!req.file) {
      res.status(400).json({ error: "لم يتم رفع ملف صوتي" });
      return;
    }

    // Trial / subscription gating. When a RevenueCat secret key is configured
    // (REVENUECAT_SECRET_API_KEY), the entitlement is verified server-side and
    // is authoritative — a tampered client can't unlock paid features by faking
    // the header. Otherwise we fall back to the client-supplied `x-subscribed`
    // header (RevenueCat verifies it on-device). Trial counting always stays
    // server-side so the free tier can't be reset by clearing local state.
    const user = await getUser(req.userId!);
    const headerSubscribed = req.header("x-subscribed") === "true";
    const verified = await isEntitledPro(req.userId!);
    const subscribed = verified ?? headerSubscribed;

    const method = String(req.body.method ?? "silence");
    const edition = String(req.body.edition ?? "ar.alafasy");
    const useReference = method === "refdtw" || (method === "auto" && subscribed);

    if (useReference && !isValidReciter(edition)) {
      res.status(400).json({ error: "القارئ المرجعي غير معروف" });
      return;
    }
    // Both split methods get FREE_TRIALS free uses, then require a subscription.
    if (!subscribed && trialsRemaining(user) <= 0) {
      res.status(402).json({
        error: `لقد استخدمت محاولاتك المجانية (${FREE_TRIALS})، اشترك للمتابعة`,
        paywall: true,
      });
      return;
    }

    const surahStart = parseIntField(req.body.surahStart);
    const ayahStart = parseIntField(req.body.ayahStart);
    const surahEnd = parseIntField(req.body.surahEnd);
    const ayahEnd = parseIntField(req.body.ayahEnd);
    const level = String(req.body.level) as SplitLevel;

    if (
      surahStart === null ||
      ayahStart === null ||
      surahEnd === null ||
      ayahEnd === null ||
      !SPLIT_LEVELS.includes(level)
    ) {
      res.status(400).json({ error: "بيانات النطاق غير صحيحة" });
      return;
    }

    const noiseDb = parseFloatField(req.body.noiseDb, -30);
    const minSilenceSec = parseFloatField(req.body.minSilenceSec, 0.35);

    let labels;
    try {
      labels = computeSegments({
        surahStart,
        ayahStart,
        surahEnd,
        ayahEnd,
        level,
      });
    } catch (err) {
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : "نطاق غير صحيح" });
      return;
    }

    if (labels.length === 0) {
      res.status(400).json({ error: "لا توجد مقاطع في هذا النطاق" });
      return;
    }

    // Hand the heavy work to a background job; the multer filename doubles as the
    // jobId (and as the audioId the client later passes to /clips).
    const jobId = req.file.filename;
    const filePath = req.file.path;
    const userId = req.userId!;
    const log = req.log;
    startJob(jobId, userId);

    void (async () => {
      try {
        let duration: number;
        let boundaries;
        if (useReference) {
          const startNum = findGlobalIndex(surahStart, ayahStart) + 1;
          const endNum = findGlobalIndex(surahEnd, ayahEnd) + 1;
          const refDurations = await getReferenceDurations(
            edition,
            startNum,
            endNum,
          );
          ({ duration, boundaries } = await analyzeReferenceSegments(
            filePath,
            refDurations,
            labels.map((l) => l.ayahCount),
            { noiseDb, minSilenceSec },
          ));
        } else {
          ({ duration, boundaries } = await analyzeSegments(
            filePath,
            labels.length,
            { noiseDb, minSilenceSec },
          ));
        }

        const segments = labels.map((lab, i) => ({
          index: i,
          labelAr: lab.labelAr,
          subtitleAr: lab.subtitleAr,
          ayahStart: lab.ayahStart,
          ayahEnd: lab.ayahEnd,
          ayahCount: lab.ayahCount,
          startSec: boundaries[i]?.startSec ?? 0,
          endSec: boundaries[i]?.endSec ?? duration,
        }));

        // Both methods consume a free trial when not subscribed.
        let trialsLeft: number | null = null;
        if (!subscribed) {
          const used = await incrementTrials(userId);
          trialsLeft = Math.max(0, FREE_TRIALS - used);
        }

        finishJob(jobId, {
          audioId: jobId,
          duration,
          level,
          method: useReference ? "refdtw" : "silence",
          edition: useReference ? edition : null,
          targetCount: labels.length,
          detectedSplits: boundaries.length - 1,
          segments,
          isPro: subscribed,
          trialsRemaining: trialsLeft,
        });
      } catch (err) {
        log.error({ err }, "audio analysis failed");
        failJob(jobId, "فشل تحليل الملف الصوتي", 500);
      }
    })();

    res.status(202).json({ jobId });
  },
);

// GET /analyze/status/:jobId — poll target for the analyze job.
router.get("/analyze/status/:jobId", requireAuth, (req, res): void => {
  const job = getJob(String(req.params.jobId));
  if (!job || job.userId !== req.userId) {
    res.status(404).json({ error: "انتهت صلاحية المهمة، يرجى إعادة التحليل" });
    return;
  }
  if (job.status === "processing") {
    res.json({ status: "processing" });
    return;
  }
  if (job.status === "error") {
    res.json({
      status: "error",
      error: job.error ?? "فشل تحليل الملف الصوتي",
      statusCode: job.statusCode ?? 500,
    });
    return;
  }
  res.json({ status: "done", ...(job.result as object) });
});

export default router;
