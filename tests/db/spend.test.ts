import assert from "node:assert/strict";
import { after, before, beforeEach, describe, test } from "node:test";
import { call, createTestDb, hash, reset, skip, type TestDb } from "./helpers";

const HARD_STOP = 5_000_000;
const ALERT = 4_000_000;
const NOV = "2026-11-22T07:00:00Z";

type Reserve = { ok: boolean; reason?: string; month_start: string; settled_idr?: number; outstanding_idr?: number; headroom_idr?: number };

let db: TestDb;

async function seedSettled(month: string, settled: number) {
  await db.pool.query(`insert into public.spend_month (month_start, settled_idr) values ($1, $2)`, [month, settled]);
}

async function month(monthStart: string) {
  const { rows } = await db.pool.query(`select * from public.spend_month where month_start = $1`, [monthStart]);
  return rows[0];
}

describe("reserve_spend / settle_spend / release_spend", { skip }, () => {
  before(async () => {
    db = await createTestDb();
  });
  after(async () => {
    await db?.close();
  });
  beforeEach(async () => {
    await reset(db);
  });

  test("reserves Rp100 against the WIB month total", async () => {
    const r = await call<Reserve>(db, "reserve_spend", ["r1", hash(1), 100, HARD_STOP, "trial", NOV]);
    assert.equal(r.ok, true);
    assert.equal(r.month_start, "2026-11-01");
    assert.equal(r.outstanding_idr, 100);
    assert.equal(r.headroom_idr, HARD_STOP - 100);
    const { rows } = await db.pool.query(`select status, reserved_idr, kind from public.spend_ledger where request_id = 'r1'`);
    assert.deepEqual(rows[0], { status: "reserved", reserved_idr: 100, kind: "trial" });
  });

  test("a replayed request_id is never reserved (or dispatched) twice", async () => {
    await call(db, "reserve_spend", ["dup", hash(1), 100, HARD_STOP, "trial", NOV]);
    const again = await call<Reserve>(db, "reserve_spend", ["dup", hash(1), 100, HARD_STOP, "trial", NOV]);
    assert.equal(again.ok, false);
    assert.equal(again.reason, "duplicate_request");
    assert.equal((await month("2026-11-01")).outstanding_idr, "100");
  });

  test("hard stop boundary: admitted up to exactly Rp5,000,000, refused above", async () => {
    await seedSettled("2026-11-01", HARD_STOP - 200);
    assert.equal((await call<Reserve>(db, "reserve_spend", ["a", hash(1), 100, HARD_STOP, null, NOV])).ok, true);
    assert.equal((await call<Reserve>(db, "reserve_spend", ["b", hash(1), 100, HARD_STOP, null, NOV])).ok, true);
    const refused = await call<Reserve>(db, "reserve_spend", ["c", hash(1), 100, HARD_STOP, null, NOV]);
    assert.equal(refused.ok, false);
    assert.equal(refused.reason, "hard_stop");
    const m = await month("2026-11-01");
    assert.ok(m.hard_stop_at);
    assert.equal(Number(m.settled_idr) + Number(m.outstanding_idr), HARD_STOP);
  });

  test("outstanding reservations count toward the hard stop (not only settled spend)", async () => {
    await seedSettled("2026-11-01", HARD_STOP - 150);
    assert.equal((await call<Reserve>(db, "reserve_spend", ["a", hash(1), 100, HARD_STOP, null, NOV])).ok, true);
    assert.equal((await call<Reserve>(db, "reserve_spend", ["b", hash(2), 100, HARD_STOP, null, NOV])).ok, false);
  });

  test("settle closes exactly once and moves outstanding into settled", async () => {
    await call(db, "reserve_spend", ["s1", hash(1), 100, HARD_STOP, "trial", NOV]);
    const s = await call<{ ok: boolean; settled_idr: number; outstanding_idr: number; alert_fired: boolean }>(db, "settle_spend", [
      "s1", 37, "gemini-3.5-flash-lite", 900, 300, 100, ALERT, NOV,
    ]);
    assert.deepEqual([s.ok, s.settled_idr, s.outstanding_idr, s.alert_fired], [true, 37, 0, false]);
    const again = await call<{ ok: boolean; reason: string }>(db, "settle_spend", ["s1", 37, null, null, null, null, ALERT, NOV]);
    assert.deepEqual([again.ok, again.reason], [false, "already_closed"]);
    assert.equal((await call<{ ok: boolean }>(db, "release_spend", ["s1", NOV])).ok, false);
    assert.equal(Number((await month("2026-11-01")).settled_idr), 37);
  });

  test("release returns the headroom when the provider confirmed no charge", async () => {
    await call(db, "reserve_spend", ["x1", hash(1), 100, HARD_STOP, "trial", NOV]);
    assert.equal((await call<{ ok: boolean }>(db, "release_spend", ["x1", NOV])).ok, true);
    const m = await month("2026-11-01");
    assert.deepEqual([Number(m.settled_idr), Number(m.outstanding_idr)], [0, 0]);
    await assert.rejects(call(db, "release_spend", ["missing", NOV]), /unknown request_id/);
  });

  test("Rp4m alert fires exactly once per month", async () => {
    await seedSettled("2026-11-01", ALERT - 50);
    await call(db, "reserve_spend", ["al1", hash(1), 100, HARD_STOP, null, NOV]);
    await call(db, "reserve_spend", ["al2", hash(1), 100, HARD_STOP, null, NOV]);
    const first = await call<{ alert_fired: boolean }>(db, "settle_spend", ["al1", 60, null, null, null, null, ALERT, NOV]);
    const second = await call<{ alert_fired: boolean }>(db, "settle_spend", ["al2", 60, null, null, null, null, ALERT, NOV]);
    assert.equal(first.alert_fired, true);
    assert.equal(second.alert_fired, false);
    assert.ok((await month("2026-11-01")).alert_sent_at);
  });

  test("rejects non-positive amounts and hard stops", async () => {
    await assert.rejects(call(db, "reserve_spend", ["z", hash(1), 0, HARD_STOP, null, NOV]), /amount must be positive/);
    await assert.rejects(call(db, "reserve_spend", ["z", hash(1), 100, 0, null, NOV]), /hard stop must be positive/);
  });
});

