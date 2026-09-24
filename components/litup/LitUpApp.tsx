"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { emptyWorkspace, formats, paths, resources, topics, type LearningPath, type Profile, type Resource, type Workspace } from "@/lib/catalog";
import { Icon, type IconName } from "./Icon";
import { LearningArt } from "./LearningArt";

type Section = "explore" | "learning" | "saved" | "tutor" | "profile";
const navigation: { id: Section; title: string; icon: IconName }[] = [
  { id: "explore", title: "Jelajahi", icon: "explore" }, { id: "learning", title: "Belajarku", icon: "book" },
  { id: "saved", title: "Tersimpan", icon: "bookmark" }, { id: "tutor", title: "Tutor AI", icon: "spark" },
];
const formatIcons: Record<string, IconName> = { Video: "play", Kursus: "book", MOOC: "code", Buku: "book", Audiobook: "headphones" };
type Message = { role: "user" | "assistant"; content: string };

function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="lit-dialog" onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }} aria-label={title}>
    <div className="dialog-inner"><div className="dialog-top"><span className="eyebrow">LIT UP · {title}</span><button className="icon-button" onClick={close} aria-label="Tutup"><Icon name="close"/></button></div>{children}</div>
  </dialog>;
}

export function LitUpApp() {
  const router = useRouter();
  const [section, setSection] = useState<Section>("explore");
  const [workspace, setWorkspace] = useState<Workspace>(emptyWorkspace);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const writeLock = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState("Semua topik");
  const [format, setFormat] = useState("Semua format");
  const [access, setAccess] = useState("Semua akses");
  const [level, setLevel] = useState("Semua level");
  const [language, setLanguage] = useState("Semua bahasa");
  const [filters, setFilters] = useState(false);
  const [detail, setDetail] = useState<Resource | null>(null);
  const [preview, setPreview] = useState<LearningPath | null>(null);
  const [report, setReport] = useState("");
  const [tutorContext, setTutorContext] = useState("");
  const [configured, setConfigured] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [tutorBusy, setTutorBusy] = useState(false);
  const [tutorError, setTutorError] = useState("");
  const [consent, setConsent] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);

  async function loadWorkspace() {
    try {
      const response = await fetch("/api/workspace", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setWorkspace(data); setLoaded(true); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Data belum termuat. Coba lagi."); }
  }
  useEffect(() => {
    // Hydrate external server state after the initial browser render.
    void Promise.resolve().then(loadWorkspace);
    fetch("/api/tutor").then(r => r.json()).then(d => setConfigured(d.configured === true)).catch(() => {});
    const syncHash = () => {
      const next = window.location.hash.slice(1);
      if (next === "main") return;
      setSection(["explore", "learning", "saved", "tutor", "profile"].includes(next) ? next as Section : "explore");
    };
    void Promise.resolve().then(syncHash); window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, []);
  useEffect(() => { if (notice) { const timeout = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(timeout); } }, [notice]);
  useEffect(() => { if (messages.length) chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, tutorBusy]);

  function go(next: Section) { setSection(next); router.push(`#${next}`, { scroll: false }); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function save(action: Record<string, unknown>, message?: string) {
    if (writeLock.current || !loaded) return false;
    writeLock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/workspace", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setWorkspace(data); if (message) setNotice(message); return true;
    } catch (e) { setError(e instanceof Error ? e.message : "Belum tersimpan. Coba lagi."); return false; }
    finally { setBusy(false); writeLock.current = false; }
  }
  function resetFilters() { setQuery(""); setTopic("Semua topik"); setFormat("Semua format"); setAccess("Semua akses"); setLevel("Semua level"); setLanguage("Semua bahasa"); }
  function askAbout(resource: Resource) { setDetail(null); setTutorContext(resource.id); setMessages([]); setTutorError(""); go("tutor"); }
  async function sendMessage(event: FormEvent) {
    event.preventDefault(); if (!draft.trim() || tutorBusy || !configured || !consent) return;
    const next: Message[] = [...messages, { role: "user", content: draft.trim() }];
    setTutorBusy(true); setTutorError("");
    try {
      const response = await fetch("/api/tutor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: next.slice(-7), resourceId: tutorContext }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setMessages([...next, { role: "assistant", content: data.answer }]); setDraft("");
    } catch (e) { setTutorError(e instanceof Error ? e.message : "Koneksi terputus. Coba lagi."); }
    finally { setTutorBusy(false); }
  }
  const filtered = resources.filter(r => (section !== "saved" || workspace.saved.includes(r.id)) && (topic === "Semua topik" || r.topic === topic) && (format === "Semua format" || r.format === format) && (access === "Semua akses" || r.access === access) && (level === "Semua level" || r.level === level) && (language === "Semua bahasa" || r.language === language) && `${r.title} ${r.creator} ${r.provider} ${r.topic} ${r.summary}`.toLowerCase().includes(query.toLowerCase().trim()));
  const selectedPaths = paths.filter(p => workspace.plans.includes(p.id));
  const recommended = paths.find(p => p.topic === workspace.profile.topic);
  const nextPlan = selectedPaths.find(p => p.steps.some(s => !workspace.completed.includes(`${p.id}:${s.id}`)));
  const completedCount = selectedPaths.reduce((n, p) => n + p.steps.filter(s => workspace.completed.includes(`${p.id}:${s.id}`)).length, 0);
  const disabled = busy || !loaded;

  function resourceCard(resource: Resource) {
    const saved = workspace.saved.includes(resource.id);
    return <article className="resource-card" key={resource.id}>
      <button className={`resource-cover ${resource.color}`} onClick={() => { setDetail(resource); setReport(""); }} aria-label={`Lihat ${resource.title}`}>
        <span className="cover-provider">{resource.provider}</span><span className="cover-type"><Icon name={formatIcons[resource.format]} size={17}/></span>
        <span className="cover-words">{resource.cover.split(" / ").map((line, i) => <span key={i}>{line}</span>)}</span><span className="cover-decoration" aria-hidden="true">✳</span>
      </button>
      <div className="resource-body"><div className="resource-meta"><span>{resource.format}</span><span className={`access-label ${resource.access === "Gratis" ? "free" : ""}`}>{resource.access}</span></div>
        <button className="resource-title" onClick={() => { setDetail(resource); setReport(""); }}>{resource.title}</button><p>{resource.creator}</p>
        <div className="resource-bottom"><span>{resource.level} <span className="dot">·</span> {resource.language}</span><button className={`icon-button bookmark-button ${saved ? "is-saved" : ""}`} aria-label={`${saved ? "Hapus simpanan" : "Simpan"} ${resource.title}`} aria-pressed={saved} disabled={disabled} onClick={() => void save({ type: "bookmark", id: resource.id, value: !saved }, saved ? "Materi dihapus dari simpanan." : "Disimpan untuk nanti.")}><Icon name="bookmark" size={18}/></button></div>
      </div>
    </article>;
  }
  function pathCard(path: LearningPath, index: number) {
    const active = workspace.plans.includes(path.id);
    return <button className={`path-card path-${path.color}`} key={path.id} onClick={() => setPreview(path)}>
      <div className="path-number">0{index + 1}<Icon name={path.id === "learn-better" ? "leaf" : "code"} size={30}/></div>
      <div><span className="eyebrow">{path.topic}</span><h3>{path.title}</h3><p>4 langkah <span className="dot">·</span> Pemula <span className="dot">·</span> {active ? "Sedang kamu ikuti" : "Mulai sesuai ritmemu"}</p></div><span className="path-arrow"><Icon name="arrow"/></span>
    </button>;
  }

  return <div className="litup-app">
    <a className="skip-link" href="#main">Lewati ke konten</a>
    <aside className="sidebar">
      <Link href="/" className="brand-link" aria-label="Lit Up beranda"><Image src="/brand/litup-logo.jpg" width={108} height={108} alt="Lit Up" priority/><span>your curiosity, ignited.</span></Link>
      <div className="nav-label">RUANG BELAJARMU</div>
      <nav aria-label="Navigasi utama">{navigation.map(item => <a key={item.id} href={`#${item.id}`} onClick={() => go(item.id)} className={`nav-item ${section === item.id ? "active" : ""}`} aria-current={section === item.id ? "page" : undefined}><Icon name={item.icon}/><span>{item.title}</span>{item.id === "saved" && workspace.saved.length > 0 && <span className="nav-count">{workspace.saved.length}</span>}{item.id === "tutor" && <span className="ai-pill">AI</span>}</a>)}</nav>
      <div className="sidebar-bottom"><div className="little-reminder"><Icon name="spark" size={25}/><p>Hal besar dimulai<br/>dari rasa ingin tahu.</p><span>#nyalakanmimpimu</span></div><button className={`profile-nav ${section === "profile" ? "selected" : ""}`} onClick={() => go("profile")}><span className="avatar">{workspace.profile.name ? workspace.profile.name[0].toUpperCase() : "L"}</span><span><strong>{workspace.profile.name || "Hi, Lits!"}</strong><small>Ruang pribadi lokal</small></span><Icon name="sliders" size={17}/></button></div>
    </aside>
    <div className="app-body">
      <header className="topbar"><Link className="mobile-brand" href="/" aria-label="Lit Up beranda"><Image src="/brand/litup-logo.jpg" alt="Lit Up" width={38} height={38}/></Link><div className="breadcrumb">Ruang belajar <Icon name="chevron" size={13}/><strong>{section === "profile" ? "Preferensi" : navigation.find(n => n.id === section)?.title}</strong></div><div className="topbar-right"><span className="local-badge"><i/>Local preview</span><button className="icon-button" onClick={() => go("profile")} aria-label="Preferensi belajar"><Icon name="sliders" size={19}/></button></div></header>
      <main id="main" className="main-content">
        {error && <div role="alert" className="error-banner">{error} {!loaded && <button onClick={() => void loadWorkspace()}>Coba lagi</button>}<button aria-label="Tutup pesan kesalahan" onClick={() => setError("")}><Icon name="close" size={16}/></button></div>}
        {!loaded && !error && <p className="loading-line" role="status">Menyiapkan ruang belajarmu…</p>}
        {section === "explore" && <>
          <div className="page-intro"><div><p className="eyebrow greeting">HI, {workspace.profile.name ? workspace.profile.name.toUpperCase() : "LITS"}! <span>✦</span></p><h1>Mau belajar apa hari ini?</h1><p>Satu rasa penasaran. Banyak kemungkinan.</p></div><span className="intro-note"><Icon name="leaf" size={17}/>Tumbuh dengan ritmemu.</span></div>
          <section className="hero" aria-label="Mulai perjalanan belajar"><div className="hero-copy"><span className="hero-tag"><span/> A LITTLE CURIOUS, A LITTLE BRAVER</span><h2>Nyalakan rasa<br/>ingin tahumu<span>.</span></h2><p>Temukan materi pilihan, bangun langkah kecil,<br className="desktop-br"/> dan jadikan belajar bagian dari harimu.</p><button className="button primary" onClick={() => document.getElementById("learning-paths")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Temukan jalur belajarmu <Icon name="arrow" size={18}/></button></div><LearningArt/><span className="hero-footnote">MAKE ROOM FOR YOUR NEXT CHAPTER.</span></section>
          <div className="discovery-strip"><span>BERBAGAI SUMBER. SATU RUANG.</span><div><Icon name="play" size={16}/> YouTube</div><div className="provider-coursera">coursera</div><div>HARVARD</div><div className="provider-mit">MIT <small>OpenCourseWare</small></div><div><Icon name="book" size={17}/> OpenStax</div></div>
          <section id="learning-paths" className="path-section"><div className="section-heading"><div><span className="eyebrow">SEDIKIT ARAH, BANYAK KEMAJUAN</span><h2>Mulai dari sebuah langkah</h2></div><button className="text-button" onClick={() => go("profile")}>Sesuaikan dengan tujuanmu <Icon name="arrow" size={17}/></button></div><div className="path-grid">{paths.map(pathCard)}</div>{workspace.profile.goal && <p className="recommendation-note">{recommended && workspace.profile.language === "Inggris" && workspace.profile.level === "Pemula" ? `Pilihan sesuai minat ${workspace.profile.topic}: ${recommended.title}. Alokasikan ${workspace.profile.minutes} menit per minggu; estimasi sesi 15–30 menit. Ini titik awal pemula, bukan keseluruhan kursus.` : "Belum ada jalur yang cocok dengan seluruh preferensimu. Jelajahi katalog atau ubah preferensi; jalur aktifmu tetap tersimpan."}</p>}</section>
        </>}
        {(section === "explore" || section === "saved") && <section className="catalog-section" aria-labelledby="catalog-heading"><div className="section-heading"><div>{section === "explore" && <span className="eyebrow">IKUTI RASA PENASARANMU</span>}<h2 id="catalog-heading">{section === "saved" ? "Disimpan untuk nanti" : "Dunia baru, tinggal dijelajahi"}</h2>{section === "saved" && <p>Koleksi kecil untuk ide-ide besarmu.</p>}</div><span className="count-label">{section === "saved" ? workspace.saved.length : resources.length} materi pilihan</span></div>
          <div className="catalog-controls"><div className="search-box"><Icon name="search" size={19}/><input aria-label="Cari materi" placeholder="Cari topik, materi, atau hal yang bikin penasaran…" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button aria-label="Hapus pencarian" onClick={() => setQuery("")}><Icon name="close" size={15}/></button>}</div><button className={`button filter-button ${filters ? "selected" : ""}`} onClick={() => setFilters(!filters)} aria-expanded={filters}><Icon name="sliders" size={17}/> Filter</button></div>
          <div className="topic-chips" aria-label="Topik">{topics.map(t => <button key={t} onClick={() => setTopic(t)} className={topic === t ? "selected" : ""} aria-pressed={topic === t}>{t === "Semua topik" && <Icon name="explore" size={15}/>} {t}</button>)}</div>
          {filters && <div className="filter-panel"><label>Format<select value={format} onChange={e => setFormat(e.target.value)}>{formats.map(f => <option key={f}>{f}</option>)}</select></label><label>Akses<select value={access} onChange={e => setAccess(e.target.value)}>{["Semua akses", "Gratis", "Campuran"].map(f => <option key={f}>{f}</option>)}</select></label><label>Level<select value={level} onChange={e => setLevel(e.target.value)}>{["Semua level", "Pemula", "Menengah"].map(f => <option key={f}>{f}</option>)}</select></label><label>Bahasa<select value={language} onChange={e => setLanguage(e.target.value)}>{["Semua bahasa", "Inggris", "Indonesia"].map(f => <option key={f}>{f}</option>)}</select></label><button className="text-button" onClick={resetFilters}>Reset</button></div>}
          {filtered.length ? <><p className="results-count" aria-live="polite">{filtered.length} materi untuk dijelajahi</p><div className="resource-grid">{filtered.map(resourceCard)}</div></> : <div className="empty-state"><Icon name={section === "saved" && !workspace.saved.length ? "bookmark" : "search"} size={34}/><h3>{section === "saved" && !workspace.saved.length ? "Simpan rasa penasaranmu." : "Belum menemukan yang cocok?"}</h3><p>{section === "saved" && !workspace.saved.length ? "Ketuk ikon bookmark pada materi yang ingin kamu pelajari nanti." : "Coba kata kunci lain atau perluas filter. Katalog awal ini masih kecil."}</p><button className="button primary" onClick={() => { resetFilters(); if (section === "saved" && !workspace.saved.length) go("explore"); }}>{section === "saved" && !workspace.saved.length ? "Jelajahi materi" : "Hapus filter"}<Icon name="arrow" size={17}/></button></div>}
        </section>}
        {section === "learning" && <><div className="page-intro"><div><p className="eyebrow greeting">SATU LANGKAH LAGI</p><h1>Perjalanan belajarmu</h1><p>Tidak perlu terburu-buru. Yang penting, terus bertumbuh.</p></div><button className="button secondary" onClick={() => go("profile")}><Icon name="sliders" size={17}/> Atur tujuan</button></div><div className="stats-row"><div><span>Jalur diikuti</span><strong>{selectedPaths.length.toString().padStart(2, "0")}</strong></div><div><span>Langkah selesai</span><strong>{completedCount.toString().padStart(2, "0")}</strong></div><div><span>Target mingguan</span><strong>{workspace.profile.minutes}<small> menit</small></strong></div></div>
          {workspace.profile.goal && <div className="goal-banner"><Icon name="spark"/><div><span className="eyebrow">ALASANMU UNTUK MULAI</span><p>{workspace.profile.goal}</p></div></div>}
          {nextPlan && <p className="recommendation-note">Selanjutnya: {nextPlan.steps.find(s => !workspace.completed.includes(`${nextPlan.id}:${s.id}`))?.title}. Kamu bisa mulai dari langkah mana pun.</p>}
          {selectedPaths.length ? selectedPaths.map(path => <LearningPlan key={path.id} path={path} workspace={workspace} disabled={disabled} save={save} open={setDetail}/>) : <div className="empty-state"><Icon name="leaf" size={42}/><h3>Setiap perjalanan punya langkah pertama.</h3><p>Pilih salah satu jalur, lihat langkah-langkahnya, lalu mulai saat kamu siap.</p><div className="path-grid">{paths.map(pathCard)}</div></div>}
        </>}
        {section === "profile" && <><div className="page-intro"><div><p className="eyebrow greeting">BUKAN BALAPAN. INI PERJALANANMU.</p><h1>Belajar dengan caramu</h1><p>Berikan sedikit arah untuk rasa penasaranmu.</p></div></div><ProfileForm key={workspace.updatedAt ?? "initial"} profile={workspace.profile} disabled={disabled} save={save}/><section className="privacy-card"><Icon name="user"/><div><h3>Ruang lokal, bukan akun online</h3><p>Tujuan, bookmark, dan progres tersimpan di komputer ini dalam <code>.local/workspace.json</code>. Tidak ada login atau sinkronisasi lintas perangkat. Jangan gunakan data sensitif pada preview ini.</p><a className="text-button" href="/api/workspace" download="lit-up-workspace.json">Unduh salinan data <Icon name="external" size={15}/></a><Link className="text-button journal-link" href="/journal">Buka jurnal Sparks sebelumnya <Icon name="arrow" size={15}/></Link></div></section></>}
        {section === "tutor" && <><div className="page-intro"><div><p className="eyebrow greeting">TEMAN UNTUK BERPIKIR</p><h1>Penasaran? Kita uraikan.</h1><p>Minta penjelasan, coba contoh, lalu uji pemahamanmu.</p></div><span className={`connection-label ${configured ? "connected" : ""}`}><i/>{configured ? "API terkonfigurasi" : "Belum terhubung"}</span></div>
          <div className="tutor-layout"><section className="chat-panel"><div className="chat-heading"><span className="tutor-avatar"><Icon name="spark" size={24}/></span><div><strong>Lit Up Tutor</strong><span>Satu pertanyaan bisa membuka banyak hal.</span></div>{messages.length > 0 && <button className="text-button" disabled={tutorBusy} onClick={() => { setMessages([]); setTutorError(""); }}>Chat baru</button>}</div>
            <div className="chat-messages" aria-live="polite">{!messages.length && <div className="tutor-welcome"><span className="welcome-star">✳</span><h2>Mulai dengan<br/>“Aku ingin tahu…”</h2><p>Tidak ada pertanyaan yang terlalu sederhana.<br/>Pilih pemantik di bawah, atau tulis pertanyaanmu.</p><div className="prompt-buttons">{["Bagaimana cara mengingat yang sudah dipelajari?", "Jelaskan algoritma dengan contoh sehari-hari.", "Bantu aku membuat latihan belajar singkat."].map(prompt => <button key={prompt} onClick={() => setDraft(prompt)}>{prompt}<Icon name="arrow" size={16}/></button>)}</div></div>}{messages.map((m, i) => <div key={i} className={`message ${m.role}`}><span>{m.role === "user" ? "Kamu" : "Lit Up Tutor · AI"}</span><p>{m.content}</p></div>)}{tutorBusy && <p role="status" className="tutor-thinking">Sedang menyusun penjelasan…</p>}<div ref={chatEnd}/></div>
            <form className="chat-form" onSubmit={sendMessage}>{tutorError && <p className="inline-error" role="alert">{tutorError}</p>}<label className="sr-only" htmlFor="tutor-message">Pertanyaanmu</label><div className="chat-input"><textarea id="tutor-message" rows={2} maxLength={2000} placeholder="Apa yang ingin kamu pahami?" value={draft} onChange={e => setDraft(e.target.value)} disabled={tutorBusy}/><button className="send-button" aria-label="Kirim pertanyaan" disabled={!configured || !consent || tutorBusy || !draft.trim()}><Icon name="send" size={20}/></button></div><p>AI bisa keliru. Verifikasi penjelasan penting dengan sumber aslinya.</p></form>
          </section><aside className="context-panel"><span className="eyebrow">KONTEKS BELAJARMU</span><h3>Mau membahas apa?</h3><label>Materi pendamping<select value={tutorContext} disabled={tutorBusy} onChange={e => { setTutorContext(e.target.value); setMessages([]); setTutorError(""); }}><option value="">Belajar secara umum</option>{resources.map(r => <option value={r.id} key={r.id}>{r.title}</option>)}</select></label><div className="context-note"><Icon name="book" size={20}/><p>Tutor hanya menerima judul dan ringkasan editorial, bukan isi video, buku, atau kursus. Tempel kutipan singkat jika perlu membahas isinya.</p></div><hr/>{configured ? <label className="consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>Saya setuju pesan, preferensi belajar, dan konteks materi dikirim ke OpenAI. Jangan kirim informasi sensitif.</label> : <div className="setup-note"><h4>Sambungkan saat kamu siap</h4><p>Isi <code>OPENAI_API_KEY</code> dan <code>OPENAI_MODEL</code> di <code>.env.local</code>, lalu restart server. Lihat README untuk petunjuk.</p><p>Belum ada pesan yang dikirim ke AI. Kamu tetap bisa menjelajah dan mencatat progres.</p></div>}<small>Chat hanya bertahan selama halaman ini terbuka. Mengganti konteks memulai chat baru. Maks. 5 pesan/menit.</small></aside></div>
        </>}
        <footer className="site-footer"><span>Belajar bukan tentang jadi yang paling tahu.<br/><strong>Tapi tentang tidak berhenti ingin tahu.</strong></span><span>Made for curious minds. <span className="footer-star">✦</span><small>LIT UP · #nyalakanmimpimu</small></span></footer>
      </main>
    </div>
    {notice && <div className="toast" role="status"><Icon name="check" size={18}/>{notice}</div>}
    {detail && <Modal title="Pilihan untuk rasa penasaranmu" close={() => setDetail(null)}><div className={`detail-cover ${detail.color}`}><span>{detail.provider}</span><strong>{detail.cover.replaceAll(" / ", " ")}</strong><Icon name={formatIcons[detail.format]} size={44}/></div><div className="detail-meta"><span>{detail.format}</span><span>{detail.level}</span><span>{detail.language}</span><span>{detail.access}</span></div><h2>{detail.title}</h2><p className="detail-author">{detail.creator}</p><p className="detail-summary">{detail.summary}</p><div className="access-note"><strong>{detail.access === "Gratis" ? "Akses gratis di penyedia" : "Periksa opsi akses di penyedia"}</strong><p>{detail.accessNote}</p></div><div className="detail-actions"><a className="button primary" href={detail.url} target="_blank" rel="noopener noreferrer">Buka di {detail.provider}<Icon name="external" size={16}/><span className="sr-only"> (tab baru)</span></a><button className="button secondary" disabled={disabled} onClick={() => void save({ type: "bookmark", id: detail.id, value: !workspace.saved.includes(detail.id) }, "Simpanan diperbarui.")}><Icon name="bookmark" size={17}/>{workspace.saved.includes(detail.id) ? "Tersimpan" : "Simpan"}</button></div><button className="text-button tutor-detail" onClick={() => askAbout(detail)}><Icon name="spark" size={17}/> Bahas topiknya dengan Tutor AI <Icon name="arrow" size={17}/></button><p className="source-note">Ringkasan editorial Lit Up · Ditinjau {detail.reviewed}. Durasi total tidak dicatat. Membuka tautan tidak menandai selesai. Lit Up tidak berafiliasi dengan penyedia.</p><details className="report-section"><summary>Ada informasi yang perlu diperbaiki?</summary><label className="sr-only" htmlFor="report-reason">Alasan laporan</label><select id="report-reason" value={report} onChange={e => setReport(e.target.value)}><option value="">Pilih alasan</option>{["Tautan rusak", "Informasi tidak tepat", "Materi tidak sesuai"].map(r => <option key={r}>{r}</option>)}</select><button className="button secondary" disabled={!report || disabled} onClick={async () => { if (await save({ type: "report", id: detail.id, value: report }, "Laporan tersimpan di antrean lokal.")) setReport(""); }}>Simpan laporan</button><small>Antrean lokal di .local/workspace.json; belum dikirim ke tim eksternal.</small></details></Modal>}
    {preview && <Modal title="Jalur belajar" close={() => setPreview(null)}><span className="path-preview-symbol">{preview.id === "learn-better" ? "✳" : "↗"}</span><span className="eyebrow">{preview.topic} · JALUR V{preview.version}</span><h2>{preview.title}</h2><p className="detail-summary">{preview.description}</p><div className="path-preview-meta"><span><Icon name="clock" size={16}/>{preview.steps.reduce((n, s) => n + s.minutes, 0)} menit estimasi</span><span>4 sesi · Pemula · Materi Inggris</span></div><p className="source-note">Estimasi untuk aktivitas pilihan Lit Up, bukan durasi menyelesaikan seluruh kursus. Catatan dan panduan berbahasa Indonesia.</p><ol className="preview-steps">{preview.steps.map((step, i) => <li key={step.id}><span>{i + 1}</span><div><h3>{step.title}</h3><p>{step.instruction}</p><small>{step.minutes} menit · {resources.find(r => r.id === step.resourceId)?.provider}</small></div></li>)}</ol><button className="button primary full-width" disabled={disabled} onClick={async () => { if (workspace.plans.includes(preview.id) || await save({ type: "plan", id: preview.id, value: true }, "Langkah pertamamu dimulai di sini.")) { setPreview(null); go("learning"); } }}>{workspace.plans.includes(preview.id) ? "Lanjutkan perjalanan" : "Mulai jalur ini"}<Icon name="arrow" size={18}/></button></Modal>}
  </div>;
}

function LearningPlan({ path, workspace, disabled, save, open }: { path: LearningPath; workspace: Workspace; disabled: boolean; save: (action: Record<string, unknown>, message?: string) => Promise<boolean>; open: (resource: Resource) => void }) {
  const completed = path.steps.filter(s => workspace.completed.includes(`${path.id}:${s.id}`)).length;
  return <section className="learning-plan"><div className="plan-header"><div><span className="eyebrow">{path.topic} · V{path.version}</span><h2>{path.title}</h2></div><span className="progress-fraction">{completed}<small> / {path.steps.length}</small></span></div><div className="progress-track" role="progressbar" aria-label={`Progres ${path.title}`} aria-valuemin={0} aria-valuemax={4} aria-valuenow={completed}><span style={{ width: `${completed * 25}%` }}/></div>{completed === 4 && <p className="completion-note">✦ Satu perjalanan selesai. Rayakan apa yang sudah kamu pelajari!</p>}<div className="plan-steps">{path.steps.map((step, index) => { const id = `${path.id}:${step.id}`, done = workspace.completed.includes(id), resource = resources.find(r => r.id === step.resourceId)!; return <article className={`plan-step ${done ? "done" : ""}`} key={step.id}><div className="step-marker">{done ? <Icon name="check" size={18}/> : String(index + 1).padStart(2, "0")}</div><div className="step-content"><div className="step-title"><h3>{step.title}</h3><span><Icon name="clock" size={14}/>{step.minutes} menit</span></div><p>{step.instruction}</p><div className="step-actions"><button className="text-button" onClick={() => open(resource)}>Lihat materi <Icon name="external" size={14}/></button><button className={`button ${done ? "secondary" : "primary"} small`} disabled={disabled} onClick={() => void save({ type: "complete", id, value: !done }, done ? "Langkah ditandai belum selesai." : "Satu langkah lagi. Nice work, Lits!")}><Icon name="check" size={16}/>{done ? "Batalkan selesai" : "Tandai selesai"}</button></div><details className="reflection"><summary>{workspace.reflections[id] ? "Lihat / edit refleksimu" : "Catat refleksi (opsional)"}</summary><p>{step.prompt}</p><form onSubmit={async e => { e.preventDefault(); const value = new FormData(e.currentTarget).get("reflection"); await save({ type: "reflection", id, value }, "Refleksi tersimpan."); }}><label className="sr-only" htmlFor={`reflection-${id}`}>Refleksi: {step.title}</label><textarea id={`reflection-${id}`} name="reflection" key={workspace.reflections[id]} defaultValue={workspace.reflections[id] || ""} maxLength={3000} rows={3} placeholder="Tuliskan dengan kata-katamu sendiri…"/><button className="button secondary small" disabled={disabled}>Simpan refleksi</button></form></details></div></article>; })}</div><button className="text-button pause-button" disabled={disabled} onClick={() => void save({ type: "plan", id: path.id, value: false }, "Jalur dijeda. Progres dan refleksi tetap tersimpan.")}>Jeda jalur · progres tetap disimpan</button></section>;
}

function ProfileForm({ profile, disabled, save }: { profile: Profile; disabled: boolean; save: (action: Record<string, unknown>, message?: string) => Promise<boolean> }) {
  const [values, setValues] = useState(profile);
  const update = (key: keyof Profile, value: string | number) => setValues(v => ({ ...v, [key]: value }));
  return <form className="profile-form" onSubmit={async e => { e.preventDefault(); await save({ type: "profile", value: values }, "Tujuan dan preferensi tersimpan."); }}><div className="form-section-number">01 <span>KENALI ARAHMU</span></div><div className="profile-fields"><label>Nama panggilan <span>(opsional)</span><input maxLength={40} placeholder="Kami boleh panggil kamu siapa?" value={values.name} onChange={e => update("name", e.target.value)}/></label><label>Apa yang ingin kamu pelajari?<textarea required maxLength={300} rows={3} placeholder="Misalnya: memahami dasar coding untuk membuat proyek pertamaku." value={values.goal} onChange={e => update("goal", e.target.value)}/></label><div className="form-grid"><label>Minat utama<select value={values.topic} onChange={e => update("topic", e.target.value)}>{topics.slice(1).map(t => <option key={t}>{t}</option>)}</select></label><label>Titik awal<select value={values.level} onChange={e => update("level", e.target.value)}><option>Pemula</option><option>Menengah</option></select></label></div></div><div className="form-section-number">02 <span>TEMUKAN RITMEMU</span></div><div className="profile-fields form-grid"><label>Waktu belajar per minggu<select value={values.minutes} onChange={e => update("minutes", Number(e.target.value))}>{[30, 60, 90, 120, 180].map(n => <option value={n} key={n}>{n} menit / minggu</option>)}</select></label><label>Bahasa materi pilihan<select value={values.language} onChange={e => update("language", e.target.value)}><option>Inggris</option><option>Indonesia</option></select></label></div><p className="form-hint">Preferensi membantu mencocokkan jalur kurasi. Katalog awal berbahasa Inggris; mengubah preferensi tidak mengubah progres atau jalur aktif.</p><button className="button primary" disabled={disabled}>Simpan preferensi <Icon name="arrow" size={18}/></button></form>;
}
