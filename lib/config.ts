import { MODEL_PRICES_USD_PER_M, worstCaseCallIdr } from "./guru/pricing";

type Env = Record<string, string | undefined>;

function int(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw.replace(/[_,]/g, ""));
  if (!Number.isFinite(value) || value < 0) {
    throw new ConfigError(`${name} must be a non-negative number`);
  }
  return value;
}

function bool(env: Env, name: string): boolean {
  return (env[name] ?? "").trim().toLowerCase() === "true";
}

export class ConfigError extends Error {}

/** Values default to the MD v1.1 numbers; the deployment overrides them by env var. */
export function readGuruConfig(env: Env = process.env) {
  const config = {
    model: (env.GEMINI_MODEL ?? "").trim() || "gemini-3.5-flash-lite",
    maxOutputTokens: int(env, "MAX_OUTPUT_TOKENS", 1024),
    shortResponseMaxTokens: int(env, "SHORT_RESPONSE_MAX_TOKENS", 400),
    thinkingBudgetTokens: int(env, "THINKING_BUDGET_TOKENS", 512),
    maxInputTokens: int(env, "MAX_INPUT_TOKENS", 4000),
    perCallReserveIdr: int(env, "PER_CALL_RESERVE_IDR", 100),
    trialSessionMsgCap: int(env, "TRIAL_SESSION_MSG_CAP", 14),
    trialSessions: 2,
    sessionIdleMinutes: 30,
    pilotDailyMsgCap: int(env, "PILOT_DAILY_MSG_CAP", 100),
    freeMonthlyShortCap: int(env, "FREE_MONTHLY_SHORT_CAP", 5),
    rateLimitUserPerMin: int(env, "RATE_LIMIT_USER_PER_MIN", 6),
    rateLimitUserBurst: 3,
    rateLimitIpPerMin: int(env, "RATE_LIMIT_IP_PER_MIN", 30),
    usdIdrRate: int(env, "USD_IDR_RATE", 18264),
    costP95TrialMaxIdr: int(env, "COST_P95_TRIAL_MAX_IDR", 2800),
    monthlyBurnAlertIdr: int(env, "MONTHLY_BURN_ALERT_IDR", 4_000_000),
    monthlyBurnHardStopIdr: int(env, "MONTHLY_BURN_HARD_STOP_IDR", 5_000_000),
    pilotCapsLifted: bool(env, "PILOT_CAPS_LIFTED"),
    triggerConversionEnabled: bool(env, "TRIGGER_CONVERSION_ENABLED"),
    triggerConversionMinTrials: 100,
    triggerMauEnabled: bool(env, "TRIGGER_MAU_ENABLED"),
  };
  validateGuruConfig(config);
  return config;
}

export type GuruConfig = ReturnType<typeof readGuruConfig>;

/**
 * Refuses configurations under which a single call or a full trial could cost
 * more than what is reserved for it. Callers treat a throw as "Guruku closed".
 */
export function validateGuruConfig(config: Omit<GuruConfig, never>) {
  if (!(config.model in MODEL_PRICES_USD_PER_M)) {
    throw new ConfigError(`GEMINI_MODEL ${config.model} has no price entry; refusing unpriced calls`);
  }
  if (config.perCallReserveIdr <= 0) throw new ConfigError("PER_CALL_RESERVE_IDR must be > 0");
  if (config.usdIdrRate <= 0) throw new ConfigError("USD_IDR_RATE must be > 0");
  const worst = worstCaseCallIdr(config);
  if (worst > config.perCallReserveIdr) {
    throw new ConfigError(
      `worst-case call costs Rp${worst}, above PER_CALL_RESERVE_IDR Rp${config.perCallReserveIdr}`,
    );
  }
  const trialMax = config.trialSessions * config.trialSessionMsgCap * config.perCallReserveIdr;
  if (trialMax > config.costP95TrialMaxIdr) {
    throw new ConfigError(
      `a full trial can reserve Rp${trialMax}, above COST_P95_TRIAL_MAX_IDR Rp${config.costP95TrialMaxIdr}`,
    );
  }
  if (config.monthlyBurnAlertIdr >= config.monthlyBurnHardStopIdr) {
    throw new ConfigError("MONTHLY_BURN_ALERT_IDR must be below MONTHLY_BURN_HARD_STOP_IDR");
  }
}

export function capsForDb(config: GuruConfig) {
  return {
    trial_session_msg_cap: config.trialSessionMsgCap,
    trial_sessions: config.trialSessions,
    session_idle_minutes: config.sessionIdleMinutes,
    free_monthly_short_cap: config.freeMonthlyShortCap,
    pilot_daily_msg_cap: config.pilotDailyMsgCap,
  };
}

export function appEnv(env: Env = process.env): "preview" | "production" | "development" {
  if (env.VERCEL_ENV === "production") return "production";
  if (env.VERCEL_ENV === "preview") return "preview";
  return "development";
}

export function appVersion(env: Env = process.env): string {
  return (env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 12) || "local";
}
