"use client";

import { useEffect, useState } from "react";
import { HARD_STOP_MESSAGE } from "@/lib/guru/safety";
import type { TabId } from "@/lib/tabs";
import { Icon } from "../Icon";
import { track } from "../track";
import { usageLabel, type GuruUsage } from "./GurukuTab";

type Watched = { id: string; title: string; topic: string; series: string; ts: string };
type Data = { watched: Watched[]; usage: GuruUsage };

const PLAN: { title: string; body: string; tab: TabId }[] = [
  { title: "Pilih satu topik yang bikin penasaran", body: "Di Jelajahi, mulai dari topik apa saja. Tidak ada urutan wajib.", tab: "jelajahi" },
  { title: "Tonton satu video sampai selesai", body: "Catat satu hal yang paling bikin kamu bertanya-tanya.", tab: "jelajahi" },
  { title: "Bawa pertanyaanmu ke Guruku", body: "Minta penjelasan langsung, atau minta diajak berpikir pelan-pelan.", tab: "guruku" },
];

const dateFmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

export function BelajarkuTab({ onOpen }: { onOpen: (tab: TabId) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    track({ name: "plan_view" });
    let cancelled = false;
    fetch("/api/belajarku", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const json = (await res.json()) as Data;
        if (!cancelled) setData(json);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const usage = data?.usage;
  const pct = usage && usage.limit > 0 ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;

  return (
    <section aria-labelledby="belajarku-title" className="stack" style={{ gap: 24 }}>
      <header className="tab-head">
        <span className="eyebrow">Belajarku</span>
        <h1 id="belajarku-title">Tersimpan, bukan harus selesai.</h1>
        <p className="muted">Rencana dan jejak belajarmu. Kamu boleh ganti arah kapan saja.</p>
        <p className="notice" role="note">
          <Icon name="alert" size={18} />
          <span>Uji internal: rencana di sini hanya tampilan, belum bisa diubah, disimpan, atau disesuaikan otomatis.</span>
        </p>
      </header>

      <div className="grid-2">
        <section className="card stack" aria-labelledby="plan-title">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 id="plan-title">Rencanamu</h2>
            <span className="pill">Tampilan saja</span>
          </div>
          <ol className="plan-steps">
            {PLAN.map((step, i) => (
              <li key={step.title}>
                <span className="num" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="stack" style={{ gap: 4 }}>
                  <strong>{step.title}</strong>
                  <span className="meta">{step.body}</span>
                  <button type="button" className="btn btn-ghost btn-small" style={{ alignSelf: "flex-start", paddingLeft: 0 }} onClick={() => onOpen(step.tab)}>
                    Buka {step.tab === "guruku" ? "Guruku" : "Jelajahi"} →
                  </button>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="card stack" aria-labelledby="guru-usage-title">
          <h2 id="guru-usage-title">Guruku</h2>
          {usage ? (
            <>
              <p>{usageLabel(usage)}</p>
              <div className="meter" aria-hidden="true">
                <span style={{ width: `${pct}%` }} />
              </div>
              {usage.hard_stop && <p className="notice notice-warn">{HARD_STOP_MESSAGE}</p>}
              <p className="meta">Isi percakapan Guruku tidak disimpan. Yang tercatat hanya jumlah pesan untuk batas pemakaian.</p>
            </>
          ) : (
            <p className="meta">{failed ? "Status Guruku belum bisa dimuat." : "Memuat…"}</p>
          )}
        </section>
      </div>

      <section className="card stack" aria-labelledby="trace-title">
        <h2 id="trace-title">Jejak belajar</h2>
        <p className="meta">Video yang pernah kamu mulai putar di Jelajahi, terbaru di atas.</p>
        {failed && <p className="notice notice-warn">Jejak belajar belum bisa dimuat. Coba buka tab ini lagi.</p>}
        {data && data.watched.length === 0 && (
          <p className="muted">Belum ada jejak. Putar satu video di Jelajahi, nanti muncul di sini.</p>
        )}
        {data && data.watched.length > 0 && (
          <ul className="trace">
            {data.watched.map((v) => (
              <li key={v.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- YouTube CDN thumbnail */}
                <img src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" loading="lazy" referrerPolicy="no-referrer" />
                <span className="stack" style={{ gap: 2 }}>
                  <strong style={{ fontSize: 15, lineHeight: "20px" }}>{v.title}</strong>
                  <span className="meta">
                    {v.topic} · {dateFmt.format(new Date(v.ts))} WIB
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
