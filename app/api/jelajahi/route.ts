import { currentLearner } from "@/lib/auth/session";
import { crashCourseSource, randomPicks } from "@/lib/jelajahi/whitelist";
import { json } from "@/lib/request";

const compact = (v: { id: string; title: string; series: string; topic: string }) => ({
  id: v.id,
  title: v.title,
  series: v.series,
  topic: v.topic,
});

export async function GET(request: Request) {
  const auth = await currentLearner();
  if (auth.status !== "ok") return json({ status: "unauthorized" }, 401);
  const params = new URL(request.url).searchParams;

  if (params.has("acak")) {
    return json({ status: "ok", videos: randomPicks(6) });
  }

  const topic = params.get("topic") ?? "";
  const videos = crashCourseSource.listVideos(topic);
  if (videos.length === 0) return json({ status: "not_found" }, 404);
  return json({ status: "ok", topic, videos: videos.map(compact) });
}
