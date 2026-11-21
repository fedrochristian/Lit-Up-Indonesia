import { currentLearner } from "@/lib/auth/session";
import { isSameOrigin, json } from "@/lib/request";
import { logEvent } from "@/lib/server-events";
import { rpc } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ status: "forbidden" }, 403);
  const auth = await currentLearner();
  if (auth.status !== "ok") return json({ status: "unauthorized" }, 401);
  try {
    const result = await rpc<{ ok: boolean; session_no?: number; guru_messages?: number }>("end_trial_session", {
      p_account_hash: auth.learner.accountHash,
    });
    if (result.ok) {
      await logEvent(
        "trial_session_end",
        { session_no: result.session_no, guru_messages: result.guru_messages },
        auth.learner.accountHash,
      );
    }
    return json({ status: "ok", ended: result.ok });
  } catch {
    return json({ status: "unavailable" }, 503);
  }
}
