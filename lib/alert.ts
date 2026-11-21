import "server-only";

/**
 * Operator alert for the Rp4m monthly threshold. The free route has no email
 * sender, so the alert is always written to the server log (Vercel logs) and
 * the spend_month/alert row; ALERT_WEBHOOK_URL (optional, e.g. a Teams or
 * Slack incoming webhook) also receives it.
 */
export async function sendOperatorAlert(text: string): Promise<void> {
  console.error(`[ALERT] ${text}${process.env.ALERT_EMAIL_TO ? " (notify ALERT_EMAIL_TO)" : ""}`);
  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    console.error(`[ALERT] webhook failed: ${(err as Error).message}`);
  }
}
