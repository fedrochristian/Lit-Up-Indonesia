/**
 * Body for an incoming-webhook alert. Slack and Google Chat take {text};
 * Discord takes {content}. Google Chat rejects unknown fields, so only one
 * shape is sent.
 */
export function alertPayload(webhookUrl: string, text: string): { text: string } | { content: string } {
  let host = "";
  try {
    host = new URL(webhookUrl).hostname;
  } catch {
    // invalid URL: fetch will fail and be logged
  }
  return /(^|\.)discord(app)?\.com$/.test(host) ? { content: text } : { text };
}
