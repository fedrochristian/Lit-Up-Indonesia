import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowlisted, serverAllowlist } from "@/lib/allowlist";
import { ensureProfile } from "@/lib/auth/session";
import { readGuruConfig } from "@/lib/config";
import { accountHash } from "@/lib/hash";
import { logEvent } from "@/lib/server-events";
import { serverClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["email", "magiclink", "signup", "invite"];

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const to = (path: string) => {
    const target = url.clone();
    target.pathname = path.split("?")[0];
    target.search = path.includes("?") ? `?${path.split("?")[1]}` : "";
    return NextResponse.redirect(target);
  };

  const supabase = await serverClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  let verifyError: string | null = "missing token";
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    verifyError = error?.message ?? null;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    verifyError = error?.message ?? null;
  }
  if (verifyError) {
    console.error(`[auth] confirm failed: ${verifyError}`);
    return to("/masuk?galat=tautan");
  }

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user || !isAllowlisted(serverAllowlist(), user.email)) {
    await supabase.auth.signOut();
    await logEvent("auth_denied", { reason: "not_allowlisted" }, null);
    return to("/masuk?galat=akses");
  }

  const hash = accountHash(user.id);
  try {
    let pilot = false;
    try {
      pilot = readGuruConfig().pilotCapsLifted;
    } catch {
      // Guruku config errors close Guruku, not sign-in.
    }
    await ensureProfile({ userId: user.id, email: user.email!, accountHash: hash }, pilot);
  } catch (err) {
    console.error(`[auth] ${(err as Error).message}`);
  }
  await logEvent("auth_signed_in", {}, hash);
  return to("/");
}
