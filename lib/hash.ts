import { createHmac } from "node:crypto";

function key(env: Record<string, string | undefined> = process.env): string {
  const value = env.ACCOUNT_HMAC_KEY;
  if (!value || value.length < 32) {
    throw new Error("ACCOUNT_HMAC_KEY must be set (at least 32 characters)");
  }
  return value;
}

/** account_hash = HMAC-SHA256(ACCOUNT_HMAC_KEY, account_id). No per-row salt, so deletion can find it. */
export function accountHash(accountId: string, env?: Record<string, string | undefined>): string {
  return createHmac("sha256", key(env)).update(accountId, "utf8").digest("hex");
}

/** Keyed hash for per-IP rate limiting; the raw IP is never stored. */
export function ipHash(ip: string, env?: Record<string, string | undefined>): string {
  return createHmac("sha256", key(env)).update(`ip:${ip}`, "utf8").digest("hex");
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}
