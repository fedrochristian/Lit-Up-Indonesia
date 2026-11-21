import type { EventName } from "./events";

export type DeletionDeps = {
  rpc: <T>(fn: string, args: Record<string, unknown>) => Promise<T>;
  deleteAuthUser: (userId: string) => Promise<void>;
  logEvent: (name: EventName, props: Record<string, unknown>, accountHash: string | null) => Promise<void>;
};

/**
 * Hard delete for "Hapus akun & data" (MD Identifiers and deletion, Elon 07:25):
 * profile, Guruku/Belajarku usage and every event go; ledger amounts stay with
 * the account reference removed; deletion_log keeps the dated record. The
 * deletion_done event carries no account reference.
 */
export async function deleteAccount(
  target: { userId: string; accountHash: string },
  method: "manual" | "in_app",
  deps: DeletionDeps,
  requestedAt?: Date,
) {
  const counts = await deps.rpc<Record<string, number>>("delete_account_data", {
    p_account_hash: target.accountHash,
    p_method: method,
    p_requested_at: (requestedAt ?? new Date()).toISOString(),
  });
  await deps.deleteAuthUser(target.userId);
  await deps.logEvent("deletion_done", { method }, null);
  return counts;
}
