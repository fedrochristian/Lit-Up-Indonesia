import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { CAPS, call, createTestDb, hash, reset, skip, type TestDb } from "./helpers";

const HARD_STOP = 5_000_000;
type Admit = {
  ok: boolean;
  reason?: string;
  cap?: string;
  kind?: string;
  mode?: string;
  session_no?: number;
  session_started?: boolean;
  session_ended?: boolean;
  used?: number;
  limit?: number;
  closed_sessions?: { session_no: number; guru_messages: number }[];
};

let db: TestDb;
let seq = 0;

const at = (iso: string, plusSeconds = 0) => new Date(new Date(iso).getTime() + plusSeconds * 1000).toISOString();

function admit(account: string, now: string, mode: "trial" | "pilot" = "trial", caps = CAPS) {
  seq += 1;
  return call<Admit>(db, "admit_guru_call", [`req-${seq}`, account, mode, JSON.stringify(caps), 100, HARD_STOP, now]);
}

describe("Guruku caps (admit_guru_call)", { skip }, () => {
  before(async () => {
    db = await createTestDb();
  });
  after(async () => {
    await db?.close();
  });
  beforeEach(async () => {
    await reset(db);
  });

  test("trial: 14 messages per session x 2 sessions, then 5 short responses per month, then refused", async () => {
    const a = hash(1);
    const t0 = "2026-11-22T06:00:00Z";
    const results: Admit[] = [];
    for (let i = 0; i < 28 + 5 + 1; i++) results.push(await admit(a, at(t0, i * 20)));

    const s1 = results.slice(0, 14);
    assert.ok(s1.every((r) => r.ok && r.mode === "trial" && r.session_no === 1 && r.kind === "normal"));
    assert.equal(s1[0].session_started, true);
    assert.deepEqual(s1.map((r) => r.used), Array.from({ length: 14 }, (_, i) => i + 1));
    assert.equal(s1[13].session_ended, true);
    assert.ok(s1.slice(0, 13).every((r) => r.session_ended === false));

    const s2 = results.slice(14, 28);
    assert.ok(s2.every((r) => r.ok && r.session_no === 2));
    assert.equal(s2[0].session_started, true);
    assert.equal(s2[13].session_ended, true);

    const free = results.slice(28, 33);
    assert.ok(free.every((r) => r.ok && r.mode === "free" && r.kind === "short" && r.limit === 5));
    assert.deepEqual(free.map((r) => r.used), [1, 2, 3, 4, 5]);

    assert.deepEqual([results[33].ok, results[33].reason, results[33].cap], [false, "cap", "free_monthly"]);

    const { rows } = await db.pool.query(`select kind, count(*)::int n from public.spend_ledger group by kind order by kind`);
    assert.deepEqual(rows, [
      { kind: "free_short", n: 5 },
      { kind: "trial", n: 28 },
    ]);
  });

  test("retries count: every admitted call is one message, whatever the provider outcome", async () => {
    const a = hash(2);
    const t0 = "2026-11-22T06:00:00Z";
    const r1 = await admit(a, t0);
    await call(db, "release_spend", [`req-${seq}`, t0]);
    const r2 = await admit(a, at(t0, 5));
    assert.deepEqual([r1.used, r2.used], [1, 2]);
  });

  test("free short responses reset at 00:00 WIB on the 1st", async () => {
    const a = hash(3);
    const t0 = "2026-11-25T03:00:00Z";
    for (let i = 0; i < 28; i++) await admit(a, at(t0, i * 10));
    for (let i = 0; i < 5; i++) assert.equal((await admit(a, at(t0, 600 + i))).ok, true);
    assert.equal((await admit(a, "2026-11-30T16:59:59Z")).cap, "free_monthly");
    const dec = await admit(a, "2026-11-30T17:00:00Z");
    assert.deepEqual([dec.ok, dec.mode, dec.used], [true, "free", 1]);
  });

  test("a session closes after 30 idle minutes; the next message starts session 2", async () => {
    const a = hash(4);
    const t0 = "2026-11-22T06:00:00Z";
    for (let i = 0; i < 5; i++) await admit(a, at(t0, i));
    const stillOpen = await admit(a, at(t0, 4 + 29 * 60));
    assert.equal(stillOpen.session_no, 1);
    const next = await admit(a, at(t0, 4 + 29 * 60 + 30 * 60));
    assert.equal(next.session_no, 2);
    assert.equal(next.session_started, true);
    assert.deepEqual(next.closed_sessions, [{ session_no: 1, guru_messages: 6 }]);
  });

  test("'Akhiri sesi' ends the open session; ending twice is a no-op", async () => {
    const a = hash(5);
    await admit(a, "2026-11-22T06:00:00Z");
    const ended = await call<{ ok: boolean; session_no: number; guru_messages: number }>(db, "end_trial_session", [a, "2026-11-22T06:01:00Z"]);
    assert.deepEqual([ended.ok, ended.session_no, ended.guru_messages], [true, 1, 1]);
    assert.equal((await call<{ ok: boolean }>(db, "end_trial_session", [a, "2026-11-22T06:02:00Z"])).ok, false);
    assert.equal((await admit(a, "2026-11-22T06:03:00Z")).session_no, 2);
  });

  test("parallel tabs cannot overrun the 14-message session cap", async () => {
    const a = hash(6);
    const t0 = "2026-11-22T06:00:00Z";
    await admit(a, t0);
    const caps = { ...CAPS, trial_sessions: 1 };
    const results = await Promise.all(Array.from({ length: 30 }, () => admit(a, at(t0, 1), "trial", caps)));
    const trialOk = results.filter((r) => r.ok && r.mode === "trial").length;
    const freeOk = results.filter((r) => r.ok && r.mode === "free").length;
    assert.equal(trialOk, 13);
    assert.equal(freeOk, 5);
    assert.equal(results.filter((r) => !r.ok && r.cap === "free_monthly").length, 12);
  });

  test("hard stop refusal does not consume a message", async () => {
    const a = hash(7);
    await db.pool.query(`insert into public.spend_month (month_start, settled_idr) values ('2026-11-01', $1)`, [HARD_STOP]);
    const r = await admit(a, "2026-11-22T06:00:00Z");
    assert.deepEqual([r.ok, r.reason], [false, "hard_stop"]);
    const { rows } = await db.pool.query(`select count(*)::int n from public.trial_sessions`);
    assert.equal(rows[0].n, 0);
  });

  test("pilot flag: 100 messages per WIB day, resets at 00:00 WIB", async () => {
    const a = hash(8);
    const t0 = "2026-11-22T06:00:00Z";
    for (let i = 0; i < 100; i++) {
      const r = await admit(a, at(t0, i), "pilot");
      assert.ok(r.ok && r.mode === "pilot");
    }
    const over = await admit(a, "2026-11-22T16:59:59Z", "pilot");
    assert.deepEqual([over.ok, over.cap, over.used, over.limit], [false, "pilot_daily", 100, 100]);
    const nextDay = await admit(a, "2026-11-22T17:00:00Z", "pilot");
    assert.deepEqual([nextDay.ok, nextDay.used], [true, 1]);
    const { rows } = await db.pool.query(`select kind, count(*)::int n from public.spend_ledger group by kind order by kind`);
    assert.deepEqual(rows, [{ kind: "pilot", n: 73 }, { kind: "pilot_trial", n: 28 }]);
  });

  test("pilot flag: the first trial-sized 28 calls feed Metric 4 as one trial unit", async () => {
    for (const [n, who, cost] of [[30, hash(10), 50], [5, hash(11), 40]] as const) {
      for (let i = 0; i < n; i++) {
        seq += 1;
        await call(db, "admit_guru_call", [`m4-${seq}`, who, "pilot", JSON.stringify(CAPS), 100, HARD_STOP, at("2026-11-22T06:00:00Z", i)]);
        await call(db, "settle_spend", [`m4-${seq}`, cost, null, null, null, null, 4_000_000, at("2026-11-22T06:00:00Z", i)]);
      }
    }
    // A replayed request keeps its original kind and is not counted twice.
    await call(db, "admit_guru_call", [`m4-${seq}`, hash(11), "pilot", JSON.stringify(CAPS), 100, HARD_STOP, "2026-11-22T06:10:00Z"]);
    const m4 = await call<{ trials: number; max_idr: number }>(db, "metric4_trial_cost", []);
    assert.equal(m4.trials, 2);
    assert.equal(Number(m4.max_idr), 28 * 50);
  });

  test("guru_status reports remaining quota without changing it", async () => {
    const a = hash(9);
    await admit(a, "2026-11-22T06:00:00Z");
    const args = [a, "trial", JSON.stringify(CAPS), 100, HARD_STOP, "2026-11-22T06:01:00Z"];
    const s = await call<Record<string, unknown>>(db, "guru_status", args);
    assert.deepEqual(
      [s.mode, s.session_no, s.session_open, s.used, s.limit, s.sessions_used, s.hard_stop],
      ["trial", 1, true, 1, 14, 1, false],
    );
    assert.deepEqual(await call(db, "guru_status", args), s);
  });

  test("a bad mode or missing caps fail loudly", async () => {
    await assert.rejects(call(db, "admit_guru_call", ["x1", hash(1), "free", "{}", 100, HARD_STOP, "2026-11-22T06:00:00Z"]), /unknown mode/);
    await assert.rejects(call(db, "admit_guru_call", ["x2", hash(1), "trial", "{}", 100, HARD_STOP, "2026-11-22T06:00:00Z"]), /trial caps required/);
  });
});

describe("rate_limit_hit", { skip }, () => {
  before(async () => {
    db = await createTestDb();
  });
  after(async () => {
    await db?.close();
  });
  beforeEach(async () => {
    await reset(db);
  });

  test("6 per minute per user; the 7th in the same window is refused; next window resets", async () => {
    const t0 = "2026-11-22T06:00:05Z";
    const hits: boolean[] = [];
    for (let i = 0; i < 7; i++) hits.push(await call<boolean>(db, "rate_limit_hit", ["guru_user_min", hash(1), 6, 60, at(t0, i)]));
    assert.deepEqual(hits, [true, true, true, true, true, true, false]);
    assert.equal(await call<boolean>(db, "rate_limit_hit", ["guru_user_min", hash(1), 6, 60, "2026-11-22T06:01:00Z"]), true);
    assert.equal(await call<boolean>(db, "rate_limit_hit", ["guru_user_min", hash(2), 6, 60, at(t0, 10)]), true);
  });
});
