// Mirrors ALLOWLIST_EMAILS into public.allowlist_hashes (SHA-256 of each
// normalized email), which the before-user-created auth hook reads.
// Run after every allowlist change:
//   npx tsx --env-file=.env.local scripts/sync-allowlist.mts           (dry run)
//   npx tsx --env-file=.env.local scripts/sync-allowlist.mts --apply
import { emailSha256, parseAllowlist } from "../lib/allowlist";
import { adminFromEnv, flag } from "./lib.mjs";

const allowlist = parseAllowlist(process.env.ALLOWLIST_EMAILS);
if (!allowlist.ok) {
  console.error(`Refusing to sync: ${allowlist.error}`);
  process.exit(1);
}
const wanted = new Set([...allowlist.emails].map(emailSha256));

const db = adminFromEnv();
const { data, error } = await db.from("allowlist_hashes").select("email_sha256");
if (error) throw error;
const current = new Set((data ?? []).map((r) => r.email_sha256 as string));
const toAdd = [...wanted].filter((h) => !current.has(h));
const toRemove = [...current].filter((h) => !wanted.has(h));

console.log(`ALLOWLIST_EMAILS: ${wanted.size} account(s). Database: ${current.size}. Add ${toAdd.length}, remove ${toRemove.length}.`);
if (flag("apply") !== "true") {
  console.log("Dry run. Re-run with --apply to write.");
  process.exit(0);
}
if (toRemove.length) {
  const { error: delError } = await db.from("allowlist_hashes").delete().in("email_sha256", toRemove);
  if (delError) throw delError;
}
if (toAdd.length) {
  const { error: insError } = await db.from("allowlist_hashes").insert(toAdd.map((email_sha256) => ({ email_sha256 })));
  if (insError) throw insError;
}
console.log("Synced.");
