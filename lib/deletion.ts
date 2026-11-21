import { timingSafeEqual } from "node:crypto";
import type { EventName } from "./events";
import { receiptSignature } from "./hash";

/** Reference a learner can quote back: deletion_log id, e.g. LU-DEL-000123. */
export function deletionReference(id: number): string {
  return `LU-DEL-${String(id).padStart(6, "0")}`;
}

/** Calendar date in WIB (YYYY-MM-DD). */
export function wibDate(at: Date): string {
  return new Date(at.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

export type DeletionReceipt = { reference: string; date: string };

/** Query string for /masuk after an in-app deletion. */
export function receiptQuery(receipt: DeletionReceipt, env?: Record<string, string | undefined>): string {
  const q = new URLSearchParams({ hapus: "selesai", ref: receipt.reference, tgl: receipt.date, sig: receiptSignature(receipt.reference, receipt.date, env) });
  return q.toString();
}

/** The receipt from /masuk query params, or null unless the server signed exactly this reference and date. */
export function readDeletionReceipt(params: Record<string, unknown>, env?: Record<string, string | undefined>): DeletionReceipt | null {
  const { ref, tgl, sig } = params;
  if (typeof ref !== "string" || typeof tgl !== "string" || typeof sig !== "string") return null;
  if (!/^LU-DEL-\d{6,}$/.test(ref) || !/^\d{4}-\d{2}-\d{2}$/.test(tgl)) return null;
  let expected: string;
  try {
    expected = receiptSignature(ref, tgl, env);
  } catch {
    return null;
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b) ? { reference: ref, date: tgl } : null;
}

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
  const { deletion_id, completed_at, ...counts } = await deps.rpc<{ deletion_id: number; completed_at: string } & Record<string, number | string>>(
    "delete_account_data",
    {
      p_account_hash: target.accountHash,
      p_method: method,
      p_requested_at: (requestedAt ?? new Date()).toISOString(),
    },
  );
  await deps.deleteAuthUser(target.userId);
  await deps.logEvent("deletion_done", { method }, null);
  const receipt: DeletionReceipt = { reference: deletionReference(deletion_id), date: wibDate(new Date(completed_at)) };
  return { ...receipt, counts: counts as Record<string, number> };
}
