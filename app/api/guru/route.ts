import { currentLearner } from "@/lib/auth/session";
import { capsForDb, readGuruConfig } from "@/lib/config";
import { handleGuruMessage } from "@/lib/guru/handler";
import { liveGuruDeps } from "@/lib/guru/runtime";
import { guruPromptReady } from "@/lib/guru/safety";
import { clientIp, ipHash } from "@/lib/hash";
import { isSameOrigin, json } from "@/lib/request";
import { rpc } from "@/lib/supabase/admin";

export const maxDuration = 30;

export async function GET() {
  const auth = await currentLearner();
  if (auth.status !== "ok") return json({ status: "unauthorized" }, 401);
  try {
    const config = readGuruConfig();
    const status = await rpc("guru_status", {
      p_account_hash: auth.learner.accountHash,
      p_mode: config.pilotCapsLifted ? "pilot" : "trial",
      p_caps: capsForDb(config),
      p_amount_idr: config.perCallReserveIdr,
      p_hard_stop_idr: config.monthlyBurnHardStopIdr,
    });
    const closedReason = !guruPromptReady() ? "safety_text_pending" : !process.env.GEMINI_API_KEY ? "not_configured" : null;
    return json({ status: "ok", usage: status, model: config.model, available: closedReason === null, closedReason });
  } catch {
    return json({ status: "unavailable" }, 503);
  }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ status: "forbidden" }, 403);
  const auth = await currentLearner();
  if (auth.status !== "ok") return json({ status: "unauthorized" }, 401);

  let body: { message?: unknown; history?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ status: "invalid", message: "Permintaan tidak valid." }, 400);
  }

  if (!guruPromptReady()) return json({ status: "unavailable", reason: "safety_text_pending" }, 503);

  let deps;
  try {
    deps = liveGuruDeps();
  } catch (err) {
    console.error(`[guru] closed: ${(err as Error).message}`);
    return json({ status: "unavailable" }, 503);
  }

  const outcome = await handleGuruMessage(
    {
      accountHash: auth.learner.accountHash,
      ipHash: ipHash(clientIp(request.headers)),
      message: body.message,
      history: body.history,
    },
    deps,
  );
  const httpStatus: Record<typeof outcome.status, number> = {
    ok: 200,
    provider_error: 502,
    rate_limited: 429,
    cap: 429,
    hard_stop: 503,
    invalid: 400,
    unavailable: 503,
  };
  return json(outcome, httpStatus[outcome.status]);
}
