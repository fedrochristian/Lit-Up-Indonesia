"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AI_DISCLOSURE, HARD_STOP_MESSAGE, SAFETY_PENDING_MESSAGE } from "@/lib/guru/safety";
import { Icon } from "../Icon";

const MAX_CHARS = 1500;

type Msg = { id: number; role: "user" | "model" | "system"; text: string; sig?: string; retry?: string };

export type GuruUsage =
  | { mode: "trial"; session_no: number; session_open: boolean; used: number; limit: number; sessions_used: number; trial_sessions: number; hard_stop: boolean }
  | { mode: "free"; used: number; limit: number; sessions_used: number; hard_stop: boolean }
  | { mode: "pilot"; used: number; limit: number; hard_stop: boolean };

type GuruResponse =
  | { status: "ok"; reply: string; sig: string; kind: "normal" | "short" }
  | { status: "provider_error" }
  | { status: "rate_limited"; scope: "user" | "ip" }
  | { status: "cap"; cap: "pilot_daily" | "free_monthly" }
  | { status: "hard_stop" }
  | { status: "invalid"; message: string }
  | { status: "unavailable"; reason?: "safety_text_pending" }
  | { status: "unauthorized" };

let nextId = 1;

export function usageLabel(u: GuruUsage): string {
  if (u.mode === "pilot") return `Pesan hari ini: ${u.used}/${u.limit} (peserta uji)`;
  if (u.mode === "free") return `Masa coba selesai · jawaban singkat bulan ini: ${u.used}/${u.limit}`;
  return `Sesi coba ${u.session_no} dari ${u.trial_sessions} · ${u.used}/${u.limit} pesan`;
}

/** Chat state lives above the tabs so switching tabs keeps the conversation (page memory only). */
export function useGuruChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [usage, setUsage] = useState<GuruUsage | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "hard_stop" | "unavailable" | "pending">("idle");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/guru", { cache: "no-store" });
      if (!res.ok) {
        setState((s) => (s === "sending" ? s : "unavailable"));
        return;
      }
      const data = (await res.json()) as { usage: GuruUsage; available: boolean; closedReason: string | null };
      setUsage(data.usage);
      setState((s) => {
        if (s === "sending") return s;
        if (data.closedReason === "safety_text_pending") return "pending";
        if (data.usage.hard_stop) return "hard_stop";
        return data.available ? "idle" : "unavailable";
      });
    } catch {
      setState((s) => (s === "sending" ? s : "unavailable"));
    }
  }, []);

  const push = (m: Omit<Msg, "id">) => setMessages((list) => [...list, { ...m, id: nextId++ }]);

  const send = useCallback(
    async (text: string) => {
      const history = messages
        .filter((m) => m.role !== "system")
        .slice(-12)
        .map((m) => (m.role === "model" ? { role: m.role, text: m.text, sig: m.sig } : { role: m.role, text: m.text }));
      push({ role: "user", text });
      setState("sending");
      let next: typeof state = "idle";
      try {
        const res = await fetch("/api/guru", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: text, history }),
        });
        const data = (await res.json()) as GuruResponse;
        switch (data.status) {
          case "ok":
            push({ role: "model", text: data.reply, sig: data.sig });
            break;
          case "provider_error":
            push({ role: "system", text: "Guruku gagal menjawab kali ini.", retry: text });
            break;
          case "rate_limited":
            push({ role: "system", text: "Pelan-pelan dulu ya. Tunggu sebentar sebelum mengirim pesan lagi." });
            break;
          case "cap":
            push({
              role: "system",
              text:
                data.cap === "pilot_daily"
                  ? "Batas pesan hari ini sudah tercapai. Guruku bisa dipakai lagi besok (mulai 00.00 WIB)."
                  : "Jawaban singkat gratis bulan ini sudah habis. Kuotanya kembali tanggal 1 pukul 00.00 WIB.",
            });
            break;
          case "hard_stop":
            push({ role: "system", text: HARD_STOP_MESSAGE });
            next = "hard_stop";
            break;
          case "invalid":
            push({ role: "system", text: data.message });
            break;
          case "unauthorized":
            router.push("/masuk");
            return;
          case "unavailable":
            if (data.reason === "safety_text_pending") {
              next = "pending";
              break;
            }
            push({ role: "system", text: "Guruku sedang tidak tersedia. Jelajahi dan Belajarku tetap bisa dibuka." });
            next = "unavailable";
            break;
          default:
            push({ role: "system", text: "Guruku sedang tidak tersedia. Jelajahi dan Belajarku tetap bisa dibuka." });
            next = "unavailable";
        }
      } catch {
        push({ role: "system", text: "Koneksi terputus sebelum Guruku menjawab.", retry: text });
      }
      setState(next);
      void refresh();
    },
    [messages, refresh, router],
  );

  const endSession = useCallback(async () => {
    await fetch("/api/guru/end-session", { method: "POST" }).catch(() => {});
    push({ role: "system", text: "Sesi coba diakhiri. Pesan berikutnya membuka sesi baru, kalau masih ada." });
    void refresh();
  }, [refresh]);

  return { messages, usage, state, send, refresh, endSession };
}

