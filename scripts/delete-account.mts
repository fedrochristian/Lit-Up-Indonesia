// Manual "Hapus akun & data" for the deploy operator (acceptable on Sunday per
// MD; the in-app button does the same). Dry run by default.
//   npx tsx --env-file=.env.local scripts/delete-account.mts --email someone@example.com
//   npx tsx --env-file=.env.local scripts/delete-account.mts --email someone@example.com --confirm
//   (or --user-id <uuid>; --requested-at 2026-11-22T06:00:00Z for an emailed request)
import { appEnv, appVersion } from "../lib/config";
import { deleteAccount } from "../lib/deletion";
import { sanitizeEventProps } from "../lib/events";
import { accountHash } from "../lib/hash";
import { adminFromEnv, flag } from "./lib.mjs";

const db = adminFromEnv();
const email = flag("email")?.toLowerCase();
let userId = flag("user-id");

if (!userId && email) {
  for (let page = 1; !userId; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    userId = data.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (data.users.length < 200) break;
  }
}
if (!userId) {
  console.error("No matching auth user. Pass --email or --user-id.");
  process.exit(1);
}

const hash = accountHash(userId);
const counts: Record<string, number> = {};
for (const table of ["events", "trial_sessions", "usage_counters", "spend_ledger", "profiles"]) {
  const { count, error } = await db.from(table).select("*", { count: "exact", head: true }).eq("account_hash", hash);
  if (error) throw error;
  counts[table] = count ?? 0;
}
console.log(`Auth user ${userId}\naccount_hash ${hash}\nRows linked:`, counts);

if (flag("confirm") !== "true") {
  console.log("Dry run. Re-run with --confirm to hard-delete (ledger rows are anonymized, not deleted).");
  process.exit(0);
}

const requestedAt = flag("requested-at");
const result = await deleteAccount(
  { userId, accountHash: hash },
  "manual",
  {
    rpc: async <T,>(fn: string, args: Record<string, unknown>) => {
      const { data, error } = await db.rpc(fn, args);
      if (error) throw error;
      return data as T;
    },
    deleteAuthUser: async (id) => {
      const { error } = await db.auth.admin.deleteUser(id);
      if (error) throw error;
    },
    logEvent: async (name, props, account) => {
      const clean = sanitizeEventProps(name, props);
      const { error } = await db
        .from("events")
        .insert({ name, props: clean ?? {}, account_hash: account, app_version: appVersion(), env: appEnv() });
      if (error) console.error(`event ${name} not written: ${error.message}`);
    },
  },
  requestedAt ? new Date(requestedAt) : undefined,
);
console.log(`Deleted on ${result.date} (WIB). Reference ${result.reference}. Rows:`, result.counts);
