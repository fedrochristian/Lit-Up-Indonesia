"use server";

import { headers } from "next/headers";
import { serverAllowlist } from "@/lib/allowlist";
import { requestMagicLink, type MagicLinkResult } from "@/lib/auth/magic-link";
import { clientIp, ipHash } from "@/lib/hash";
import { logEvent } from "@/lib/server-events";
import { siteOrigin } from "@/lib/site";
import { rpc } from "@/lib/supabase/admin";
import { serverClient, supabaseConfigured } from "@/lib/supabase/server";

export type SignInState = { status: "idle" } | Pick<MagicLinkResult, "status" | "message">;

export async function requestSignInLink(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (!supabaseConfigured()) {
    return { status: "invalid", message: "Lit Up belum terhubung ke layanan masuk. Hubungi tim." };
  }
  const allowlist = serverAllowlist();
  if (!allowlist.ok) console.error(`[auth] allowlist rejected, failing closed: ${allowlist.error}`);

  const h = await headers();
  const supabase = await serverClient();
  const result = await requestMagicLink(formData.get("email"), {
    allowlist,
    redirectTo: `${siteOrigin(h)}/auth/confirm`,
    rateLimit: async () => {
      try {
        return await rpc<boolean>("rate_limit_hit", {
          p_scope: "magic_link_ip",
          p_key_hash: ipHash(clientIp(h)),
          p_limit: 5,
          p_window_seconds: 600,
        });
      } catch {
        return false;
      }
    },
    sendOtp: async (email, options) => {
      const { error } = await supabase.auth.signInWithOtp({ email, options });
      return { error: error?.message ?? null };
    },
    logEvent: (name, props) => logEvent(name, props, null),
    logError: (message) => console.error(`[auth] ${message}`),
  });
  return { status: result.status, message: result.message };
}
