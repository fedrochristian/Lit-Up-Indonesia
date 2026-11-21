import { crashCourseSource } from "./jelajahi/whitelist";
import { TAB_IDS as TABS } from "./tabs";

type FieldRule =
  | { type: "bool" }
  | { type: "int"; min?: number; max?: number }
  | { type: "enum"; values: readonly (string | number)[] }
  | { type: "video_id" }
  | { type: "uuid" }
  | { type: "date" }
  | { type: "model" };

/** MD v1.1 item (8) events list. Props outside these rules are dropped. */
export const EVENT_SCHEMAS = {
  auth_link_requested: { allowlisted: { type: "bool" } },
  auth_signed_in: {},
  auth_denied: { reason: { type: "enum", values: ["not_allowlisted"] } },
  tab_view: { tab: { type: "enum", values: TABS }, tab_index: { type: "enum", values: [1, 2, 3, 4] } },
  embed_play: { video_id: { type: "video_id" } },
  embed_error: { video_id: { type: "video_id" }, code: { type: "enum", values: [2, 5, 100, 101, 150, 153] } },
  guru_call: {
    request_id: { type: "uuid" },
    model: { type: "model" },
    tokens_in: { type: "int", min: 0 },
    tokens_out: { type: "int", min: 0 },
    thinking_tokens: { type: "int", min: 0 },
    reserved_idr: { type: "int", min: 0 },
    settled_idr: { type: "int", min: 0 },
    latency_ms: { type: "int", min: 0 },
    kind: { type: "enum", values: ["normal", "short"] },
    outcome: { type: "enum", values: ["ok", "blocked", "provider_error", "timeout"] },
  },
  cap_hit: { cap: { type: "enum", values: ["trial_session", "pilot_daily", "free_monthly"] } },
  rate_limited: { scope: { type: "enum", values: ["user", "ip"] } },
  spend_alert: { month_start: { type: "date" }, settled_idr: { type: "int", min: 0 } },
  hard_stop_refusal: { month_start: { type: "date" } },
  trial_session_start: { session_no: { type: "enum", values: [1, 2] } },
  trial_session_end: { session_no: { type: "enum", values: [1, 2] }, guru_messages: { type: "int", min: 0, max: 1000 } },
  plan_view: {},
  komunitas_preview_view: {},
  deletion_done: { method: { type: "enum", values: ["manual", "in_app"] } },
} as const satisfies Record<string, Record<string, FieldRule>>;

export type EventName = keyof typeof EVENT_SCHEMAS;

export const CLIENT_EVENTS: ReadonlySet<EventName> = new Set<EventName>([
  "tab_view",
  "embed_play",
  "embed_error",
  "plan_view",
  "komunitas_preview_view",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MODEL_RE = /^[a-z0-9][a-z0-9.\-]{1,63}$/;

function checkField(rule: FieldRule, value: unknown): boolean {
  switch (rule.type) {
    case "bool":
      return typeof value === "boolean";
    case "int":
      return (
        typeof value === "number" &&
        Number.isInteger(value) &&
        (rule.min === undefined || value >= rule.min) &&
        (rule.max === undefined || value <= rule.max)
      );
    case "enum":
      return (rule.values as readonly unknown[]).includes(value);
    case "video_id":
      return typeof value === "string" && crashCourseSource.hasVideo(value);
    case "uuid":
      return typeof value === "string" && UUID_RE.test(value);
    case "date":
      return typeof value === "string" && DATE_RE.test(value);
    case "model":
      return typeof value === "string" && MODEL_RE.test(value);
  }
}

export function isEventName(name: unknown): name is EventName {
  return typeof name === "string" && Object.prototype.hasOwnProperty.call(EVENT_SCHEMAS, name);
}

/**
 * Returns only schema-listed props with valid values, or null if a listed
 * prop is invalid. Unknown keys are dropped, so free text cannot get in.
 */
export function sanitizeEventProps(name: EventName, props: unknown): Record<string, unknown> | null {
  const schema = EVENT_SCHEMAS[name] as Record<string, FieldRule>;
  const input = props && typeof props === "object" && !Array.isArray(props) ? (props as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const [key, rule] of Object.entries(schema)) {
    if (!(key in input) || input[key] === undefined) continue;
    if (!checkField(rule, input[key])) return null;
    out[key] = input[key];
  }
  return out;
}
