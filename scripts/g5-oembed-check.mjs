#!/usr/bin/env node
// G5 automated check: requests YouTube oEmbed for every whitelist ID, confirms
// the author is the official @crashcourse channel, writes a JSON report, and
// prints 20 random IDs for the manual playback sample (one authorized adult,
// on the exact candidate URL/SHA; record errors 100, 101/150, 153).
//
// Usage: node scripts/g5-oembed-check.mjs [--concurrency 8] [--seed 20261122] [--out docs/qa/g5-oembed-report.json]
// Exit code 1 if any ID fails.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => (cur.startsWith("--") ? [...acc, [cur.slice(2), all[i + 1]]] : acc), []),
);
const CONCURRENCY = Number(args.concurrency ?? 8);
const SEED = Number(args.seed ?? Date.now() % 2 ** 31);
const OUT = args.out ?? "docs/qa/g5-oembed-report.json";
const WHITELIST = "data/jelajahi-crashcourse-whitelist-20261121.json";
const OFFICIAL_AUTHOR = /^https:\/\/www\.youtube\.com\/(@crashcourse|channel\/UCX6b17PVsYBQ0ip5gyeme-Q)\/?$/i;

const whitelist = JSON.parse(await readFile(WHITELIST, "utf8"));
const videos = whitelist.videos;

async function check(video, attempt = 1) {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${video.video_id}`)}&format=json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 4) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        return check(video, attempt + 1);
      }
    }
    if (!res.ok) return { id: video.video_id, http: res.status, ok: false, reason: `http_${res.status}` };
    const body = await res.json();
    const official = OFFICIAL_AUTHOR.test(body.author_url ?? "");
    return {
      id: video.video_id,
      http: res.status,
      ok: official,
      reason: official ? null : `author ${body.author_url}`,
      author_url: body.author_url,
    };
  } catch (err) {
    if (attempt < 4) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      return check(video, attempt + 1);
    }
    return { id: video.video_id, http: 0, ok: false, reason: `network ${err.message}` };
  }
}

const results = new Array(videos.length);
let next = 0;
let done = 0;
const started = Date.now();
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (next < videos.length) {
      const i = next++;
      results[i] = await check(videos[i]);
      done++;
      if (done % 200 === 0) process.stderr.write(`  ${done}/${videos.length}\n`);
    }
  }),
);

let state = SEED >>> 0 || 1;
const rand = () => ((state = (state * 1664525 + 1013904223) >>> 0), state / 2 ** 32);
const pool = videos.map((v) => v);
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}
const sample = pool.slice(0, 20).map((v) => ({ video_id: v.video_id, topic: v.topic, title: v.title, url: v.url }));

const failures = results.filter((r) => !r.ok);
const report = {
  check: "G5 oEmbed (automated) — LEO-QA-PROPOSAL LU-G5-EMBED-SMOKE-20261121",
  whitelist_file: WHITELIST,
  whitelist_version: whitelist.version,
  ran_at_utc: new Date().toISOString(),
  duration_s: Math.round((Date.now() - started) / 1000),
  total: videos.length,
  passed: videos.length - failures.length,
  failed: failures.length,
  failures,
  note: "oEmbed 200 with the official author shows the video is public and the owner did not disable oEmbed. It does not prove in-page playback on the candidate host; that is the manual sample below.",
  manual_sample_seed: SEED,
  manual_sample: sample,
};
await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(report, null, 2) + "\n");

console.log(`G5 oEmbed: ${report.passed}/${report.total} passed, ${report.failed} failed (${report.duration_s}s). Report: ${OUT}`);
for (const f of failures) console.log(`  FAIL ${f.id} ${f.reason}`);
console.log(`\nManual playback sample (seed ${SEED}) — play each in Jelajahi on the candidate URL and record any error code:`);
sample.forEach((s, i) => console.log(`${String(i + 1).padStart(2)}. ${s.video_id}  [${s.topic}] ${s.title}`));
process.exit(failures.length ? 1 : 0);
