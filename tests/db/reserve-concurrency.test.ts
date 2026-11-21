/**
 * Required pre-deploy check: parallel reserve_spend calls must never push
 * settled + outstanding spend past the hard stop. Every scenario uses separate
 * connections so the requests really race in Postgres.
 *
 * `npm run check:concurrency` runs this file and writes the evidence log to
 * docs/qa/reserve-concurrency-log.json (CONCURRENCY_LOG overrides the path).
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, describe, test } from "node:test";
import pg from "pg";
import { CAPS, createTestDb, hash, reset, skip, type TestDb } from "./helpers";

const HARD_STOP = 5_000_000;
const NOV = "2026-11-22T07:00:00Z";
const MONTH = "2026-11-01";

type Reserve = { ok: boolean; reason?: string };
type Scenario = {
  name: string;
  connections: number;
  attempts: number;
  admitted: number;
  refused_hard_stop: number;
  other: number;
  cap_idr: number;
  start_total_idr: number;
  end_total_idr: number;
  max_observed_total_idr: number;
  ledger_matches_month: boolean;
  passed: boolean;
};

const log: Scenario[] = [];
let db: TestDb;

async function clients(n: number): Promise<pg.Client[]> {
  const list = Array.from({ length: n }, () => new pg.Client({ connectionString: db.url }));
  await Promise.all(list.map((c) => c.connect()));
  return list;
}

async function monthTotal(): Promise<number> {
  const { rows } = await db.pool.query(`select coalesce(sum(settled_idr + outstanding_idr), 0)::bigint t from public.spend_month where month_start = $1`, [MONTH]);
  return Number(rows[0].t);
}

async function ledgerMatchesMonth(seeded: number): Promise<boolean> {
  const { rows } = await db.pool.query(
    `select
       (select coalesce(sum(case when status = 'settled' then settled_idr else 0 end), 0) from public.spend_ledger where month_start = $1)::bigint as led_settled,
       (select coalesce(sum(case when status = 'reserved' then reserved_idr else 0 end), 0) from public.spend_ledger where month_start = $1)::bigint as led_outstanding,
       m.settled_idr::bigint as settled, m.outstanding_idr::bigint as outstanding
     from public.spend_month m where m.month_start = $1`,
    [MONTH],
  );
  const r = rows[0];
  return Number(r.led_settled) + seeded === Number(r.settled) && Number(r.led_outstanding) === Number(r.outstanding);
}

/** Samples the committed month total while the race runs. */
function monitor() {
  let max = 0;
  let running = true;
  const loop = (async () => {
    while (running) {
      max = Math.max(max, await monthTotal());
      await new Promise((r) => setTimeout(r, 2));
    }
  })();
  return async () => {
    running = false;
    await loop;
    return Math.max(max, await monthTotal());
  };
}

async function race(opts: {
  name: string;
  seeded: number;
  connections: number;
  jobs: ((c: pg.Client) => Promise<Reserve>)[];
  cap?: number;
}): Promise<Scenario> {
  const cap = opts.cap ?? HARD_STOP;
  await db.pool.query(`insert into public.spend_month (month_start, settled_idr) values ($1, $2)`, [MONTH, opts.seeded]);
  const conns = await clients(opts.connections);
  const stop = monitor();
  let results: Reserve[];
  try {
    // Each connection works through its share of the jobs; all connections start together.
    const queues = conns.map((c, i) => opts.jobs.filter((_, j) => j % conns.length === i).map((job) => () => job(c)));
    const perConn = await Promise.all(
      queues.map(async (q) => {
        const out: Reserve[] = [];
        for (const run of q) out.push(await run());
        return out;
      }),
    );
    results = perConn.flat();
  } finally {
    await Promise.all(conns.map((c) => c.end()));
  }
  const maxObserved = await stop();
  const end = await monthTotal();
  const s: Scenario = {
    name: opts.name,
    connections: opts.connections,
    attempts: results.length,
    admitted: results.filter((r) => r.ok).length,
    refused_hard_stop: results.filter((r) => r.reason === "hard_stop").length,
    other: results.filter((r) => !r.ok && r.reason !== "hard_stop").length,
    cap_idr: cap,
    start_total_idr: opts.seeded,
    end_total_idr: end,
    max_observed_total_idr: maxObserved,
    ledger_matches_month: await ledgerMatchesMonth(opts.seeded),
    passed: false,
  };
  s.passed = s.end_total_idr <= cap && s.max_observed_total_idr <= cap && s.ledger_matches_month;
  log.push(s);
  return s;
}

const reserveJob = (requestId: string, account: string, amount: number) => async (c: pg.Client) =>
  (await c.query(`select public.reserve_spend($1, $2, $3, $4, 'pilot', $5) as r`, [requestId, account, amount, HARD_STOP, NOV])).rows[0].r as Reserve;

function rng(seed: number) {
  let x = seed;
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
}

