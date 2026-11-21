import { GURU_APP_CONTEXT, GURU_MODE_INSTRUCTION, GURU_PROMPT, GURU_UI_TEXT, type GuruPromptText } from "./prompt-text";

export const AI_DISCLOSURE = GURU_UI_TEXT.aiDisclosure;
export const HARD_STOP_MESSAGE = GURU_UI_TEXT.hardStop;
export const SAFETY_BLOCK_MESSAGE = GURU_UI_TEXT.refusal;
export const SAFETY_PENDING_MESSAGE = GURU_UI_TEXT.pending;

export class SafetyTextPendingError extends Error {
  constructor() {
    super("awaiting LU-GURU-SAFETY merged text from Elon (lib/guru/prompt-text.ts)");
    this.name = "SafetyTextPendingError";
  }
}

export function guruPromptReady(text: GuruPromptText = GURU_PROMPT): boolean {
  return (
    text.status === "final" &&
    typeof text.safetyRuleId === "string" &&
    /^LU-GURU-SAFETY-[0-9A-Za-z-]+$/.test(text.safetyRuleId) &&
    typeof text.safetyRule === "string" &&
    text.safetyRule.trim().length > 0
  );
}

/** The safety rule is carried verbatim; throws while it is still a placeholder. */
export function buildSystemPrompt(kind: "normal" | "short", text: GuruPromptText = GURU_PROMPT): string {
  if (!guruPromptReady(text)) throw new SafetyTextPendingError();
  return [GURU_APP_CONTEXT, "", `${text.safetyRuleId}:`, text.safetyRule, "", GURU_MODE_INSTRUCTION[kind]].join("\n");
}
