import { currentLearner } from "@/lib/auth/session";
import { capsForDb, readGuruConfig } from "@/lib/config";
import { crashCourseSource } from "@/lib/jelajahi/whitelist";
import { json } from "@/lib/request";
import { adminClient, rpc } from "@/lib/supabase/admin";

/** Read-only learning trace: videos started in Jelajahi plus Guruku usage. */
export async function GET() {
  const auth = await currentLearner();
  if (auth.status !== "ok") return json({ status: "unauthorized" }, 401);
  try {
    const { data, error } = await adminClient()
      .from("events")
      .select("ts, props")
      .eq("account_hash", auth.learner.accountHash)
      .eq("name", "embed_play")
      .order("ts", { ascending: false })
      .limit(100);
    if (error) throw error;

    const seen = new Set<string>();
    const watched: { id: string; title: string; topic: string; series: string; ts: string }[] = [];
    for (const row of data ?? []) {
      const id = (row.props as { video_id?: string }).video_id;
      const video = id ? crashCourseSource.getVideo(id) : undefined;
      if (!video || seen.has(video.id)) continue;
      seen.add(video.id);
      watched.push({ ...video, ts: row.ts as string });
      if (watched.length >= 12) break;
    }

    const config = readGuruConfig();
    const usage = await rpc("guru_status", {
      p_account_hash: auth.learner.accountHash,
      p_mode: config.pilotCapsLifted ? "pilot" : "trial",
      p_caps: capsForDb(config),
      p_amount_idr: config.perCallReserveIdr,
      p_hard_stop_idr: config.monthlyBurnHardStopIdr,
    });
    return json({ status: "ok", watched, usage });
  } catch {
    return json({ status: "unavailable" }, 503);
  }
}
