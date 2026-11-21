import { capsForDb, type GuruConfig } from "../config";
import type { EventName } from "../events";
import type { ChatTurn, ModelRequest, ModelResult } from "./gemini";
import { callCostIdr } from "./pricing";
import type { GuruPromptText } from "./prompt-text";
import { buildSystemPrompt, guruPromptReady, SAFETY_BLOCK_MESSAGE } from "./safety";
import { stripNonWhitelistLinks } from "./sanitize";

export const MAX_MESSAGE_CHARS = 1500;
const MAX_HISTORY_TURNS = 12;
const MAX_TURN_CHARS = 6000;

export type GuruDeps = {
  config: GuruConfig;
  rpc: <T>(fn: string, args: Record<string, unknown>) => Promise<T>;
  callModel: (req: ModelRequest) => Promise<ModelResult>;
  logEvent: (name: EventName, props: Record<string, unknown>, accountHash: string | null) => Promise<void>;
  alert: (text: string) => Promise<void>;
  isWhitelisted: (videoId: string) => boolean;
  newRequestId: () => string;
  now: () => Date;
  /** Defaults to GURU_PROMPT in lib/guru/prompt-text.ts. */
  prompt?: GuruPromptText;
};

export type GuruUsage = {
  mode: "trial" | "free" | "pilot";
  used: number;
  limit: number;
  session_no?: number;
  session_ended?: boolean;
};

export type GuruOutcome =
  | { status: "ok"; reply: string; kind: "normal" | "short"; usage: GuruUsage }
  | { status: "provider_error"; usage: GuruUsage }
  | { status: "rate_limited"; scope: "user" | "ip" }
  | { status: "cap"; cap: "pilot_daily" | "free_monthly" }
  | { status: "hard_stop" }
  | { status: "invalid"; message: string }
  | { status: "unavailable"; reason?: "safety_text_pending" };

type AdmitResult = {
  ok: boolean;
  reason?: "cap" | "hard_stop" | "duplicate_request";
  cap?: "pilot_daily" | "free_monthly";
  kind?: "normal" | "short";
  mode?: "trial" | "free" | "pilot";
  session_no?: number;
  session_started?: boolean;
  session_ended?: boolean;
  used?: number;
  limit?: number;
  month_start?: string;
  closed_sessions?: { session_no: number; guru_messages: number }[];
};

type SettleResult = { ok: boolean; alert_fired?: boolean; settled_idr?: number; month_start?: string };

/** Conservative token estimate (about 3 characters per token for Bahasa/English mixes). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

export function validateHistory(raw: unknown): ChatTurn[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const turns: ChatTurn[] = [];
  for (const item of raw.slice(-MAX_HISTORY_TURNS)) {
    if (!item || typeof item !== "object") return null;
    const { role, text } = item as Record<string, unknown>;
    if ((role !== "user" && role !== "model") || typeof text !== "string") return null;
    turns.push({ role, text: text.slice(0, MAX_TURN_CHARS) });
  }
  return turns;
}

/** Keeps the newest turns that fit MAX_INPUT_TOKENS together with the system prompt and message. */
export function fitTurns(system: string, history: ChatTurn[], message: string, maxInputTokens: number): ChatTurn[] | null {
  let budget = maxInputTokens - estimateTokens(system) - estimateTokens(message);
  if (budget < 0) return null;
  const kept: ChatTurn[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const cost = estimateTokens(history[i].text);
    if (cost > budget) break;
    budget -= cost;
    kept.unshift(history[i]);
  }
  while (kept.length > 0 && kept[0].role !== "user") kept.shift();
  return [...kept, { role: "user", text: message }];
}

