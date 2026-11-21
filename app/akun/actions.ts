"use server";

import { redirect } from "next/navigation";
import { currentLearner } from "@/lib/auth/session";
import { deleteAccount } from "@/lib/deletion";
import { logEvent } from "@/lib/server-events";
import { adminClient, rpc } from "@/lib/supabase/admin";
import { serverClient } from "@/lib/supabase/server";

export type DeleteState = { status: "idle" | "error"; message?: string };

export async function deleteMyAccount(_prev: DeleteState, formData: FormData): Promise<DeleteState> {
  if (formData.get("confirm") !== "HAPUS") {
    return { status: "error", message: 'Ketik HAPUS (huruf besar) untuk mengonfirmasi.' };
  }
  const auth = await currentLearner();
  if (auth.status !== "ok") return { status: "error", message: "Sesi berakhir. Masuk lagi dulu." };

  let done: Awaited<ReturnType<typeof deleteAccount>>;
  try {
    done = await deleteAccount({ userId: auth.learner.userId, accountHash: auth.learner.accountHash }, "in_app", {
      rpc,
      deleteAuthUser: async (userId) => {
        const { error } = await adminClient().auth.admin.deleteUser(userId);
        if (error) throw new Error(error.message);
      },
      logEvent,
    });
  } catch (err) {
    console.error(`[deletion] in-app deletion failed: ${(err as Error).message}`);
    return { status: "error", message: "Penghapusan gagal. Coba lagi, atau minta tim Lit Up menghapusnya." };
  }

  const supabase = await serverClient();
  await supabase.auth.signOut();
  redirect(`/masuk?hapus=selesai&ref=${done.reference}&tgl=${done.date}`);
}