describe("reserve_spend concurrency (required pre-deploy check)", { skip }, () => {
  before(async () => {
    db = await createTestDb();
  });
  beforeEach(async () => {
    await reset(db);
  });
  after(async () => {
    try {
      const out = process.env.CONCURRENCY_LOG;
      if (out && log.length > 0) {
        const migrations = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
        const digest = createHash("sha256");
        for (const f of migrations) digest.update(readFileSync(join("supabase/migrations", f)));
        const { rows } = await db.pool.query(`select version()`);
        let commit = "unknown";
        try {
          commit = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
        } catch {}
        const report = {
          check: "reserve_spend concurrency",
          ran_at: new Date().toISOString(),
          passed: log.every((s) => s.passed),
          git_commit_at_run: commit,
          migrations,
          migrations_sha256: digest.digest("hex"),
          postgres: rows[0].version,
          node: process.version,
          scenarios: log,
        };
        writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
        console.log(`concurrency log written to ${out} (passed=${report.passed})`);
      }
    } finally {
      await db?.close();
    }
  });

  test("LU-HARDSTOP-CONCURRENCY fixture: Rp4,999,500 settled, 3 simultaneous Rp300 -> exactly 1 admitted, Rp200 left", async () => {
    await db.pool.query(`insert into public.spend_month (month_start, settled_idr) values ($1, 4999500)`, [MONTH]);
    const conns = await clients(3);
    try {
      // Hold the month row so all three requests queue on the same lock, then release together.
      const gate = await db.pool.connect();
      await gate.query("begin");
      await gate.query(`select 1 from public.spend_month where month_start = $1 for update`, [MONTH]);
      const pending = conns.map((c, i) => reserveJob(`leo-${i}`, hash(i + 1), 300)(c));
      await new Promise((r) => setTimeout(r, 200));
      await gate.query("commit");
      gate.release();
      const results = await Promise.all(pending);
      const end = await monthTotal();
      const s: Scenario = {
        name: "LU-HARDSTOP-CONCURRENCY fixture (gated, 3 x Rp300 at Rp4,999,500)",
        connections: 3,
        attempts: 3,
        admitted: results.filter((r) => r.ok).length,
        refused_hard_stop: results.filter((r) => r.reason === "hard_stop").length,
        other: results.filter((r) => !r.ok && r.reason !== "hard_stop").length,
        cap_idr: HARD_STOP,
        start_total_idr: 4_999_500,
        end_total_idr: end,
        max_observed_total_idr: end,
        ledger_matches_month: await ledgerMatchesMonth(4_999_500),
        passed: false,
      };
      s.passed = s.admitted === 1 && s.refused_hard_stop === 2 && HARD_STOP - end === 200 && s.ledger_matches_month;
      log.push(s);
      assert.equal(s.admitted, 1);
      assert.equal(s.refused_hard_stop, 2);
      assert.equal(HARD_STOP - end, 200);
      assert.ok(s.ledger_matches_month);
    } finally {
      await Promise.all(conns.map((c) => c.end()));
    }
  });

  test("100 parallel Rp100 reservations on 25 connections with Rp1,000 headroom admit exactly 10", async () => {
    const jobs = Array.from({ length: 100 }, (_, i) => reserveJob(`flat-${i}`, hash(i % 13), 100));
    const s = await race({ name: "100 x Rp100, Rp1,000 headroom", seeded: HARD_STOP - 1000, connections: 25, jobs });
    assert.equal(s.admitted, 10);
    assert.equal(s.end_total_idr, HARD_STOP);
    assert.ok(s.passed, JSON.stringify(s));
  });

  test("400 random-amount reservations racing with settles and releases never exceed the cap", async () => {
    const rand = rng(20261122);
    const jobs = Array.from({ length: 400 }, (_, i) => {
      const amount = 1 + Math.floor(rand() * 300);
      const follow = rand();
      const settleTo = Math.floor(rand() * amount);
      return async (c: pg.Client) => {
        const r = await reserveJob(`mix-${i}`, hash(i % 13), amount)(c);
        if (r.ok && follow < 0.4) {
          await c.query(`select public.settle_spend($1, $2, null, null, null, null, 4000000, $3)`, [`mix-${i}`, settleTo, NOV]);
        } else if (r.ok && follow < 0.6) {
          await c.query(`select public.release_spend($1, $2)`, [`mix-${i}`, NOV]);
        }
        return r;
      };
    });
    const s = await race({ name: "400 random Rp1-300 with settle/release churn, Rp20,000 headroom", seeded: HARD_STOP - 20_000, connections: 40, jobs });
    assert.ok(s.admitted > 0 && s.refused_hard_stop > 0, "the race must actually hit the cap");
    assert.ok(s.passed, JSON.stringify(s));
  });

  test("admit_guru_call path: 13 accounts x 10 parallel messages near the cap never exceed it", async () => {
    let n = 0;
    const jobs = Array.from({ length: 130 }, (_, i) => async (c: pg.Client) => {
      n += 1;
      const { rows } = await c.query(`select public.admit_guru_call($1, $2, 'trial', $3, 100, $4, $5) as r`, [
        `adm-${i}-${n}`, hash(i % 13), JSON.stringify(CAPS), HARD_STOP, NOV,
      ]);
      return rows[0].r as Reserve;
    });
    const s = await race({ name: "admit_guru_call 13 accounts x 10, Rp3,000 headroom", seeded: HARD_STOP - 3000, connections: 26, jobs });
    assert.equal(s.admitted, 30);
    assert.ok(s.passed, JSON.stringify(s));
  });

  test("the same request_id fired 20 times in parallel is reserved once", async () => {
    const jobs = Array.from({ length: 20 }, () => reserveJob("replayed", hash(1), 100));
    const s = await race({ name: "20 x replay of one request_id", seeded: 0, connections: 20, jobs });
    assert.equal(s.admitted, 1);
    assert.equal(s.other, 19);
    assert.equal(s.end_total_idr, 100);
    assert.ok(s.passed, JSON.stringify(s));
  });
});