describe("monthly reset: calendar month in WIB, 00:00 WIB on the 1st", { skip }, () => {
  before(async () => {
    db = await createTestDb();
  });
  after(async () => {
    await db?.close();
  });
  beforeEach(async () => {
    await reset(db);
  });

  test("23:59:59 WIB on 30 Nov is November; 00:00:00 WIB on 1 Dec is December", async () => {
    const last = await call<Reserve>(db, "reserve_spend", ["m1", hash(1), 100, HARD_STOP, null, "2026-11-30T16:59:59Z"]);
    const first = await call<Reserve>(db, "reserve_spend", ["m2", hash(1), 100, HARD_STOP, null, "2026-11-30T17:00:00Z"]);
    assert.equal(last.month_start, "2026-11-01");
    assert.equal(first.month_start, "2026-12-01");
    const iso = await db.pool.query(`select public.wib_month_start('2026-12-31T16:59:59Z')::text a, public.wib_month_start('2026-12-31T17:00:00Z')::text b`);
    assert.deepEqual(iso.rows[0], { a: "2026-12-01", b: "2027-01-01" });
  });

  test("a hard-stopped month does not block the next month", async () => {
    await seedSettled("2026-11-01", HARD_STOP);
    const nov = await call<Reserve>(db, "reserve_spend", ["n", hash(1), 100, HARD_STOP, null, "2026-11-30T16:59:59Z"]);
    const dec = await call<Reserve>(db, "reserve_spend", ["d", hash(1), 100, HARD_STOP, null, "2026-11-30T17:00:00Z"]);
    assert.equal(nov.reason, "hard_stop");
    assert.equal(dec.ok, true);
  });

  test("a call reserved in November and settled in December is charged to November", async () => {
    await call(db, "reserve_spend", ["late", hash(1), 100, HARD_STOP, null, "2026-11-30T16:59:50Z"]);
    const s = await call<{ month_start: string }>(db, "settle_spend", ["late", 80, null, null, null, null, ALERT, "2026-11-30T17:00:10Z"]);
    assert.equal(s.month_start, "2026-11-01");
    assert.equal(Number((await month("2026-11-01")).settled_idr), 80);
    assert.equal(await month("2026-12-01"), undefined);
  });
});
