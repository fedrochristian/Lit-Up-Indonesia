/**
 * Renders docs/previews/*.png from the real app with mock data. Local only.
 *
 * Needs: the app running (next start) against a local Supabase stack with the
 * hook, Mailpit and the allowlist containing PREVIEW_EMAIL (see
 * tests/e2e/auth-flow.mjs), and Playwright Chromium (`npx playwright install chromium`).
 *
 *   PREVIEW_ENV_FILE=.env.e2e PREVIEW_DATABASE_URL=postgres://… node scripts/capture-previews.mjs
 *
 * MOCK LAYER (everything fake lives in this file):
 * - Learner: a fake test identity signing in through the real magic-link flow.
 * - Belajarku trail and trial usage: rows seeded into the LOCAL database.
 * - Guruku replies: POST /api/guru is intercepted in the browser and answered with
 *   the sample Bahasa replies below. No Gemini call is made; the server never sees
 *   these requests. The hard-stop state is real: this month's spend is seeded at
 *   the Rp5,000,000 hard stop and the app's own status endpoint reports it.
 * Never point this at a real Supabase project: it writes to auth, events and spend tables.
 */
import { mkdirSync, readFileSync } from "node:fs";
import pg from "pg";
import { chromium } from "playwright";

const APP = process.env.PREVIEW_APP_URL ?? "http://localhost:3100";
const MAILPIT = process.env.PREVIEW_MAILPIT_URL ?? "http://localhost:8025";
const EMAIL = process.env.PREVIEW_EMAIL ?? "tri@example.com";
const OUT = "docs/previews";
const env = Object.fromEntries(
  readFileSync(process.env.PREVIEW_ENV_FILE ?? ".env.local", "utf8")
    .trim()
    .split("\n")
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
if (!/localhost|127\.0\.0\.1/.test(env.NEXT_PUBLIC_SUPABASE_URL ?? "")) throw new Error("previews only run against a local Supabase stack");

const db = new pg.Client({ connectionString: process.env.PREVIEW_DATABASE_URL });
await db.connect();

const MOCK_CHAT = [
  {
    q: "Kenapa daun berwarna hijau?",
    a: "Daun terlihat hijau karena ada klorofil, pigmen di dalam kloroplas. Klorofil menyerap cahaya merah dan biru untuk fotosintesis, sedangkan cahaya hijau lebih banyak dipantulkan, jadi warna itulah yang sampai ke mata kita.\n\nCoba pikirkan: kalau klorofil menyerap merah dan biru, kenapa daun bisa menguning sebelum gugur? Kita bisa bahas bersama, atau tonton dulu video Crash Course Biology tentang fotosintesis di Jelajahi.",
  },
  {
    q: "Jadi kalau daunnya menguning, klorofilnya hilang?",
    a: "Hampir tepat! Klorofil memang terurai ketika tanaman bersiap menggugurkan daun. Pigmen lain seperti karotenoid (kuning-oranye) sebenarnya sudah ada sejak awal, hanya tertutup klorofil, jadi sekarang terlihat.\n\nMau coba jelaskan dengan kata-katamu sendiri: apa peran klorofil dalam fotosintesis?",
  },
];
// Whitelisted IDs that passed the G5 oEmbed check (the report's manual sample).
const TRAIL = JSON.parse(readFileSync("docs/qa/g5-oembed-report.json", "utf8")).manual_sample.slice(0, 6).map((v) => v.video_id);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const wibMonthStart = () => {
  const wib = new Date(Date.now() + 7 * 3600_000);
  return `${wib.getUTCFullYear()}-${String(wib.getUTCMonth() + 1).padStart(2, "0")}-01`;
};

/** Opens the magic link from the email sent in the "link sent" step. */
async function followMagicLink(context) {
  let msg;
  for (let i = 0; i < 40 && !msg; i++) {
    await sleep(300);
    msg = (await (await fetch(`${MAILPIT}/api/v1/messages`)).json()).messages?.[0];
  }
  if (!msg) throw new Error("no magic-link email arrived");
  const body = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
  const link = (body.HTML || body.Text).match(/https?:\/\/[^\s"'<>]+verify[^\s"'<>]+/)[0].replace(/&amp;/g, "&");
  const page = await context.newPage();
  await page.goto(link);
  await page.waitForURL((u) => !u.pathname.startsWith("/auth") && !u.href.includes("/verify"), { waitUntil: "commit" });
  if (new URL(page.url()).pathname !== "/") throw new Error(`magic link landed on ${page.url()}`);
  return page;
}

async function seed() {
  const { rows } = await db.query(
    `select p.account_hash from public.profiles p join auth.users u on u.id = p.account_id where u.email = $1`,
    [EMAIL],
  );
  const hash = rows[0].account_hash;
  await db.query(`delete from public.events where account_hash = $1 and name = 'embed_play'`, [hash]);
  await db.query(`delete from public.trial_sessions where account_hash = $1`, [hash]);
  await db.query(`delete from public.spend_month where month_start = $1`, [wibMonthStart()]);
  for (const [i, id] of TRAIL.entries()) {
    await db.query(
      `insert into public.events (ts, account_hash, name, props, app_version, env)
       values (now() - make_interval(hours => $1), $2, 'embed_play', jsonb_build_object('video_id', $3::text), 'preview', 'development')`,
      [i * 5 + 1, hash, id],
    );
  }
  await db.query(
    `insert into public.trial_sessions (account_hash, session_no, started_at, last_message_at, guru_messages)
     values ($1, 1, now() - interval '3 minutes', now(), 1)`,
    [hash],
  );
  return hash;
}

async function mockGuru(page, hash) {
  let turn = 0;
  await page.route("**/api/guru", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const reply = MOCK_CHAT[Math.min(turn, MOCK_CHAT.length - 1)].a;
    turn += 1;
    const { rows } = await db.query(
      `update public.trial_sessions set guru_messages = guru_messages + 1, last_message_at = now()
        where account_hash = $1 and session_no = 1 returning guru_messages`,
      [hash],
    );
    await sleep(400);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok", reply, kind: "normal", usage: { mode: "trial", used: rows[0].guru_messages, limit: 14, session_no: 1 } }),
    });
  });
}

