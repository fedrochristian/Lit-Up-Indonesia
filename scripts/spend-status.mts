// Operator view of the cost guardrails for the current WIB month, Metric 4, and
// stale reservations. For the daily reconciliation, compare "settled" with the
// Gemini API usage/billing report for the same project.
//   npx tsx --env-file=.env.local scripts/spend-status.mts
//   npx tsx --env-file=.env.local scripts/spend-status.mts --settle-stale   (settles reservations older than 15 min at their reserved amount)
import { readGuruConfig } from "../lib/config";
import { adminFromEnv, flag } from "./lib.mjs";

const db = adminFromEnv();
const config = readGuruConfig();
const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

const { data: monthStart, error: monthError } = await db.rpc("wib_month_start", { p_now: new Date().toISOString() });
if (monthError) throw monthError;
const { data: month } = await db.from("spend_month").select("*").eq("month_start", monthStart).maybeSingle();
const settled = Number(month?.settled_idr ?? 0);
const outstanding = Number(month?.outstanding_idr ?? 0);

console.log(`Month (WIB): ${monthStart}`);
console.log(`  settled ${rp(settled)} · outstanding ${rp(outstanding)} · headroom ${rp(config.monthlyBurnHardStopIdr - settled - outstanding)}`);
console.log(`  alert at ${rp(config.monthlyBurnAlertIdr)}: ${month?.alert_sent_at ? `FIRED ${month.alert_sent_at}` : "not fired"}`);
console.log(`  hard stop at ${rp(config.monthlyBurnHardStopIdr)}: ${month?.hard_stop_at ? `REACHED ${month.hard_stop_at}` : "not reached"}`);

const { data: metric4, error: m4Error } = await db.rpc("metric4_trial_cost", {
  p_unit_calls: config.trialSessions * config.trialSessionMsgCap,
  p_unit_sessions: config.trialSessions,
});
if (m4Error) throw m4Error;
const p95 = Number(metric4.p95_idr);
const above = p95 > config.costP95TrialMaxIdr;
const reading = Number(metric4.learners) === 0 ? "no data yet" : above ? "ABOVE threshold, pause scaling" : "below threshold";
// A reading, not a verdict: with small n (and partial units) it cannot "pass".
console.log(
  `Metric 4 (LIVE): ${reading}, n = ${metric4.learners} ` +
    `(p95 ${rp(p95)}, max ${rp(Number(metric4.max_idr))} per trial unit vs ${rp(config.costP95TrialMaxIdr)})`,
);
console.log(
  `  learners ${metric4.learners}: ${metric4.full_units} full unit(s), ${metric4.partial_units} partial ` +
    `(full = ${metric4.unit_calls} charged calls, or both trial sessions ended)`,
);
console.log(`Trigger 2 (conversion): ${config.triggerConversionEnabled ? "ENABLED" : "off"} (floor ${config.triggerConversionMinTrials} completed trials)`);
console.log(`Trigger 3 (paying share of MAU): ${config.triggerMauEnabled ? "ENABLED" : "off"}`);
console.log(`Model ${config.model} · reserve ${rp(config.perCallReserveIdr)}/call · pilot caps lifted: ${config.pilotCapsLifted}`);

const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
const { data: stale, error: staleError } = await db
  .from("spend_ledger")
  .select("request_id, reserved_idr, created_at")
  .eq("status", "reserved")
  .lt("created_at", cutoff);
if (staleError) throw staleError;
console.log(`Stale reservations (>15 min): ${stale?.length ?? 0}`);

if (stale?.length && flag("settle-stale") === "true") {
  for (const row of stale) {
    const { error } = await db.rpc("settle_spend", {
      p_request_id: row.request_id,
      p_settled_idr: row.reserved_idr,
      p_alert_idr: config.monthlyBurnAlertIdr,
    });
    console.log(`  ${row.request_id}: ${error ? `failed ${error.message}` : `settled at ${rp(row.reserved_idr)}`}`);
  }
}
