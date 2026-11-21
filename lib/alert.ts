import "server-only";
import { alertPayload } from "./alert-payload";

/**
 * Operator alert for the Rp4m monthly threshold. The free route has no email
 * sender, so the alert is always written to the server log (Vercel logs) and
 * the spend_month/alert row; ALERT_WEBHOOK_URL (optional Slack, Google Chat
 * or Discord incoming webhook) also receives it. See docs/DEPLOY-RUNBOOK.md.
 */
export async function sendOperatorAlert(text: string): Promise<void> {
  console.error(`[ALERT] ${text}${process.env.ALERT_EMAIL_TO ? " (notify ALERT_EMAIL_TO)" : ""}`);
  const webhook = process.env.ALERT_WEBHOOK_URL;
  if (!webhook) return;
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(alertPayload(webhook, text)),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error(`[ALERT] webhook returned HTTP ${res.status}`);
  } catch (err) {
    console.error(`[ALERT] webhook failed: ${(err as Error).message}`);
  }
}