async function openTab(page, label, mobile) {
  const nav = mobile ? page.locator("nav.bottom-nav") : page.locator("aside.sidebar");
  await nav.getByRole("button", { name: label }).click();
  await sleep(600);
}

async function waitImages(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(async () => {
    const visible = [...document.images].filter((img) => {
      const r = img.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight;
    });
    const loaded = Promise.all(visible.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 5000))]);
  });
  await sleep(300);
}

let session; // storage state from the one real magic-link sign-in, reused for the mobile pass

async function capture(browser, device) {
  const mobile = device === "mobile";
  const viewport = mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "id-ID" }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, locale: "id-ID" };
  const signedOut = await browser.newContext(viewport);
  const shot = async (page, name) => {
    await page.screenshot({ path: `${OUT}/${name}-${device}.png` });
    console.log(`${OUT}/${name}-${device}.png`);
  };

  await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
  await db.query(`delete from public.rate_limits where scope like 'magic_link%'`);
  const anon = await signedOut.newPage();
  await anon.goto(`${APP}/masuk`);
  await waitImages(anon);
  await shot(anon, "01-signin");
  await anon.fill("#email", EMAIL);
  await anon.click("button[type=submit]");
  await anon.waitForSelector("text=Kalau emailmu terdaftar");
  await shot(anon, "02-signin-link-sent");
  // The default email link is a PKCE code: it must be opened in the browser that asked for it.
  if (!session) {
    await followMagicLink(signedOut);
    session = await signedOut.storageState();
  }
  await signedOut.close();

  const context = await browser.newContext({ ...viewport, storageState: session });
  const page = await context.newPage();
  await page.goto(`${APP}/`);
  const hash = await seed();
  await page.reload();
  await waitImages(page);
  await shot(page, "03-jelajahi");

  const firstChip = page.locator(".topic-chips .chip").filter({ hasText: "Biology" }).first();
  await firstChip.click();
  await page.waitForSelector(".video-grid >> nth=1");
  await page.locator(".topic-chips").scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -16));
  await waitImages(page);
  await shot(page, "04-jelajahi-topic-grid");

  await page.locator(".video-grid").nth(1).locator(".video-card").first().click();
  await page.waitForSelector(".player-panel iframe", { timeout: 20_000 }).catch(() => {});
  await sleep(4000);
  await shot(page, "05-jelajahi-video");
  await page.keyboard.press("Escape");
  await sleep(300);

  await page.evaluate(() => window.scrollTo(0, 0));
  await openTab(page, "Belajarku", mobile);
  await page.waitForSelector("text=Jejak belajar");
  await waitImages(page);
  await shot(page, "06-belajarku");

  await mockGuru(page, hash);
  await openTab(page, "Guruku", mobile);
  await page.waitForSelector("#guru-input:not([disabled])");
  for (const [i, { q }] of MOCK_CHAT.entries()) {
    await page.fill("#guru-input", q);
    await page.keyboard.press("Enter");
    await page.waitForFunction((n) => document.querySelectorAll(".bubble.model:not([aria-label])").length >= n, i + 1);
    await sleep(500);
  }
  await sleep(800);
  await shot(page, "07-guruku-chat");

  await db.query(
    `insert into public.spend_month (month_start, settled_idr) values ($1, 5000000)
     on conflict (month_start) do update set settled_idr = 5000000, outstanding_idr = 0`,
    [wibMonthStart()],
  );
  await page.unroute("**/api/guru");
  await page.goto(`${APP}/?tab=guruku`);
  await page.waitForSelector(".notice-warn");
  await sleep(600);
  await shot(page, "08-guruku-hard-stop");
  await db.query(`delete from public.spend_month where month_start = $1`, [wibMonthStart()]);

  await openTab(page, "Komunitas", mobile);
  await waitImages(page);
  await shot(page, "09-komunitas");
  await context.close();
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const device of ["desktop", "mobile"]) await capture(browser, device);
} finally {
  await browser.close();
  await db.end();
}