export async function handleGuruMessage(
  input: { accountHash: string; ipHash: string; message: unknown; history: unknown },
  deps: GuruDeps,
): Promise<GuruOutcome> {
  const { config } = deps;
  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message) return { status: "invalid", message: "Tulis pertanyaanmu dulu." };
  if (message.length > MAX_MESSAGE_CHARS) {
    return { status: "invalid", message: `Pertanyaan maksimal ${MAX_MESSAGE_CHARS} karakter.` };
  }
  const history = validateHistory(input.history);
  if (!history) return { status: "invalid", message: "Riwayat percakapan tidak valid." };

  // Closed before any rate-limit hit or spend reservation while the safety text is a placeholder.
  if (!guruPromptReady(deps.prompt)) return { status: "unavailable", reason: "safety_text_pending" };

  const now = deps.now();
  const nowIso = now.toISOString();
  const log = (name: EventName, props: Record<string, unknown> = {}) => deps.logEvent(name, props, input.accountHash);

  try {
    const limits: [string, string, number, number, "ip" | "user"][] = [
      ["guru_ip_min", input.ipHash, config.rateLimitIpPerMin, 60, "ip"],
      ["guru_user_min", input.accountHash, config.rateLimitUserPerMin, 60, "user"],
      ["guru_user_burst", input.accountHash, config.rateLimitUserBurst, 10, "user"],
    ];
    for (const [scope, key, limit, windowSeconds, kind] of limits) {
      const allowed = await deps.rpc<boolean>("rate_limit_hit", {
        p_scope: scope,
        p_key_hash: key,
        p_limit: limit,
        p_window_seconds: windowSeconds,
        p_now: nowIso,
      });
      if (!allowed) {
        await log("rate_limited", { scope: kind });
        return { status: "rate_limited", scope: kind };
      }
    }
  } catch {
    return { status: "unavailable" };
  }

  const requestId = deps.newRequestId();
  let admit: AdmitResult;
  try {
    admit = await deps.rpc<AdmitResult>("admit_guru_call", {
      p_request_id: requestId,
      p_account_hash: input.accountHash,
      p_mode: config.pilotCapsLifted ? "pilot" : "trial",
      p_caps: capsForDb(config),
      p_amount_idr: config.perCallReserveIdr,
      p_hard_stop_idr: config.monthlyBurnHardStopIdr,
      p_now: nowIso,
    });
  } catch {
    return { status: "unavailable" };
  }

  for (const closed of admit.closed_sessions ?? []) {
    await log("trial_session_end", { session_no: closed.session_no, guru_messages: closed.guru_messages });
  }

  if (!admit.ok) {
    if (admit.reason === "hard_stop") {
      await log("hard_stop_refusal", { month_start: admit.month_start });
      return { status: "hard_stop" };
    }
    if (admit.reason === "cap" && admit.cap) {
      await log("cap_hit", { cap: admit.cap });
      return { status: "cap", cap: admit.cap };
    }
    return { status: "unavailable" };
  }

  if (admit.session_started) await log("trial_session_start", { session_no: admit.session_no });

  const kind = admit.kind ?? "normal";
  const usage: GuruUsage = {
    mode: admit.mode ?? "trial",
    used: admit.used ?? 0,
    limit: admit.limit ?? 0,
    session_no: admit.session_no,
    session_ended: admit.session_ended,
  };
  const afterCall = async () => {
    if (admit.session_ended && admit.session_no) {
      await log("cap_hit", { cap: "trial_session" });
      await log("trial_session_end", { session_no: admit.session_no, guru_messages: admit.used });
    }
  };

  const system = buildSystemPrompt(kind, deps.prompt);
  const turns = fitTurns(system, history, message, config.maxInputTokens) ?? [{ role: "user" as const, text: message }];
  const started = Date.now();
  const result = await deps.callModel({
    model: config.model,
    system,
    turns,
    maxOutputTokens: kind === "short" ? config.shortResponseMaxTokens : config.maxOutputTokens,
    thinkingBudgetTokens: config.thinkingBudgetTokens,
  });
  const latencyMs = Date.now() - started;

  let settledIdr = 0;
  let settle: SettleResult | null = null;
  const tokens = result.type === "ok" ? result.usage : { tokensIn: 0, tokensOut: 0, thinkingTokens: 0 };
  try {
    if (result.type === "http_error") {
      await deps.rpc("release_spend", { p_request_id: requestId, p_now: new Date().toISOString() });
    } else {
      settledIdr =
        result.type === "ok" ? callCostIdr(config.model, result.usage, config.usdIdrRate) : config.perCallReserveIdr;
      settle = await deps.rpc<SettleResult>("settle_spend", {
        p_request_id: requestId,
        p_settled_idr: settledIdr,
        p_model: config.model,
        p_tokens_in: tokens.tokensIn,
        p_tokens_out: tokens.tokensOut,
        p_thinking_tokens: tokens.thinkingTokens,
        p_alert_idr: config.monthlyBurnAlertIdr,
        p_now: new Date().toISOString(),
      });
    }
  } catch (err) {
    // The reservation stays outstanding and keeps counting toward the hard stop.
    console.error(`[guru] settlement failed for ${requestId}: ${(err as Error).message}`);
  }

  const outcome = result.type === "ok" ? (result.blocked ? "blocked" : "ok") : result.type === "http_error" ? "provider_error" : "timeout";
  await log("guru_call", {
    request_id: requestId,
    model: config.model,
    tokens_in: tokens.tokensIn,
    tokens_out: tokens.tokensOut,
    thinking_tokens: tokens.thinkingTokens,
    reserved_idr: config.perCallReserveIdr,
    settled_idr: settledIdr,
    latency_ms: latencyMs,
    kind,
    outcome,
  });

  if (settle?.alert_fired) {
    await log("spend_alert", { month_start: settle.month_start, settled_idr: settle.settled_idr });
    await deps.alert(
      `Lit Up: biaya AI bulan ${settle.month_start} sudah Rp${settle.settled_idr?.toLocaleString("id-ID")} (batas peringatan Rp${config.monthlyBurnAlertIdr.toLocaleString("id-ID")}).`,
    );
  }
  await afterCall();

  if (result.type !== "ok") return { status: "provider_error", usage };
  const reply = result.blocked ? SAFETY_BLOCK_MESSAGE : stripNonWhitelistLinks(result.text, deps.isWhitelisted);
  return { status: "ok", reply, kind, usage };
}
