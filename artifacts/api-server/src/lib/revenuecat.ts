import { logger } from "./logger";

// Server-side verification of the "pro" entitlement, used to harden the
// paywall so a tampered client can't unlock paid features by faking the
// `x-subscribed` header.
//
// The client identifies itself to RevenueCat with its Clerk user id
// (`Purchases.logIn(clerkUserId)`), which is the same value as `req.userId`
// here — so the Clerk user id is the RevenueCat app_user_id we look up.
//
// Behaviour is intentionally fail-soft:
//   - No REVENUECAT_SECRET_API_KEY configured  -> returns null  ("unknown")
//   - RevenueCat unreachable / non-200 / timeout -> returns null ("unknown")
//   - Definitive answer from RevenueCat          -> returns true | false
// The caller treats `null` as "fall back to the client header", so dev and
// any deployment without the secret keep working exactly as before, while a
// configured production deployment becomes authoritative.

const RC_ENTITLEMENT = "pro";
const RC_API_BASE = "https://api.revenuecat.com/v1";
const REQUEST_TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 60 * 1000;

type CacheEntry = { value: boolean; expiresAt: number };
const cache = new Map<string, CacheEntry>();

function getSecretKey(): string | undefined {
  return process.env.REVENUECAT_SECRET_API_KEY?.trim() || undefined;
}

/** True when server-side verification is configured and should be enforced. */
export function isRevenueCatVerificationEnabled(): boolean {
  return Boolean(getSecretKey());
}

function entitlementIsActive(entitlement: unknown): boolean {
  if (!entitlement || typeof entitlement !== "object") return false;
  const expires = (entitlement as { expires_date?: string | null }).expires_date;
  // A null expiry means a non-expiring (lifetime / sandbox) grant.
  if (expires == null) return true;
  const expiresMs = Date.parse(expires);
  return Number.isFinite(expiresMs) && expiresMs > Date.now();
}

/**
 * Returns true/false when RevenueCat gives a definitive answer for the "pro"
 * entitlement, or null when verification is disabled or could not be performed
 * (so the caller can fall back to the client-supplied header).
 */
export async function isEntitledPro(appUserId: string): Promise<boolean | null> {
  const secret = getSecretKey();
  if (!secret) return null;

  const cached = cache.get(appUserId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const res = await fetch(
      `${RC_API_BASE}/subscribers/${encodeURIComponent(appUserId)}`,
      {
        headers: {
          Authorization: `Bearer ${secret}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );

    if (!res.ok) {
      logger.warn(
        { status: res.status },
        "RevenueCat verification non-200; falling back to header",
      );
      return null;
    }

    const data = (await res.json()) as {
      subscriber?: { entitlements?: Record<string, unknown> };
    };

    const entitlement = data.subscriber?.entitlements?.[RC_ENTITLEMENT];
    const active = entitlementIsActive(entitlement);

    cache.set(appUserId, { value: active, expiresAt: Date.now() + CACHE_TTL_MS });
    return active;
  } catch (err) {
    logger.warn({ err }, "RevenueCat verification failed; falling back to header");
    return null;
  }
}
