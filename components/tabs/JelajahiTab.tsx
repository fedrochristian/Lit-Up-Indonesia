"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { track } from "../track";
import { YouTubePlayer } from "./YouTubePlayer";

export type VideoLite = { id: string; title: string; series: string; topic: string };
type Topic = { name: string; slug: string; count: number };

const PAGE_SIZE = 24;

function VideoCard({ video, onOpen, showTopic }: { video: VideoLite; onOpen: (v: VideoLite) => void; showTopic?: boolean }) {
  return (
    <button type="button" className="video-card" onClick={() => onOpen(video)}>
      <span className="video-thumb">
        {/* eslint-disable-next-line @next/next/no-img-element -- thumbnails come straight from YouTube's CDN, unoptimized on purpose */}
        <img src={`https://i.ytimg.com/vi/${video.id}/mqdefault.jpg`} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        <span className="play">
          <Icon name="play" size={16} />
        </span>
      </span>
      <span className="body">
        <span className="title">{video.title}</span>
        <span className="meta">{showTopic ? `${video.topic} · ${video.series}` : video.series}</span>
      </span>
    </button>
  );
}

function PlayerDialog({ video, onClose }: { video: VideoLite; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="player-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="player-panel" role="dialog" aria-modal="true" aria-labelledby="player-title">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
          <div>
            <h3 id="player-title">{video.title}</h3>
            <p className="meta">
              {video.topic} · {video.series} · Crash Course
            </p>
          </div>
          <button ref={closeRef} type="button" className="btn btn-ghost btn-small" onClick={onClose} aria-label="Tutup video">
            <Icon name="close" size={20} />
          </button>
        </div>
        <YouTubePlayer
          key={video.id}
          videoId={video.id}
          title={video.title}
          onPlay={() => track({ name: "embed_play", props: { video_id: video.id } })}
          onError={(code) => track({ name: "embed_error", props: { video_id: video.id, code } })}
        />
        <p className="meta">
          Video berbahasa Inggris; subtitle dinyalakan otomatis bila tersedia. Guruku tidak menonton video ini, jadi kalau kamu bertanya
          tentangnya, ceritakan bagian yang membuatmu penasaran.
        </p>
      </div>
    </div>
  );
}

export function JelajahiTab({ topics, initialPicks, total }: { topics: Topic[]; initialPicks: VideoLite[]; total: number }) {
  const [picks, setPicks] = useState(initialPicks);
  const [shuffling, setShuffling] = useState(false);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [videos, setVideos] = useState<VideoLite[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [series, setSeries] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [playing, setPlaying] = useState<VideoLite | null>(null);
  const closePlayer = useCallback(() => setPlaying(null), []);

  const chooseTopic = async (t: Topic) => {
    if (topic?.slug === t.slug) return;
    setTopic(t);
    setVideos(null);
    setLoadError(false);
    setSeries("");
    setQuery("");
    setLimit(PAGE_SIZE);
    try {
      const res = await fetch(`/api/jelajahi?topic=${encodeURIComponent(t.slug)}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { videos: VideoLite[] };
      setVideos(data.videos);
    } catch {
      setLoadError(true);
    }
  };

  const shuffle = async () => {
    setShuffling(true);
    try {
      const res = await fetch("/api/jelajahi?acak=1");
      if (res.ok) setPicks(((await res.json()) as { videos: VideoLite[] }).videos);
    } finally {
      setShuffling(false);
    }
  };

  const seriesOptions = useMemo(() => [...new Set((videos ?? []).map((v) => v.series))], [videos]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (videos ?? []).filter((v) => (!series || v.series === series) && (!q || v.title.toLowerCase().includes(q)));
  }, [videos, series, query]);

  return (
    <section aria-labelledby="jelajahi-title" className="stack" style={{ gap: 28 }}>
      <header className="tab-head">
        <span className="eyebrow">Jelajahi</span>
        <h1 id="jelajahi-title">Lah, kok seru.</h1>
        <p className="muted">Hari ini lagi penasaran apa? Pilih topik, putar satu video, lalu bawa pertanyaanmu ke Guruku.</p>
        <p className="notice">
          <Icon name="check" size={18} />
          <span>
            Semua {total.toLocaleString("id-ID")} video berasal dari kanal resmi Crash Course (@crashcourse): video pendek dan padat yang
            pas untuk memantik rasa ingin tahu sebelum belajar lebih dalam. Videonya berbahasa Inggris.
          </span>
        </p>
      </header>

      <section aria-labelledby="acak-title" className="stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 id="acak-title">Kejutan kecil</h2>
          <button type="button" className="btn btn-small" onClick={shuffle} disabled={shuffling}>
            <Icon name="shuffle" size={18} /> {shuffling ? "Mengacak…" : "Acak lagi"}
          </button>
        </div>
        <div className="video-grid">
          {picks.map((v) => (
            <VideoCard key={v.id} video={v} onOpen={setPlaying} showTopic />
          ))}
        </div>
      </section>

      <section aria-labelledby="topik-title" className="stack">
        <h2 id="topik-title">Jelajahi per topik</h2>
        <div className="topic-chips" role="group" aria-label="Topik">
          {topics.map((t) => (
            <button key={t.slug} type="button" className="chip" aria-pressed={topic?.slug === t.slug} onClick={() => chooseTopic(t)}>
              {t.name}
              <small>{t.count}</small>
            </button>
          ))}
        </div>

        {topic && (
          <div className="stack" aria-live="polite">
            <div className="filters">
              <h3 style={{ marginRight: "auto" }}>{topic.name}</h3>
              {seriesOptions.length > 1 && (
                <label className="field">
                  <span className="sr-only">Seri</span>
                  <select value={series} onChange={(e) => (setSeries(e.target.value), setLimit(PAGE_SIZE))}>
                    <option value="">Semua seri</option>
                    {seriesOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field">
                <Icon name="search" size={18} />
                <span className="sr-only">Cari judul</span>
                <input type="search" value={query} placeholder="Cari judul" onChange={(e) => (setQuery(e.target.value), setLimit(PAGE_SIZE))} />
              </label>
            </div>

            {loadError && <p className="notice notice-warn">Daftar video gagal dimuat. Coba pilih topiknya lagi.</p>}
            {!videos && !loadError && <p className="meta">Memuat video…</p>}
            {videos && filtered.length === 0 && <p className="meta">Tidak ada judul yang cocok.</p>}
            {videos && filtered.length > 0 && (
              <>
                <p className="meta">{filtered.length} video</p>
                <div className="video-grid">
                  {filtered.slice(0, limit).map((v) => (
                    <VideoCard key={v.id} video={v} onOpen={setPlaying} />
                  ))}
                </div>
                {filtered.length > limit && (
                  <button type="button" className="btn" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                    Tampilkan lebih banyak
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </section>

      {playing && <PlayerDialog video={playing} onClose={closePlayer} />}
    </section>
  );
}
