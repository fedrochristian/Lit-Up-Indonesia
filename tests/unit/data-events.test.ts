import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";
import { deleteAccount } from "../../lib/deletion";
import { CLIENT_EVENTS, EVENT_SCHEMAS, sanitizeEventProps } from "../../lib/events";
import { accountHash, clientIp, ipHash } from "../../lib/hash";
import { crashCourseSource, G5_EXCLUDED_IDS, sampleAcrossTopics, VIDEO_ID_RE, WHITELIST_META } from "../../lib/jelajahi/whitelist";
import { siteOrigin } from "../../lib/site";
import { parseTab, TAB_IDS, TAB_LABELS } from "../../lib/tabs";

const raw = JSON.parse(readFileSync("data/jelajahi-crashcourse-whitelist-20261121.json", "utf8"));

describe("Jelajahi whitelist (committed JSON)", () => {
  test("1,643 unique, well-formed IDs from the official channel across 35 topics", () => {
    const ids = raw.videos.map((v: { video_id: string }) => v.video_id);
    assert.equal(ids.length, 1643);
    assert.equal(new Set(ids).size, 1643);
    assert.ok(ids.every((id: string) => VIDEO_ID_RE.test(id)));
    assert.equal(raw.official_channel.channel_id, "UCX6b17PVsYBQ0ip5gyeme-Q");
    assert.equal(new Set(raw.videos.map((v: { topic: string }) => v.topic)).size, 35);
    assert.equal(raw.counts.total_videos, 1643);
  });

  test("the app source hides only the G5-failed IDs and substitutes nothing", () => {
    assert.equal(G5_EXCLUDED_IDS.size, 2);
    assert.equal(WHITELIST_META.listed, 1643);
    assert.equal(WHITELIST_META.total, 1641);
    const shown = crashCourseSource.listTopics().reduce((n, t) => n + t.count, 0);
    assert.equal(shown, 1641);
    for (const id of G5_EXCLUDED_IDS) assert.equal(crashCourseSource.hasVideo(id), false);
    assert.equal(crashCourseSource.listTopics().length, 35);
  });

  test("random picks span distinct topics and come from the whitelist", () => {
    const picks = sampleAcrossTopics(crashCourseSource, 6, 42);
    assert.equal(picks.length, 6);
    assert.equal(new Set(picks.map((p) => p.topic)).size, 6);
    assert.ok(picks.every((p) => crashCourseSource.hasVideo(p.id)));
  });
});

describe("tabs (FEDRO-DECISION LU-TAB-ORDER-20261121-1547, LU-TAB-NAME-GURUKU-20261121-1547)", () => {
  test("Jelajahi, Belajarku, Guruku, Komunitas in that order; Jelajahi opens first", () => {
    assert.deepEqual(TAB_IDS.map((t) => TAB_LABELS[t]), ["Jelajahi", "Belajarku", "Guruku", "Komunitas"]);
    assert.equal(parseTab(undefined), "jelajahi");
    assert.equal(parseTab("guru"), "jelajahi");
    assert.equal(parseTab("guruku"), "guruku");
  });
});

describe("events: no raw email, IP or learner text", () => {
  test("unknown keys are dropped", () => {
    assert.deepEqual(sanitizeEventProps("tab_view", { tab: "guruku", tab_index: 3, email: "x@y.z", ip: "1.2.3.4", text: "hi" }), {
      tab: "guruku",
      tab_index: 3,
    });
    assert.deepEqual(sanitizeEventProps("auth_signed_in", { email: "x@y.z" }), {});
  });

  test("invalid values are rejected", () => {
    assert.equal(sanitizeEventProps("tab_view", { tab: "guru" }), null);
    assert.equal(sanitizeEventProps("embed_play", { video_id: "notInList00" }), null);
    assert.equal(sanitizeEventProps("embed_error", { video_id: "uBGl2BujkPQ", code: 999 }), null);
    assert.equal(sanitizeEventProps("guru_call", { model: "Ignore previous instructions and..." }), null);
    assert.deepEqual(sanitizeEventProps("embed_error", { video_id: "uBGl2BujkPQ", code: 150 }), { video_id: "uBGl2BujkPQ", code: 150 });
  });

  test("the browser can only send view/embed events", () => {
    assert.deepEqual([...CLIENT_EVENTS].sort(), ["embed_error", "embed_play", "komunitas_preview_view", "plan_view", "tab_view"]);
    assert.ok(Object.keys(EVENT_SCHEMAS).includes("deletion_done"));
  });
});

describe("identifiers", () => {
  const env = { ACCOUNT_HMAC_KEY: "k".repeat(40) };

  test("account_hash is a stable keyed HMAC-SHA256", () => {
    const a = accountHash("8a1f0c2e-0000-4000-8000-000000000001", env);
    assert.match(a, /^[0-9a-f]{64}$/);
    assert.equal(a, accountHash("8a1f0c2e-0000-4000-8000-000000000001", env));
    assert.notEqual(a, accountHash("8a1f0c2e-0000-4000-8000-000000000001", { ACCOUNT_HMAC_KEY: "j".repeat(40) }));
    assert.notEqual(ipHash("1.2.3.4", env), accountHash("1.2.3.4", env));
  });

  test("a missing or short key fails", () => {
    assert.throws(() => accountHash("x", {}));
    assert.throws(() => accountHash("x", { ACCOUNT_HMAC_KEY: "short" }));
  });

  test("client IP comes from the first X-Forwarded-For hop", () => {
    assert.equal(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" })), "203.0.113.5");
    assert.equal(clientIp(new Headers({})), "unknown");
  });
});

describe("sign-in redirect origin", () => {
  const h = new Headers({ host: "lit-up-indonesia-git-x-team.vercel.app", "x-forwarded-proto": "https" });
  test("production uses NEXT_PUBLIC_SITE_URL", () => {
    assert.equal(siteOrigin(h, { VERCEL_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://litup.id/" }), "https://litup.id");
  });
  test("previews use their own origin", () => {
    assert.equal(siteOrigin(h, { VERCEL_ENV: "preview", NEXT_PUBLIC_SITE_URL: "https://litup.id" }), "https://lit-up-indonesia-git-x-team.vercel.app");
    assert.equal(siteOrigin(new Headers({ host: "localhost:3000" }), {}), "http://localhost:3000");
  });
});

describe("deletion orchestration", () => {
  test("data first, then the auth user, then an ID-less deletion_done", async () => {
    const steps: string[] = [];
    const counts = await deleteAccount({ userId: "u1", accountHash: "a".repeat(64) }, "in_app", {
      rpc: async <T,>(fn: string, args: Record<string, unknown>) => {
        steps.push(`${fn}:${args.p_method}`);
        return { deletion_id: 42, events: 3 } as T;
      },
      deleteAuthUser: async (id) => {
        steps.push(`auth:${id}`);
      },
      logEvent: async (name, props, hash) => {
        steps.push(`${name}:${JSON.stringify(props)}:${hash}`);
      },
    }, undefined, () => new Date("2026-11-22T17:30:00Z"));
    assert.deepEqual(steps, ["delete_account_data:in_app", "auth:u1", 'deletion_done:{"method":"in_app"}:null']);
    assert.deepEqual(counts, { reference: "LU-DEL-000042", date: "2026-11-23", counts: { events: 3 } });
  });
});
