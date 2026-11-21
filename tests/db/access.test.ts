import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, beforeEach, describe, test } from "node:test";
import { CAPS, call, createTestDb, hash, reset, skip, type TestDb } from "./helpers";

let db: TestDb;
const sha = (email: string) => createHash("sha256").update(email).digest("hex");
const USER_ID = "8a1f0c2e-0000-4000-8000-000000000001";
const OTHER_ID = "8a1f0c2e-0000-4000-8000-000000000002";

async function asRole<T>(role: "anon" | "authenticated", sub: string | null, sql: string): Promise<T[]> {
  const c = await db.pool.connect();
  try {
    await c.query("begin");
    await c.query(`set local role ${role}`);
    if (sub) await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub]);
    const { rows } = await c.query(sql);
    return rows as T[];
  } finally {
    await c.query("rollback");
    c.release();
  }
}

describe("allowlist hook, RLS and privileges", { skip }, () => {
  before(async () => {
    db = await createTestDb();
  });
  after(async () => {
    await db?.close();
  });
  beforeEach(async () => {
    await reset(db);
  });

  test("before-user-created hook: allowlisted email passes, any other email gets 403", async () => {
    await db.pool.query(`insert into public.allowlist_hashes (email_sha256) values ($1)`, [sha("tri@example.com")]);
    const allowed = await call(db, "hook_before_user_created", [JSON.stringify({ user: { email: "  Tri@Example.com " } })]);
    assert.deepEqual(allowed, {});
    for (const email of ["stranger@example.com", "", "tri@example.com.evil.test"]) {
      const denied = await call<{ error: { http_code: number; message: string } }>(db, "hook_before_user_created", [
        JSON.stringify({ user: { email } }),
      ]);
      assert.equal(denied.error.http_code, 403);
    }
    const noUser = await call<{ error: { http_code: number } }>(db, "hook_before_user_created", [JSON.stringify({})]);
    assert.equal(noUser.error.http_code, 403);
  });

  test("the hook stores and compares hashes only (no plaintext emails in the database)", async () => {
    const { rows } = await db.pool.query(
      `select column_name from information_schema.columns where table_schema = 'public' and column_name ilike '%email%'`,
    );
    assert.deepEqual(rows.map((r) => r.column_name), ["email_sha256"]);
  });

  test("the allowlist table refuses a 14th entry", async () => {
    for (let i = 0; i < 13; i++) await db.pool.query(`insert into public.allowlist_hashes values ($1)`, [sha(`u${i}@x.id`)]);
    await assert.rejects(db.pool.query(`insert into public.allowlist_hashes values ($1)`, [sha("u13@x.id")]), /capped at 13/);
  });

  test("supabase_auth_admin can run the hook; anon and authenticated cannot", async () => {
    const c = await db.pool.connect();
    try {
      await c.query("begin");
      await c.query("set local role supabase_auth_admin");
      await c.query(`select public.hook_before_user_created('{"user":{"email":"a@b.c"}}'::jsonb)`);
      await c.query("rollback");
    } finally {
      c.release();
    }
    for (const role of ["anon", "authenticated"] as const) {
      await assert.rejects(asRole(role, null, `select public.hook_before_user_created('{}'::jsonb)`), /permission denied/);
    }
  });

  test("browser roles cannot call spend/caps/deletion functions or read pilot tables", async () => {
    const fns = [
      `public.reserve_spend('x', '${hash(1)}', 100, 5000000, null, now())`,
      `public.settle_spend('x', 1, null, null, null, null, null, now())`,
      `public.release_spend('x', now())`,
      `public.admit_guru_call('x', '${hash(1)}', 'pilot', '${JSON.stringify(CAPS)}'::jsonb, 100, 5000000, now())`,
      `public.guru_status('${hash(1)}', 'trial', '{}'::jsonb, 100, 5000000, now())`,
      `public.rate_limit_hit('s', 'k', 1, 60, now())`,
      `public.delete_account_data('${hash(1)}', 'x', null, now())`,
      `public.end_trial_session('${hash(1)}', now())`,
      `public.metric4_trial_cost()`,
    ];
    const tables = ["allowlist_hashes", "trial_sessions", "usage_counters", "spend_month", "spend_ledger", "events", "deletion_log", "rate_limits"];
    for (const role of ["anon", "authenticated"] as const) {
      for (const fn of fns) await assert.rejects(asRole(role, USER_ID, `select ${fn}`), /permission denied/, `${role}: ${fn}`);
      for (const t of tables) await assert.rejects(asRole(role, USER_ID, `select * from public.${t}`), /permission denied/, `${role}: ${t}`);
    }
    await assert.rejects(asRole("anon", null, `select * from public.profiles`), /permission denied/);
  });

  test("an authenticated learner sees only their own profile row", async () => {
    await db.pool.query(`insert into auth.users (id, email) values ($1, 'a@x.id'), ($2, 'b@x.id')`, [USER_ID, OTHER_ID]);
    await db.pool.query(`insert into public.profiles (account_id, account_hash, display_name) values ($1, $2, 'A'), ($3, $4, 'B')`, [
      USER_ID, hash(1), OTHER_ID, hash(2),
    ]);
    const rows = await asRole<{ account_id: string }>("authenticated", USER_ID, `select account_id from public.profiles`);
    assert.deepEqual(rows.map((r) => r.account_id), [USER_ID]);
    await assert.rejects(asRole("authenticated", USER_ID, `update public.profiles set display_name = 'x'`), /permission denied/);
  });

  test("RLS is enabled on every public table", async () => {
    const { rows } = await db.pool.query(
      `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    );
    assert.deepEqual(rows, []);
  });
});

describe("delete_account_data", { skip }, () => {
  before(async () => {
    db = await createTestDb();
  });
  after(async () => {
    await db?.close();
  });
  beforeEach(async () => {
    await reset(db);
  });

  test("removes every learner-linked row, keeps ID-less cost aggregates and a dated deletion record", async () => {
    const a = hash(1);
    const keep = hash(2);
    await db.pool.query(`insert into auth.users (id, email) values ($1, 'a@x.id')`, [USER_ID]);
    await db.pool.query(`insert into public.profiles (account_id, account_hash) values ($1, $2)`, [USER_ID, a]);
    for (const who of [a, keep]) {
      await call(db, "admit_guru_call", [`r-${who}`, who, "trial", JSON.stringify(CAPS), 100, 5_000_000, "2026-11-22T06:00:00Z"]);
      await call(db, "settle_spend", [`r-${who}`, 40, null, null, null, null, 4_000_000, "2026-11-22T06:00:01Z"]);
      await call(db, "rate_limit_hit", ["guru_user_min", who, 6, 60, "2026-11-22T06:00:00Z"]);
      await db.pool.query(`insert into public.events (account_hash, name, props, app_version, env) values ($1, 'tab_view', '{}', 'test', 'development')`, [who]);
    }

    const { deletion_id, completed_at, ...counts } = await call<Record<string, number | string>>(db, "delete_account_data", [a, "in_app", "2026-11-22T06:05:00Z", "2026-11-22T06:05:02Z"]);
    assert.equal(new Date(completed_at as string).toISOString(), "2026-11-22T06:05:02.000Z");
    assert.deepEqual(counts, { events: 1, trial_sessions: 1, usage_counters: 0, rate_limits: 1, ledger_rows_anonymized: 1, profiles: 1 });

    for (const t of ["events", "trial_sessions", "usage_counters", "spend_ledger", "profiles"]) {
      const { rows } = await db.pool.query(`select count(*)::int n from public.${t} where account_hash = $1`, [a]);
      assert.equal(rows[0].n, 0, t);
    }
    const { rows: rl } = await db.pool.query(`select count(*)::int n from public.rate_limits where key_hash = $1`, [a]);
    assert.equal(rl[0].n, 0);

    const { rows: ledger } = await db.pool.query(`select count(*)::int n, sum(settled_idr)::int s from public.spend_ledger`);
    assert.deepEqual(ledger[0], { n: 2, s: 80 });
    const { rows: month } = await db.pool.query(`select settled_idr::int s from public.spend_month`);
    assert.equal(month[0].s, 80);

    const { rows: log } = await db.pool.query(`select id::int, method, requested_at, completed_at from public.deletion_log`);
    assert.equal(log.length, 1);
    assert.equal(log[0].id, deletion_id);
    assert.equal(log[0].completed_at.toISOString(), "2026-11-22T06:05:02.000Z");
    assert.equal(log[0].method, "in_app");
    assert.equal(log[0].requested_at.toISOString(), "2026-11-22T06:05:00.000Z");

    const { rows: other } = await db.pool.query(`select count(*)::int n from public.events where account_hash = $1`, [keep]);
    assert.equal(other[0].n, 1);
  });

  test("rejects anything that is not an account hash", async () => {
    await assert.rejects(call(db, "delete_account_data", ["tri@example.com", "operator", null, "2026-11-22T06:00:00Z"]), /invalid account hash/);
  });
});
