import { Router, type IRouter } from "express";
import healthRouter from "./health";
import analyzeRouter from "./analyze";
import clipsRouter from "./clips";
import accountRouter from "./account";
import sampleRouter from "./sample";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountRouter);
router.use(analyzeRouter);
router.use(clipsRouter);
router.use(sampleRouter);

export default router;
