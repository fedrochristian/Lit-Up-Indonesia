import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ConfigError, readGuruConfig } from "../../lib/config";
import { callCostIdr, worstCaseCallIdr } from "../../lib/guru/pricing";

describe("config defaults follow MD v1.1 and ELON-REVIEW LU-MD-FINAL-20261121-1556", () => {
  const c = readGuruConfig({});

  test("model, FX and per-call reserve", () => {
    assert.equal(c.model, "gemini-3.5-flash-lite");
    assert.equal(c.usdIdrRate, 18264);
    assert.equal(c.perCallReserveIdr, 100);
    assert.equal(c.maxOutputTokens, 1024);
    assert.equal(c.shortResponseMaxTokens, 400);
    assert.equal(c.thinkingLevel, "MINIMAL");
    assert.equal(c.thinkingAllowanceTokens, 512);
    assert.equal(c.maxInputTokens, 4000);
  });

  test("caps and rate limits", () => {
    assert.equal(c.trialSessionMsgCap, 14);
    assert.equal(c.trialSessions, 2);
    assert.equal(c.freeMonthlyShortCap, 5);
    assert.equal(c.pilotDailyMsgCap, 100);
    assert.equal(c.rateLimitUserPerMin, 6);
    assert.equal(c.rateLimitUserBurst, 3);
    assert.equal(c.rateLimitIpPerMin, 30);
    assert.equal(c.pilotCapsLifted, false, "caps enforced unless the pilot flag is explicitly true");
  });

  test("stop rules: per-trial p95 renamed, Rp4m alert, Rp5m hard stop, triggers off, trigger 2 floor 100", () => {
    assert.equal(c.costP95TrialMaxIdr, 2800);
    assert.equal(c.trialSessions * c.trialSessionMsgCap * c.perCallReserveIdr, 2800, "28 calls x Rp100");
    assert.equal(c.monthlyBurnAlertIdr, 4_000_000);
    assert.equal(c.monthlyBurnHardStopIdr, 5_000_000);
    assert.equal(c.triggerConversionEnabled, false);
    assert.equal(c.triggerMauEnabled, false);
    assert.equal(c.triggerConversionMinTrials, 100);
  });

  test("the old per-session key name is not read", () => {
    const withOld = readGuruConfig({ COST_P95_SESSION_MAX_IDR: "1" });
    assert.equal(withOld.costP95TrialMaxIdr, 2800);
  });
});

describe("pricing and guardrail validation", () => {
  test("worst-case call (4,000 in + 1,024 out + 512 thinking) costs <= Rp100 at Rp18,264/USD", () => {
    const worst = worstCaseCallIdr(readGuruConfig({}));
    // (4000*0.30 + 1536*2.50) / 1e6 USD = $0.00504 -> Rp92.05 -> Rp93
    assert.equal(worst, 93);
    assert.ok(worst <= 100);
  });

  test("cost uses input and output+thinking prices and rounds up", () => {
    assert.equal(callCostIdr("gemini-3.5-flash-lite", { tokensIn: 1000, tokensOut: 200, thinkingTokens: 100 }, 18264), 20);
    assert.equal(callCostIdr("gemini-3.5-flash-lite", { tokensIn: 0, tokensOut: 0, thinkingTokens: 0 }, 18264), 0);
  });

  test("refuses an unpriced model", () => {
    assert.throws(() => readGuruConfig({ GEMINI_MODEL: "gemini-3.8-flash" }), ConfigError);
  });

  test("refuses a reserve below the worst-case call", () => {
    assert.throws(() => readGuruConfig({ PER_CALL_RESERVE_IDR: "50" }), /worst-case/);
    assert.throws(() => readGuruConfig({ MAX_OUTPUT_TOKENS: "4000" }), /worst-case/);
  });

  test("refuses a trial cap that could exceed COST_P95_TRIAL_MAX_IDR", () => {
    assert.throws(() => readGuruConfig({ TRIAL_SESSION_MSG_CAP: "15" }), /COST_P95_TRIAL_MAX_IDR/);
  });

  test("refuses an alert at or above the hard stop, and junk numbers", () => {
    assert.throws(() => readGuruConfig({ MONTHLY_BURN_ALERT_IDR: "5000000" }), ConfigError);
    assert.throws(() => readGuruConfig({ USD_IDR_RATE: "abc" }), ConfigError);
  });

  test("accepts thousands separators in env values", () => {
    assert.equal(readGuruConfig({ MONTHLY_BURN_HARD_STOP_IDR: "5,000,000" }).monthlyBurnHardStopIdr, 5_000_000);
  });
});
