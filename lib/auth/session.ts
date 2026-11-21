import "server-only";
import { connection } from "next/server";
import { isAllowlisted, serverAllowlist } from "../allowlist";
import { accountHash } from "../hash";
import { adminClient } from "../supabase/admin";
import { serverClient, supabaseConfigured } from "../supabase/server";

export type Learner = {
  userId: string;
  email: string;
  accountHash: string;
};

export type LearnerResult =
  | { status: "ok"; learner: Learner }
  | { status: "signed_out" }
  | { status: "not_allowlisted" }
  | { status: "unconfigured" };

/**
 * Verifies the session with the Auth server and re-checks the allowlist on
 * every call, so removing an email from ALLOWLIST_EMAILS locks it out at once.
 */
export async function currentLearner(): Promise<LearnerResult> {
  await connection();
  if (!supabaseConfigured()) return { status: "unconfigured" };
  const supabase = await serverClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { status: "signed_out" };
  if (!isAllowlisted(serverAllowlist(), data.user.email)) {
    await supabase.auth.signOut();
    return { status: "not_allowlisted" };
  }
  return {
    status: "ok",
    learner: { userId: data.user.id, email: data.user.email!, accountHash: accountHash(data.user.id) },
  };
}

export async function ensureProfile(learner: Learner, pilot: boolean): Promise<void> {
  const { error } = await adminClient()
    .from("profiles")
    .upsert({ account_id: learner.userId, account_hash: learner.accountHash, pilot }, { onConflict: "account_id" });
  if (error) throw new Error(`profile upsert failed: ${error.message}`);
}
