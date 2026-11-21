import Image from "next/image";
import { redirect } from "next/navigation";
import { currentLearner } from "@/lib/auth/session";
import { readDeletionReceipt } from "@/lib/deletion";
import { SignInForm } from "./SignInForm";

const NOTES: Record<string, { tone: "warn" | "danger" | "ok"; text: string }> = {
  tautan: { tone: "warn", text: "Tautan masuk tidak valid atau sudah kedaluwarsa. Minta tautan baru di bawah." },
  akses: { tone: "danger", text: "Akses ditolak. Akun ini tidak terdaftar untuk uji internal Lit Up." },
  selesai: { tone: "ok", text: "Akun dan datamu sudah dihapus. Terima kasih sudah ikut menguji Lit Up." },
};

function deletionNote(params: Record<string, unknown>): string {
  const receipt = readDeletionReceipt(params);
  if (!receipt) return NOTES.selesai.text;
  const day = new Date(`${receipt.date}T00:00:00Z`);
  if (Number.isNaN(day.getTime())) return NOTES.selesai.text;
  const date = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(day);
  return `Akun dan datamu sudah dihapus pada ${date} (WIB). Nomor referensi: ${receipt.reference}. Terima kasih sudah ikut menguji Lit Up.`;
}

export default async function MasukPage(props: PageProps<"/masuk">) {
  const auth = await currentLearner();
  if (auth.status === "ok") redirect("/");

  const params = await props.searchParams;
  const key = typeof params.galat === "string" ? params.galat : params.hapus === "selesai" ? "selesai" : "";
  const note = key === "selesai" ? { ...NOTES.selesai, text: deletionNote(params) } : NOTES[key];

  return (
    <>
      <div className="proto-banner" role="note">
        <i aria-hidden="true" />
        Versi uji internal · khusus peserta uji yang diundang · bukan rilis publik
      </div>
      <main className="signin">
        <div className="signin-card card">
          <div className="logo-gutter">
            <span className="logo-tile">
              <Image src="/brand/litup-logo-master.png" alt="Lit Up" width={88} height={88} priority />
            </span>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <h1>Masuk ke Lit Up</h1>
            <p className="muted">
              Lit Up sedang diuji secara internal. Masukkan email peserta uji, nanti kami kirim tautan masuk. Tidak perlu kata sandi.
            </p>
          </div>
          {note && (
            <p className={`notice ${note.tone === "danger" ? "notice-danger" : note.tone === "warn" ? "notice-warn" : ""}`} role="status">
              {note.text}
            </p>
          )}
          {auth.status === "unconfigured" ? (
            <p className="notice notice-warn">Layanan masuk belum dikonfigurasi di lingkungan ini.</p>
          ) : (
            <SignInForm />
          )}
          <p className="meta">Pendaftaran publik belum dibuka. Email yang tidak terdaftar tidak akan dibuatkan akun.</p>
        </div>
      </main>
    </>
  );
}
