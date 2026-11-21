"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";

type YTPlayer = { destroy(): void };
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      host?: string;
      videoId: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onStateChange?: (e: { data: number }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

function loadIframeApi(): Promise<YTNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiPromise = null;
      reject(new Error("iframe api failed"));
    };
    document.head.appendChild(script);
  });
  return apiPromise;
}

const PLAYING = 1;

/** YouTube onError codes: https://developers.google.com/youtube/iframe_api_reference#onError */
function errorText(code: number): string {
  switch (code) {
    case 100:
      return "Video ini sudah tidak tersedia di YouTube (dihapus atau dijadikan privat).";
    case 101:
    case 150:
      return "Pemilik video tidak mengizinkan video ini diputar di luar YouTube.";
    case 153:
      return "YouTube menolak memutar video ini karena tidak menerima identitas situs (kode 153).";
    case 2:
      return "Permintaan ke pemutar YouTube tidak valid.";
    case 5:
      return "Browser ini tidak bisa memutar video ini.";
    default:
      return "Pemutar YouTube tidak bisa dimuat. Periksa koneksi atau pemblokir konten.";
  }
}

export function YouTubePlayer({
  videoId,
  title,
  onPlay,
  onError,
}: {
  videoId: string;
  title: string;
  onPlay: () => void;
  onError: (code: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<number | null>(null);
  const callbacks = useRef({ onPlay, onError });

  useEffect(() => {
    callbacks.current = { onPlay, onError };
  });

  useEffect(() => {
    const container = hostRef.current;
    if (!container) return;
    let player: YTPlayer | null = null;
    let cancelled = false;
    let played = false;
    const target = document.createElement("div");
    container.appendChild(target);

    loadIframeApi()
      .then((YT) => {
        if (cancelled) return;
        player = new YT.Player(target, {
          host: "https://www.youtube-nocookie.com",
          videoId,
          width: "100%",
          height: "100%",
          playerVars: { rel: 0, playsinline: 1, cc_load_policy: 1, hl: "id", origin: window.location.origin },
          events: {
            onStateChange: (e) => {
              if (e.data === PLAYING && !played) {
                played = true;
                callbacks.current.onPlay();
              }
            },
            onError: (e) => {
              setError(e.data);
              callbacks.current.onError(e.data);
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) setError(-1);
      });

    return () => {
      cancelled = true;
      player?.destroy();
      container.replaceChildren();
    };
  }, [videoId]);

  if (error !== null) {
    return (
      <div className="player-fallback" role="status">
        <Icon name="alert" size={28} />
        <p>
          <strong>{errorText(error)}</strong>
        </p>
        <p className="meta">Kami tidak menggantinya dengan video lain. Silakan pilih video lain dari daftar.</p>
        {error !== 100 && error !== -1 && (
          <a className="btn btn-small" href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" rel="noreferrer">
            Buka di YouTube <Icon name="external" size={16} />
          </a>
        )}
      </div>
    );
  }

  return <div className="player-frame" ref={hostRef} title={title} />;
}
