import { isAllowlisted, isValidEmail, normalizeEmail, type Allowlist } from "../allowlist";

/** Same text whether or not the email is allowlisted, so the form leaks nothing. */
export const NEUTRAL_MESSAGE =
  "Kalau emailmu terdaftar sebagai peserta uji, tautan masuk sudah dikirim. Cek kotak masuk (dan folder spam).";
export const INVALID_EMAIL_MESSAGE = "Format email belum benar.";
export const RATE_LIMITED_MESSAGE = "Terlalu sering mencoba. Tunggu sebentar, lalu coba lagi.";

export type MagicLinkDeps = {
  allowlist: Allowlist;
  redirectTo: string;
  /** Returns false when this client has requested too many links. */
  rateLimit: () => Promise<boolean>;
  sendOtp: (email: string, options: { shouldCreateUser: boolean; emailRedirectTo: string }) => Promise<{ error: string | null }>;
  logEvent: (name: "auth_link_requested" | "auth_denied", props: Record<string, unknown>) => Promise<void>;
  logError: (message: string) => void;
};

export type MagicLinkResult = {
  status: "sent_or_denied" | "invalid" | "rate_limited";
  message: string;
  /** Server-side only; never shown to the visitor. */
  sent: boolean;
};

/**
 * Server-side allowlist gate before Supabase sends anything. A non-allowlisted
 * email never reaches signInWithOtp, and the before-user-created hook blocks
 * account creation for it as a second line.
 */
export async function requestMagicLink(rawEmail: unknown, deps: MagicLinkDeps): Promise<MagicLinkResult> {
  const email = typeof rawEmail === "string" ? normalizeEmail(rawEmail) : "";
  if (!isValidEmail(email)) {
    return { status: "invalid", message: INVALID_EMAIL_MESSAGE, sent: false };
  }
  if (!(await deps.rateLimit())) {
    return { status: "rate_limited", message: RATE_LIMITED_MESSAGE, sent: false };
  }

  const allowed = isAllowlisted(deps.allowlist, email);
  await deps.logEvent("auth_link_requested", { allowlisted: allowed });

  if (!allowed) {
    await deps.logEvent("auth_denied", { reason: "not_allowlisted" });
    return { status: "sent_or_denied", message: NEUTRAL_MESSAGE, sent: false };
  }

  const { error } = await deps.sendOtp(email, { shouldCreateUser: true, emailRedirectTo: deps.redirectTo });
  if (error) {
    deps.logError(`magic link send failed: ${error}`);
    return { status: "sent_or_denied", message: NEUTRAL_MESSAGE, sent: false };
  }
  return { status: "sent_or_denied", message: NEUTRAL_MESSAGE, sent: true };
}
