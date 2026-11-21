import "server-only";
import { appEnv, appVersion } from "./config";
import { sanitizeEventProps, type EventName } from "./events";
import { adminClient } from "./supabase/admin";

/** Best effort: an analytics failure never blocks the learner. */
export async function logEvent(
  name: EventName,
  props: Record<string, unknown>,
  accountHash: string | null,
): Promise<void> {
  const clean = sanitizeEventProps(name, props);
  if (clean === null) {
    console.error(`[events] dropped ${name}: invalid props`);
    return;
  }
  try {
    const { error } = await adminClient()
      .from("events")
      .insert({ name, props: clean, account_hash: accountHash, app_version: appVersion(), env: appEnv() });
    if (error) console.error(`[events] insert ${name} failed: ${error.message}`);
  } catch (err) {
    console.error(`[events] insert ${name} failed: ${(err as Error).message}`);
  }
}
