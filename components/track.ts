"use client";

type ClientEvent =
  | { name: "tab_view"; props: { tab: string; tab_index: number } }
  | { name: "embed_play"; props: { video_id: string } }
  | { name: "embed_error"; props: { video_id: string; code: number } }
  | { name: "plan_view"; props?: Record<string, never> }
  | { name: "komunitas_preview_view"; props?: Record<string, never> };

/** Fire-and-forget; the server validates names and props again. */
export function track(event: ClientEvent): void {
  try {
    void fetch("/api/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: event.name, props: event.props ?? {} }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Analytics never blocks the learner.
  }
}
