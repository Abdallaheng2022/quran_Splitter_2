import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import { getUser, trialsRemaining } from "../lib/users";

const router: IRouter = Router();

router.get("/me", requireAuth, async (req, res): Promise<void> => {
  const user = await getUser(req.userId!);
  res.json({
    id: req.userId!,
    email: user?.email ?? null,
    trialsUsed: user?.trialsUsed ?? 0,
    trialsRemaining: trialsRemaining(user),
  });
});

export default router;
