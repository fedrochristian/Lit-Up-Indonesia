"use client";

import { useEffect } from "react";
import { Icon } from "../Icon";
import { track } from "../track";

const LATER = [
  { title: "Lingkar minat", body: "Kumpul dengan teman yang penasaran pada hal yang sama, misalnya lingkar piano atau lingkar astronomi." },
  { title: "Belajar bareng", body: "Ajakan dua arah untuk belajar bersama, hanya kalau kedua pihak setuju." },
  { title: "Agen AI di Google Meet", body: "Agen belajar yang kamu beri nama sendiri, membantu diskusi saat belajar bareng lewat Meet." },
];

export function KomunitasTab() {
  useEffect(() => {
    track({ name: "komunitas_preview_view" });
  }, []);

  return (
    <section aria-labelledby="komunitas-title" className="stack" style={{ gap: 24 }}>
      <header className="tab-head">
        <span className="eyebrow">Komunitas</span>
        <div className="komunitas-hero">
          <span className="badge-icon">
            <Icon name="group" size={34} />
          </span>
          <div className="stack" style={{ gap: 4 }}>
            <h1 id="komunitas-title">Ngobrol dan belajar bareng teman</h1>
            <p className="muted">Ruang kita, komunitas belajar Lit Up.</p>
          </div>
        </div>
        <p className="notice notice-warn" role="note">
          <Icon name="alert" size={18} />
          <span>
            <strong>Pratinjau, belum aktif.</strong> Belum ada obrolan, grup, unggahan, lokasi, atau kontak antarpeserta. Riwayat Guruku-mu
            tetap pribadi dan tidak pernah dibagikan di sini.
          </span>
        </p>
      </header>

      <section aria-labelledby="later-title" className="stack">
        <h2 id="later-title">Yang sedang kami siapkan</h2>
        <div className="later-list">
          {LATER.map((item) => (
            <article key={item.title} className="card stack" style={{ gap: 8 }}>
              <span className="pill">Nanti</span>
              <h3>{item.title}</h3>
              <p className="meta">{item.body}</p>
            </article>
          ))}
        </div>
        <p className="meta">
          Fitur komunitas baru dibuka setelah persetujuan peserta, pemeriksaan usia, dan tinjauan keamanan serta moderasi. Tidak ada yang
          bisa menghubungimu tanpa persetujuanmu.
        </p>
      </section>
    </section>
  );
}
