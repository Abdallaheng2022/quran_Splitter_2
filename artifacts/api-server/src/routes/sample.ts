import { Router, type IRouter } from "express";
import fs from "node:fs";
import { sampleAudioPath } from "../lib/paths";

const router: IRouter = Router();

// Public: streams the bundled demo recitation so the app can offer a one-tap
// "try a sample" flow without the user uploading their own audio. res.sendFile
// honours Range requests, so audio preview/seeking works too.
router.get("/sample-audio", (req, res): void => {
  if (!fs.existsSync(sampleAudioPath)) {
    res.status(404).json({ error: "العينة غير متوفرة" });
    return;
  }
  res.sendFile(sampleAudioPath, {
    headers: { "Content-Type": "audio/mpeg" },
  });
});

export default router;
