/**
 * Pre-deploy gate. Run against the env you are about to deploy:
 *   npx tsx --env-file=.env.local scripts/preflight.mts
 * Exits 1 while any automated check fails. MANUAL lines must be signed off in
 * docs/QA-CHECKLIST.md by a person; this script cannot verify them.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { emailSha256, parseAllowlist } from "../lib/allowlist";
import { readGuruConfig, validateGuruConfig } from "../lib/config";
import { GURU_PROMPT } from "../lib/guru/prompt-text";
import { guruPromptReady } from "../lib/guru/safety";
import { adminFromEnv } from "./lib.mjs";

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];
const check = (name: string, ok: boolean, detail: string) => results.push({ name, ok, detail });

check(
  "Guruku safety text (LU-GURU-SAFETY merged text from Elon)",
  guruPromptReady(GURU_PROMPT),
  guruPromptReady(GURU_PROMPT) ? `${GURU_PROMPT.safetyRuleId} in lib/guru/prompt-text.ts` : "awaiting merged text; Guruku stays closed",
);

const LOG = "docs/qa/reserve-concurrency-log.json";
if (!existsSync(LOG)) {
  check("reserve_spend concurrency check logged", false, `${LOG} missing; run npm run check:concurrency`);
} else {
  const log = JSON.parse(readFileSync(LOG, "utf8"));
  const digest = createHash("sha256");
  for (const f of readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort()) {
    digest.update(readFileSync(join("supabase/migrations", f)));
  }
  const current = digest.digest("hex");
  const fresh = log.migrations_sha256 === current;
  check(
    "reserve_spend concurrency check logged",
    log.passed === true && fresh,
    `${log.passed ? "passed" : "FAILED"} at ${log.ran_at}, ${log.scenarios?.length ?? 0} scenarios${fresh ? "" : "; migrations changed since, rerun npm run check:concurrency"}`,
  );
}

const G5 = "docs/qa/g5-oembed-report.json";
if (!existsSync(G5)) {
  check("G5 oEmbed check over all whitelist IDs", false, `${G5} missing; run npm run g5:check`);
} else {
  const g5 = JSON.parse(readFileSync(G5, "utf8"));
  const excluded: string[] = JSON.parse(readFileSync("data/jelajahi-g5-excluded.json", "utf8")).excluded.map((e: { video_id: string }) => e.video_id);
  const unhandled = (g5.failures as { id: string }[]).filter((f) => !excluded.includes(f.id));
  check(
    "G5 oEmbed check over all whitelist IDs",
    unhandled.length === 0,
    `${g5.passed}/${g5.total} passed at ${g5.ran_at_utc}; ${g5.failed} failed${unhandled.length ? `, ${unhandled.length} not excluded` : ", all excluded (not substituted)"}`,
  );
}

try {
  validateGuruConfig(readGuruConfig(process.env));
  check("Guruku config (caps, reserve, prices)", true, "valid");
} catch (err) {
  check("Guruku config (caps, reserve, prices)", false, (err as Error).message);
}

const required = [
  "GEMINI_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ACCOUNT_HMAC_KEY",
  "ALLOWLIST_EMAILS",
  "NEXT_PUBLIC_SITE_URL",
];
const missing = required.filter((k) => !process.env[k]);
check("required env vars present", missing.length === 0, missing.length ? `missing: ${missing.join(", ")}` : "all set (values not printed)");
check("ACCOUNT_HMAC_KEY length", (process.env.ACCOUNT_HMAC_KEY ?? "").length >= 32, "needs at least 32 characters");
const allowlist = parseAllowlist(process.env.ALLOWLIST_EMAILS);
check("ALLOWLIST_EMAILS parses (max 13)", allowlist.ok, allowlist.ok ? `${allowlist.emails.size} entries` : allowlist.error);

// The auth hook reads allowlist_hashes; the app reads ALLOWLIST_EMAILS. They must match exactly.
const HOOK_CHECK = "auth hook allowlist matches ALLOWLIST_EMAILS";
if (!allowlist.ok || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  check(HOOK_CHECK, false, "needs a valid ALLOWLIST_EMAILS plus NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
} else {
  try {
    const { data, error } = await adminFromEnv().from("allowlist_hashes").select("email_sha256");
    if (error) throw new Error(error.message);
    const inDb = new Set((data ?? []).map((r: { email_sha256: string }) => r.email_sha256));
    const wanted = new Set([...allowlist.emails].map(emailSha256));
    const missingInDb = [...wanted].filter((h) => !inDb.has(h)).length;
    const extraInDb = [...inDb].filter((h) => !wanted.has(h)).length;
    check(
      HOOK_CHECK,
      missingInDb === 0 && extraInDb === 0,
      missingInDb || extraInDb
        ? `${missingInDb} allowlisted email(s) missing from the hook table, ${extraInDb} extra hash(es); run npm run allowlist:sync -- --apply`
        : `${inDb.size} hash(es), identical`,
    );
  } catch (err) {
    check(HOOK_CHECK, false, `could not read allowlist_hashes: ${(err as Error).message}`);
  }
}

for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}: ${r.detail}`);
for (const m of [
  "QA condition (a): model ID and price confirmed on Google's live pricing page; GEMINI_API_KEY is PAID tier",
  "QA condition (c): off-allowlist email refused and allowlisted email signed in on the preview URL",
  "G5 manual sample: 20 IDs from docs/qa/g5-oembed-report.json played in the app",
]) {
  console.log(`MANUAL ${m} (sign off in docs/QA-CHECKLIST.md)`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\n${failed} automated check(s) failing: not ready to deploy.` : "\nAutomated checks pass. Complete the MANUAL items before deploy.");
process.exit(failed ? 1 : 0);
