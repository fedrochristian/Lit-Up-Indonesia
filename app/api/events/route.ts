import { currentLearner } from "@/lib/auth/session";
import { CLIENT_EVENTS, isEventName, sanitizeEventProps } from "@/lib/events";
import { isSameOrigin, json } from "@/lib/request";
import { logEvent } from "@/lib/server-events";
import { rpc } from "@/lib/supabase/admin";

const EVENTS_PER_MINUTE = 120;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return json({ status: "forbidden" }, 403);
  const auth = await currentLearner();
  if (auth.status !== "ok") return json({ status: "unauthorized" }, 401);

  let body: { name?: unknown; props?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ status: "invalid" }, 400);
  }
  if (!isEventName(body.name) || !CLIENT_EVENTS.has(body.name)) return json({ status: "invalid" }, 400);
  const props = sanitizeEventProps(body.name, body.props);
  if (props === null) return json({ status: "invalid" }, 400);

  try {
    const allowed = await rpc<boolean>("rate_limit_hit", {
      p_scope: "events_user_min",
      p_key_hash: auth.learner.accountHash,
      p_limit: EVENTS_PER_MINUTE,
      p_window_seconds: 60,
    });
    if (!allowed) return json({ status: "rate_limited" }, 429);
  } catch {
    return json({ status: "unavailable" }, 503);
  }

  await logEvent(body.name, props, auth.learner.accountHash);
  return json({ status: "ok" });
}
