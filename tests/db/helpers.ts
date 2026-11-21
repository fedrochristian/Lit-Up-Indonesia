import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

/**
 * TEST_DATABASE_URL must point at a Postgres 15+ server with a role that can
 * create databases, e.g. postgres://litup_test:litup_test@127.0.0.1:5432/postgres.
 * Each test file gets a fresh database with tests/db/supabase-stub.sql and every
 * supabase/migrations/*.sql applied, dropped again at the end.
 */
export const DB_URL = process.env.TEST_DATABASE_URL;
export const skip = DB_URL ? false : "TEST_DATABASE_URL not set (see docs/QA-CHECKLIST.md)";

export type TestDb = { url: string; pool: pg.Pool; close: () => Promise<void> };

export async function createTestDb(): Promise<TestDb> {
  const admin = new pg.Client({ connectionString: DB_URL });
  await admin.connect();
  const name = `litup_test_${process.pid}_${Math.floor(Math.random() * 1e6)}`;
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(DB_URL!);
  url.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: url.toString(), max: 30 });

  const migrations = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
  const client = await pool.connect();
  try {
    await client.query(readFileSync("tests/db/supabase-stub.sql", "utf8"));
    for (const file of migrations) await client.query(readFileSync(join("supabase/migrations", file), "utf8"));
  } finally {
    client.release();
  }

  return {
    url: url.toString(),
    pool,
    close: async () => {
      await pool.end();
      const cleanup = new pg.Client({ connectionString: DB_URL });
      await cleanup.connect();
      await cleanup.query(`drop database if exists ${name} with (force)`);
      await cleanup.end();
    },
  };
}

export async function reset(db: TestDb) {
  await db.pool.query(
    `truncate public.spend_ledger, public.spend_month, public.trial_sessions, public.usage_counters,
              public.events, public.deletion_log, public.rate_limits, public.profiles, public.allowlist_hashes,
              auth.users restart identity cascade`,
  );
}

export async function call<T = Record<string, unknown>>(db: TestDb | pg.PoolClient, fn: string, args: unknown[]): Promise<T> {
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  const target = "pool" in db ? db.pool : db;
  const { rows } = await target.query(`select public.${fn}(${placeholders}) as r`, args);
  return rows[0].r as T;
}

export const hash = (n: number) => n.toString(16).padStart(64, "0");

export const CAPS = {
  trial_session_msg_cap: 14,
  trial_sessions: 2,
  session_idle_minutes: 30,
  free_monthly_short_cap: 5,
  pilot_daily_msg_cap: 100,
};
