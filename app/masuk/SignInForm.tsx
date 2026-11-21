"use client";

import { useActionState } from "react";
import { requestSignInLink, type SignInState } from "./actions";

export function SignInForm() {
  const [state, action, pending] = useActionState<SignInState, FormData>(requestSignInLink, { status: "idle" });
  return (
    <form action={action} noValidate>
      <label htmlFor="email" className="meta">
        Email
      </label>
      <input id="email" name="email" type="email" autoComplete="email" inputMode="email" required placeholder="nama@contoh.com" />
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Mengirim…" : "Kirim tautan masuk"}
      </button>
      {state.status !== "idle" && (
        <p className={`notice ${state.status === "sent_or_denied" ? "" : "notice-warn"}`} role="status" aria-live="polite">
          {state.message}
        </p>
      )}
    </form>
  );
}
