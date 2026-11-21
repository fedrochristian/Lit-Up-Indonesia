import { createHash } from "node:crypto";

export const MAX_ALLOWLIST = 13;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

export type Allowlist = { ok: true; emails: ReadonlySet<string> } | { ok: false; error: string };

/**
 * Parses ALLOWLIST_EMAILS (comma, semicolon or whitespace separated).
 * Any malformed entry or more than 13 accounts fails closed: nobody is allowed.
 */
export function parseAllowlist(raw: string | undefined): Allowlist {
  const entries = (raw ?? "")
    .split(/[\s,;]+/)
    .map(normalizeEmail)
    .filter(Boolean);
  if (entries.length === 0) return { ok: false, error: "ALLOWLIST_EMAILS is empty" };
  const bad = entries.filter((e) => !isValidEmail(e));
  if (bad.length > 0) return { ok: false, error: `ALLOWLIST_EMAILS has ${bad.length} malformed entr${bad.length === 1 ? "y" : "ies"}` };
  const emails = new Set(entries);
  if (emails.size > MAX_ALLOWLIST) {
    return { ok: false, error: `ALLOWLIST_EMAILS has ${emails.size} accounts; the pilot cap is ${MAX_ALLOWLIST}` };
  }
  return { ok: true, emails };
}

export function isAllowlisted(allowlist: Allowlist, email: string | null | undefined): boolean {
  if (!allowlist.ok || !email) return false;
  return allowlist.emails.has(normalizeEmail(email));
}

/** Same digest the before-user-created hook computes in SQL. */
export function emailSha256(email: string): string {
  return createHash("sha256").update(normalizeEmail(email), "utf8").digest("hex");
}

export function serverAllowlist(): Allowlist {
  return parseAllowlist(process.env.ALLOWLIST_EMAILS);
}
