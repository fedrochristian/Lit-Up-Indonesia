"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { TAB_IDS, TAB_LABELS, type TabId } from "@/lib/tabs";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import { Icon, type IconName } from "./Icon";
import { BelajarkuTab } from "./tabs/BelajarkuTab";
import { GurukuTab, useGuruChat } from "./tabs/GurukuTab";
import { JelajahiTab, type VideoLite } from "./tabs/JelajahiTab";
import { KomunitasTab } from "./tabs/KomunitasTab";
import { track } from "./track";

const ICONS: Record<TabId, IconName> = { jelajahi: "compass", belajarku: "book", guruku: "chat", komunitas: "group" };
const TABS = TAB_IDS.map((id) => ({ id, label: TAB_LABELS[id], icon: ICONS[id] }));

export function LitUpApp(props: {
  email: string;
  initialTab: TabId;
  topics: { name: string; slug: string; count: number }[];
  picks: VideoLite[];
  whitelistTotal: number;
}) {
  const [tab, setTab] = useState<TabId>(props.initialTab);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const chat = useGuruChat();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const index = TABS.findIndex((t) => t.id === tab) + 1;
    track({ name: "tab_view", props: { tab, tab_index: index } });
  }, [tab]);

  const select = (id: TabId) => {
    if (id === tab) return;
    setTab(id);
    const url = new URL(window.location.href);
    if (id === "jelajahi") url.searchParams.delete("tab");
    else url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url);
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  };

  const navButtons = (variant: "side" | "bottom") =>
    TABS.map((t) => (
      <button key={t.id} type="button" aria-current={tab === t.id ? "page" : undefined} onClick={() => select(t.id)}>
        <Icon name={t.icon} size={variant === "side" ? 20 : 22} />
        <span>{t.label}</span>
      </button>
    ));

  const logo = (size: number) => (
    <span className="logo-tile" style={{ width: size, height: size }}>
      <Image src="/brand/litup-logo-master.png" alt="Lit Up" width={size} height={size} priority />
    </span>
  );

  const accountActions = (
    <>
      <form action="/auth/keluar" method="post">
        <button className="btn btn-ghost btn-small" type="submit">
          <Icon name="logout" size={18} /> Keluar
        </button>
      </form>
      <button className="btn btn-ghost btn-small" type="button" onClick={() => setDeleteOpen(true)}>
        <Icon name="trash" size={18} /> Hapus akun &amp; data
      </button>
    </>
  );

  return (
    <>
      <div className="proto-banner" role="note">
        <i aria-hidden="true" />
        Versi uji internal · khusus peserta uji terdaftar · bukan rilis publik
      </div>
      <div className="shell">
        <aside className="sidebar" aria-label="Navigasi utama">
          <div className="logo-gutter">{logo(92)}</div>
          <nav className="side-nav">{navButtons("side")}</nav>
          <div className="side-foot">
            <span className="who">
              Masuk sebagai peserta uji
              <br />
              {props.email}
            </span>
            {accountActions}
          </div>
        </aside>

        <main className="main" ref={mainRef} tabIndex={-1} style={{ outline: "none" }}>
          <div className="mobile-top">
            {logo(44)}
            <details>
              <summary className="btn btn-ghost btn-small" aria-label="Akun">
                <Icon name="user" size={18} /> Akun
              </summary>
              <div className="card stack" style={{ position: "absolute", right: 16, zIndex: 20, gap: 6, marginTop: 6 }}>
                <span className="meta" style={{ overflowWrap: "anywhere" }}>
                  {props.email}
                </span>
                {accountActions}
              </div>
            </details>
          </div>

          {tab === "jelajahi" && <JelajahiTab topics={props.topics} initialPicks={props.picks} total={props.whitelistTotal} />}
          {tab === "belajarku" && <BelajarkuTab onOpen={select} />}
          {tab === "guruku" && <GurukuTab chat={chat} />}
          {tab === "komunitas" && <KomunitasTab />}
        </main>

        <nav className="bottom-nav" aria-label="Navigasi utama">
          {navButtons("bottom")}
        </nav>
      </div>
      <DeleteAccountDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} />
    </>
  );
}
