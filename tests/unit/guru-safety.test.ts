import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { buildGeminiBody, callGemini, parseGeminiResponse } from "../../lib/guru/gemini";
import { GURU_PROMPT, GURU_UI_TEXT, type GuruPromptText } from "../../lib/guru/prompt-text";
import {
  AI_DISCLOSURE,
  buildSystemPrompt,
  guruPromptReady,
  HARD_STOP_MESSAGE,
  SAFETY_BLOCK_MESSAGE,
  SafetyTextPendingError,
} from "../../lib/guru/safety";
import { LINK_REMOVED, stripNonWhitelistLinks } from "../../lib/guru/sanitize";

const PENDING: GuruPromptText = { status: "awaiting_merged_text", safetyRuleId: null, safetyRule: null };
const MERGED: GuruPromptText = {
  status: "final",
  safetyRuleId: "LU-GURU-SAFETY-20261122",
  safetyRule: "Merged rule line one.\nMerged rule line two, with 'quotes' and Bahasa: tanya guru atau orang tua kamu.",
};

describe("Guruku safety text slot (awaiting LU-GURU-SAFETY merged text from Elon)", () => {
  test("a placeholder is never sent to the model", () => {
    assert.equal(guruPromptReady(PENDING), false);
    assert.throws(() => buildSystemPrompt("normal", PENDING), SafetyTextPendingError);
    assert.equal(guruPromptReady({ ...MERGED, status: "awaiting_merged_text" }), false);
    assert.equal(guruPromptReady({ ...MERGED, safetyRule: "   " }), false);
    assert.equal(guruPromptReady({ ...MERGED, safetyRuleId: "draft" }), false);
  });

  test("the repo's slot is either still pending (and closed) or complete", () => {
    if (GURU_PROMPT.status === "final") assert.equal(guruPromptReady(GURU_PROMPT), true);
    else assert.throws(() => buildSystemPrompt("normal"), /awaiting LU-GURU-SAFETY merged text from Elon/);
  });

  test("once dropped in, both modes carry the merged text verbatim under its rule ID", () => {
    for (const kind of ["normal", "short"] as const) {
      const prompt = buildSystemPrompt(kind, MERGED);
      assert.ok(prompt.includes(`LU-GURU-SAFETY-20261122:\n${MERGED.safetyRule}\n`), kind);
    }
    assert.match(buildSystemPrompt("short", MERGED), /paling banyak 3 kalimat/);
  });

  test("the MD's LU-GURU-SAFETY-20261121 wording is not used anywhere in the prompt", () => {
    const prompt = buildSystemPrompt("normal", MERGED);
    assert.ok(!prompt.includes("LU-GURU-SAFETY-20261121"));
    assert.ok(!prompt.includes("answers learning topics only"));
  });

  test("UI slots read from the single text file; hard stop keeps 'Guru sedang istirahat'", () => {
    assert.equal(AI_DISCLOSURE, GURU_UI_TEXT.aiDisclosure);
    assert.equal(HARD_STOP_MESSAGE, GURU_UI_TEXT.hardStop);
    assert.equal(SAFETY_BLOCK_MESSAGE, GURU_UI_TEXT.refusal);
    assert.ok(HARD_STOP_MESSAGE.startsWith("Guru sedang istirahat"));
  });

  test("no other source file carries safety or slot wording", () => {
    const files = ["app", "components", "lib"].flatMap((dir) =>
      readdirSync(dir, { recursive: true, encoding: "utf8" })
        .filter((f) => /\.(ts|tsx)$/.test(f))
        .map((f) => join(dir, f)),
    );
    const needles = ["LU-GURU-SAFETY-2", "Guru sedang istirahat", GURU_UI_TEXT.aiDisclosure, GURU_UI_TEXT.refusal];
    const offenders = files.filter(
      (f) => f !== join("lib", "guru", "prompt-text.ts") && needles.some((n) => readFileSync(f, "utf8").includes(n)),
    );
    assert.deepEqual(offenders, []);
  });
});

describe("links outside the Jelajahi whitelist are removed from replies", () => {
  const whitelisted = (id: string) => id === "uBGl2BujkPQ";

  test("keeps whitelisted YouTube links, removes everything else", () => {
    const text =
      "Tonton https://www.youtube.com/watch?v=uBGl2BujkPQ. Juga https://youtu.be/uBGl2BujkPQ, lalu https://example.com/x dan www.evil.test/a serta https://www.youtube.com/watch?v=AAAAAAAAAAA!";
    const out = stripNonWhitelistLinks(text, whitelisted);
    assert.ok(out.includes("https://www.youtube.com/watch?v=uBGl2BujkPQ."));
    assert.ok(out.includes("https://youtu.be/uBGl2BujkPQ,"));
    assert.ok(!out.includes("example.com"));
    assert.ok(!out.includes("evil.test"));
    assert.ok(!out.includes("AAAAAAAAAAA"));
    assert.equal(out.split(LINK_REMOVED).length - 1, 3);
  });
});

describe("Gemini request shape", () => {
  const req = {
    model: "gemini-3.5-flash-lite",
    system: "sys",
    turns: [{ role: "user" as const, text: "halo" }],
    maxOutputTokens: 400,
    thinkingBudgetTokens: 512,
  };

  test("no tools or grounding, capped output and thinking, strict safety settings", () => {
    const body = buildGeminiBody(req);
    assert.equal("tools" in body, false);
    assert.equal(body.generationConfig.maxOutputTokens, 400);
    assert.equal(body.generationConfig.thinkingConfig.thinkingBudget, 512);
    assert.equal(body.safetySettings.length, 4);
    assert.ok(body.safetySettings.every((s) => s.threshold === "BLOCK_LOW_AND_ABOVE"));
  });

  test("parses text, skips thought parts, maps usage including thinking tokens", () => {
    const parsed = parseGeminiResponse({
      candidates: [{ content: { parts: [{ text: "pikir", thought: true }, { text: "Jawaban" }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 30, thoughtsTokenCount: 40 },
    });
    assert.equal(parsed.text, "Jawaban");
    assert.equal(parsed.blocked, false);
    assert.deepEqual(parsed.usage, { tokensIn: 120, tokensOut: 30, thinkingTokens: 40 });
  });

  test("safety-blocked responses are flagged", () => {
    assert.equal(parseGeminiResponse({ promptFeedback: { blockReason: "SAFETY" } }).blocked, true);
    assert.equal(parseGeminiResponse({ candidates: [{ finishReason: "SAFETY" }] }).blocked, true);
  });

  test("HTTP errors are 'no charge'; network failures are 'unknown charge'", async () => {
    const http = await callGemini(req, "k", 1000, async () => new Response("{}", { status: 429 }));
    assert.deepEqual(http, { type: "http_error", status: 429 });
    const net = await callGemini(req, "k", 1000, async () => {
      throw new TypeError("fetch failed");
    });
    assert.deepEqual(net, { type: "timeout" });
  });

  test("sends the key in a header, never in the URL", async () => {
    let seenUrl = "";
    let seenKey = "";
    await callGemini(req, "secret-key", 1000, async (url, init) => {
      seenUrl = String(url);
      seenKey = new Headers(init?.headers).get("x-goog-api-key") ?? "";
      return Response.json({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });
    });
    assert.ok(!seenUrl.includes("secret-key"));
    assert.equal(seenKey, "secret-key");
    assert.ok(seenUrl.endsWith("/models/gemini-3.5-flash-lite:generateContent"));
  });
});