export function GurukuTab({ chat }: { chat: ReturnType<typeof useGuruChat> }) {
  const [draft, setDraft] = useState("");
  const listEnd = useRef<HTMLDivElement>(null);
  const { messages, usage, state, send, refresh, endSession } = chat;

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, state]);

  const blocked = state === "hard_stop" || state === "unavailable" || state === "pending";
  const canSend = draft.trim().length > 0 && draft.length <= MAX_CHARS && state === "idle";

  const submit = () => {
    if (!canSend) return;
    const text = draft.trim();
    setDraft("");
    void send(text);
  };

  return (
    <section aria-labelledby="guruku-title" className="stack" style={{ gap: 20 }}>
      <header className="tab-head">
        <span className="eyebrow">Guruku</span>
        <h1 id="guruku-title">Pertanyaanmu, arahmu.</h1>
        <p className="notice" role="note">
          <Icon name="alert" size={18} />
          <span>
            {AI_DISCLOSURE} Percakapan hanya ada di halaman ini dan hilang saat halaman ditutup. Jangan tulis data pribadi seperti nama
            lengkap, alamat, sekolah, atau nomor telepon.
          </span>
        </p>
        {usage && (
          <div className="row">
            <span className="pill">{usageLabel(usage)}</span>
            {usage.mode === "trial" && usage.session_open && (
              <button type="button" className="btn btn-small" onClick={endSession} disabled={state === "sending"}>
                Akhiri sesi
              </button>
            )}
          </div>
        )}
      </header>

      {state === "pending" && (
        <p className="notice notice-warn" role="status">
          {SAFETY_PENDING_MESSAGE}
        </p>
      )}

      {state === "hard_stop" && (
        <p className="notice notice-warn" role="status">
          {HARD_STOP_MESSAGE}
        </p>
      )}

      <div className="chat" aria-live="polite">
        {messages.length === 0 && !blocked && (
          <div className="bubble model">
            Halo! Aku Guruku. Tanyakan apa saja yang ingin kamu pahami, misalnya sesuatu dari video Crash Course yang baru kamu tonton.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role}`}>
            {m.role === "model" && <span className="sr-only">Guruku: </span>}
            {m.text}
            {m.retry && state === "idle" && (
              <div className="row" style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-small" onClick={() => send(m.retry!)}>
                  Coba lagi
                </button>
                <span className="meta">Mencoba lagi dihitung sebagai 1 pesan.</span>
              </div>
            )}
          </div>
        ))}
        {state === "sending" && (
          <div className="bubble model" aria-label="Guruku sedang menulis">
            <span className="typing" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
          </div>
        )}
        <div ref={listEnd} />
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="guru-input" className="sr-only">
          Pertanyaan untuk Guruku
        </label>
        <textarea
          id="guru-input"
          value={draft}
          maxLength={MAX_CHARS}
          disabled={blocked}
          placeholder={blocked ? "Guruku belum bisa menjawab saat ini." : "Tulis pertanyaanmu…"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer-foot">
          <span className="meta">
            {draft.length}/{MAX_CHARS} · Enter untuk kirim, Shift+Enter untuk baris baru
          </span>
          <button className="btn btn-primary btn-small" type="submit" disabled={!canSend}>
            <Icon name="send" size={18} /> Kirim
          </button>
        </div>
      </form>
    </section>
  );
}
