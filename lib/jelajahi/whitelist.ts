import whitelist from "@/data/jelajahi-crashcourse-whitelist-20261121.json";
import g5Excluded from "@/data/jelajahi-g5-excluded.json";

export type JelajahiVideo = {
  id: string;
  title: string;
  topic: string;
  series: string;
};

export type JelajahiTopic = { name: string; slug: string; count: number; series: string[] };

/**
 * Source abstraction for Jelajahi. Sunday ships only the CrashCourse whitelist.
 * A later YouTube-wide educational search provider plugs in as another
 * VideoSource, with this whitelist kept as the default and fallback.
 */
export interface VideoSource {
  readonly id: string;
  readonly label: string;
  listTopics(): JelajahiTopic[];
  listVideos(topicSlug: string): JelajahiVideo[];
  hasVideo(videoId: string): boolean;
  getVideo(videoId: string): JelajahiVideo | undefined;
}

type RawVideo = { topic: string; series: string; video_id: string; title: string };

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function createWhitelistSource(raw: { videos: RawVideo[] }, excludedIds: ReadonlySet<string> = new Set()): VideoSource {
  const videos: JelajahiVideo[] = raw.videos.filter((v) => !excludedIds.has(v.video_id)).map((v) => ({
    id: v.video_id,
    title: v.title,
    topic: v.topic,
    series: v.series,
  }));
  const byId = new Map(videos.map((v) => [v.id, v]));
  const byTopic = new Map<string, JelajahiVideo[]>();
  for (const v of videos) {
    const slug = slugify(v.topic);
    const list = byTopic.get(slug) ?? [];
    list.push(v);
    byTopic.set(slug, list);
  }
  const topics: JelajahiTopic[] = [...byTopic.entries()]
    .map(([slug, list]) => ({
      name: list[0].topic,
      slug,
      count: list.length,
      series: [...new Set(list.map((v) => v.series))],
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    id: "crashcourse-whitelist",
    label: "Crash Course (kanal resmi @crashcourse)",
    listTopics: () => topics,
    listVideos: (slug) => byTopic.get(slug) ?? [],
    hasVideo: (id) => byId.has(id),
    getVideo: (id) => byId.get(id),
  };
}

export const G5_EXCLUDED_IDS: ReadonlySet<string> = new Set(g5Excluded.excluded.map((e) => e.video_id));

export const crashCourseSource: VideoSource = createWhitelistSource(whitelist as { videos: RawVideo[] }, G5_EXCLUDED_IDS);

export const WHITELIST_META = {
  version: (whitelist as { version: string }).version,
  listed: (whitelist as { videos: unknown[] }).videos.length,
  total: (whitelist as { videos: unknown[] }).videos.length - G5_EXCLUDED_IDS.size,
  channelId: (whitelist as { official_channel: { channel_id: string } }).official_channel.channel_id,
};

export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/** Picks n distinct videos spread across topics, deterministic for a given seed. */
export function sampleAcrossTopics(source: VideoSource, n: number, seed: number): JelajahiVideo[] {
  let state = seed >>> 0 || 1;
  const rand = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  const topics = [...source.listTopics()];
  for (let i = topics.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [topics[i], topics[j]] = [topics[j], topics[i]];
  }
  return topics.slice(0, n).map((t) => {
    const list = source.listVideos(t.slug);
    return list[Math.floor(rand() * list.length)];
  });
}

export function randomPicks(n = 6): { id: string; title: string; series: string; topic: string }[] {
  return sampleAcrossTopics(crashCourseSource, n, Math.floor(Math.random() * 2 ** 31)).map((v) => ({
    id: v.id,
    title: v.title,
    series: v.series,
    topic: v.topic,
  }));
}
