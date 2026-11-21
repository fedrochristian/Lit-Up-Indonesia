export type ChatTurn = { role: "user" | "model"; text: string };

/** Values of `ThinkingLevel` in @google/genai 3.6.1 that we allow; Google lists only levels for gemini-3.5-flash-lite. */
export type ThinkingLevel = "MINIMAL" | "LOW";

export type ModelRequest = {
  model: string;
  system: string;
  turns: ChatTurn[];
  maxOutputTokens: number;
  thinkingLevel: ThinkingLevel;
};

export type ModelResult =
  | {
      type: "ok";
      text: string;
      blocked: boolean;
      usage: { tokensIn: number; tokensOut: number; thinkingTokens: number };
    }
  /** The provider answered with an error status: no generation, no charge. */
  | { type: "http_error"; status: number }
  /** No answer: the charge is unknown, so the caller settles conservatively. */
  | { type: "timeout" };

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

const SAFETY_SETTINGS = [
  "HARM_CATEGORY_HARASSMENT",
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
].map((category) => ({ category, threshold: "BLOCK_LOW_AND_ABOVE" }));

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
};

export function buildGeminiBody(req: ModelRequest) {
  return {
    systemInstruction: { parts: [{ text: req.system }] },
    contents: req.turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    generationConfig: {
      maxOutputTokens: req.maxOutputTokens,
      temperature: 0.7,
      thinkingConfig: { thinkingLevel: req.thinkingLevel },
    },
    safetySettings: SAFETY_SETTINGS,
  };
}

export function parseGeminiResponse(json: GeminiResponse): Extract<ModelResult, { type: "ok" }> {
  const candidate = json.candidates?.[0];
  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();
  const finish = candidate?.finishReason ?? "";
  const blocked =
    Boolean(json.promptFeedback?.blockReason) ||
    ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"].includes(finish) ||
    text.length === 0;
  const usage = json.usageMetadata ?? {};
  return {
    type: "ok",
    text,
    blocked,
    usage: {
      tokensIn: usage.promptTokenCount ?? 0,
      tokensOut: usage.candidatesTokenCount ?? 0,
      thinkingTokens: usage.thoughtsTokenCount ?? 0,
    },
  };
}

/** Gemini API generateContent over REST. No tools, no grounding/search calls. */
export async function callGemini(
  req: ModelRequest,
  apiKey: string,
  timeoutMs = 25_000,
  fetchImpl: typeof fetch = fetch,
): Promise<ModelResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(req.model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(buildGeminiBody(req)),
      signal: controller.signal,
    });
    if (!res.ok) return { type: "http_error", status: res.status };
    return parseGeminiResponse((await res.json()) as GeminiResponse);
  } catch {
    return { type: "timeout" };
  } finally {
    clearTimeout(timer);
  }
}
