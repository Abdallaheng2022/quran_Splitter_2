import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { ensureUser } from "../lib/users";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Requires an authenticated Clerk session. Performs just-in-time provisioning
 * of the local users row and attaches req.userId.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "يلزم تسجيل الدخول" });
    return;
  }

  let email: string | null = null;
  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    email =
      clerkUser.primaryEmailAddress?.emailAddress ??
      clerkUser.emailAddresses[0]?.emailAddress ??
      null;
  } catch {
    // Non-fatal: provision without email; it can be backfilled at checkout.
  }

  try {
    await ensureUser(userId, email);
  } catch (err) {
    req.log.error({ err }, "failed to provision user");
    res.status(500).json({ error: "تعذّر تجهيز الحساب" });
    return;
  }

  req.userId = userId;
  next();
}
