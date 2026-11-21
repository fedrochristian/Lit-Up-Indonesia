/**
 * List prices in USD per 1M tokens. Thinking tokens bill at the output rate.
 * QA condition (a): confirm against https://ai.google.dev/gemini-api/docs/pricing
 * before deploy. A model without an entry here is refused (no unpriced calls).
 */
export const MODEL_PRICES_USD_PER_M: Record<string, { input: number; output: number }> = {
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
};

export type Usage = { tokensIn: number; tokensOut: number; thinkingTokens: number };

export function callCostIdr(model: string, usage: Usage, usdIdrRate: number): number {
  const price = MODEL_PRICES_USD_PER_M[model];
  if (!price) throw new Error(`no price for ${model}`);
  const usd =
    (usage.tokensIn * price.input + (usage.tokensOut + usage.thinkingTokens) * price.output) / 1_000_000;
  return Math.ceil(usd * usdIdrRate);
}

export function worstCaseCallIdr(config: {
  model: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  thinkingAllowanceTokens: number;
  usdIdrRate: number;
}): number {
  return callCostIdr(
    config.model,
    {
      tokensIn: config.maxInputTokens,
      tokensOut: config.maxOutputTokens,
      thinkingTokens: config.thinkingAllowanceTokens,
    },
    config.usdIdrRate,
  );
}
