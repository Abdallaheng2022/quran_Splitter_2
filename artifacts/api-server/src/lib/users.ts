import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import type { User } from "@workspace/db";

export const FREE_TRIALS = 3;

/**
 * Ensure a users row exists for the given Clerk user id. Idempotent.
 */
export async function ensureUser(id: string, email?: string | null): Promise<User> {
  const [user] = await db
    .insert(usersTable)
    .values({ id, email: email ?? null })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: email ? { email } : { id },
    })
    .returning();
  return user!;
}

export async function getUser(id: string): Promise<User | undefined> {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return user;
}

export async function incrementTrials(id: string): Promise<number> {
  const [user] = await db
    .update(usersTable)
    .set({ trialsUsed: sql`${usersTable.trialsUsed} + 1` })
    .where(eq(usersTable.id, id))
    .returning();
  return user?.trialsUsed ?? 0;
}

export function trialsRemaining(user: User | undefined): number {
  const used = user?.trialsUsed ?? 0;
  return Math.max(0, FREE_TRIALS - used);
}
