"use client";

import { useActionState, useEffect, useRef } from "react";
import { deleteMyAccount, type DeleteState } from "@/app/akun/actions";
import { Icon } from "./Icon";

export function DeleteAccountDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<DeleteState, FormData>(deleteMyAccount, { status: "idle" });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="sheet" onClose={onClose} aria-labelledby="hapus-title">
      <form action={action} className="stack">
        <h2 id="hapus-title">Hapus akun &amp; data</h2>
        <p>Ini menghapus akunmu secara permanen, langsung saat itu juga:</p>
        <ul className="meta" style={{ margin: 0, paddingLeft: 20 }}>
          <li>akun masuk dan profilmu,</li>
          <li>jejak belajar di Belajarku dan catatan pemakaian Guruku,</li>
          <li>semua catatan aktivitas yang terhubung ke akunmu.</li>
        </ul>
        <p className="meta">
          Total biaya AI tetap disimpan hanya sebagai angka gabungan tanpa identitas. Kami mencatat tanggal penghapusan. Salinan cadangan
          database kedaluwarsa paling lama 30 hari. Kamu juga bisa meminta penghapusan lewat tim Lit Up.
        </p>
        <label className="stack" style={{ gap: 6 }}>
          <span>
            Ketik <strong>HAPUS</strong> untuk mengonfirmasi
          </span>
          <input type="text" name="confirm" autoComplete="off" required />
        </label>
        {state.status === "error" && (
          <p className="notice notice-danger" role="alert">
            {state.message}
          </p>
        )}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn btn-danger" disabled={pending}>
            <Icon name="trash" size={18} /> {pending ? "Menghapus…" : "Hapus permanen"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
