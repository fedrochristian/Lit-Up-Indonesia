/**
 * End-to-end sign-in check against a running app and a Supabase Auth stack
 * with the before-user-created hook enabled and Mailpit catching email
 * (e.g. `supabase start`, or GoTrue + PostgREST + Mailpit containers).
 * The allowlist must contain tri@example.com and not stranger@ / bypass@.
 *
 *   E2E_APP_URL=http://localhost:3100 E2E_ENV_FILE=.env.e2e \
 *   E2E_DATABASE_URL=postgres://… E2E_MAILPIT_URL=http://localhost:8025 \
 *   node tests/e2e/auth-flow.mjs
 *
 * Writes to the target database and mailbox: never point it at production.
 */
import pg from "pg";
import { readFileSync } from "node:fs";

const APP = process.env.E2E_APP_URL ?? "http://localhost:3100";
const MAILPIT = process.env.E2E_MAILPIT_URL ?? "http://localhost:8025";
const env = Object.fromEntries(readFileSync(process.env.E2E_ENV_FILE ?? ".env.local", "utf8").trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const db = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
await db.connect();
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

class Jar {
  m = new Map();
  take(res) {
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      const v = pair.slice(i + 1);
      if (/max-age=0/i.test(c) || v === "") this.m.delete(pair.slice(0, i));
      else this.m.set(pair.slice(0, i), v);
    }
  }
  header() {
    return [...this.m].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function get(url, jar, opts = {}) {
  const res = await fetch(url, { redirect: "manual", ...opts, headers: { cookie: jar.header(), ...(opts.headers ?? {}) } });
  jar.take(res);
  return res;
}

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#x27;/g, "'");

async function requestLink(email, jar) {
  const html = await (await get(`${APP}/masuk`, jar)).text();
  const form = new FormData();
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*name="([^"]+)"(?:[^>]*value="([^"]*)")?/g)) form.append(m[1], decode(m[2] ?? ""));
  form.append("email", email);
  const res = await get(`${APP}/masuk`, jar, { method: "POST", body: form, headers: { origin: APP } });
  return { status: res.status, html: await res.text() };
}

const mail = async () => (await (await fetch(`${MAILPIT}/api/v1/messages`)).json()).messages ?? [];
const users = async (email) => Number((await db.query(`select count(*) from auth.users where email = $1`, [email])).rows[0].count);
await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });

// 1. Off-allowlist email through the app
const strangerJar = new Jar();
const off = await requestLink("stranger@example.com", strangerJar);
await new Promise((r) => setTimeout(r, 1500));
check("off-allowlist: neutral message shown", off.status === 200 && off.html.includes("Kalau emailmu terdaftar"), `HTTP ${off.status}`);
check("off-allowlist: no email sent", (await mail()).length === 0);
check("off-allowlist: no auth user created", (await users("stranger@example.com")) === 0);

// 2. Bypass attempt straight at Supabase Auth (skipping the app): hook must refuse
const bypass = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/otp`, {
  method: "POST",
  headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "content-type": "application/json" },
  body: JSON.stringify({ email: "bypass@example.com", create_user: true }),
});
const bypassBody = await bypass.text();
await new Promise((r) => setTimeout(r, 1000));
check("direct Auth API sign-up for off-list email refused by hook", bypass.status >= 400 && (await users("bypass@example.com")) === 0, `HTTP ${bypass.status} ${bypassBody.slice(0, 120)}`);
check("direct Auth API: no email sent", (await mail()).length === 0);

// 3. Allowlisted email
const jar = new Jar();
const on = await requestLink("Tri@Example.com ", jar);
let msgs = [];
for (let i = 0; i < 20 && msgs.length === 0; i++) {
  await new Promise((r) => setTimeout(r, 500));
  msgs = await mail();
}
check("allowlisted: same neutral message shown", on.html.includes("Kalau emailmu terdaftar"));
check("allowlisted: magic link email delivered", msgs.length === 1 && msgs[0].To[0].Address === "tri@example.com", JSON.stringify(msgs.map((m) => m.To[0].Address)));
const body = await (await fetch(`${MAILPIT}/api/v1/message/${msgs[0].ID}`)).json();
const link = decode((body.HTML || body.Text).match(/https?:\/\/[^\s"'<>]+verify[^\s"'<>]+/)[0]);
check("magic link redirects back to /auth/confirm", decodeURIComponent(link).includes(`redirect_to=${APP}/auth/confirm`), link.replace(/token=[^&]+/, "token=…"));

const verify = await get(link, new Jar());
const back = verify.headers.get("location") ?? "";
check("Auth verifies token and returns to the app with a code", verify.status >= 300 && verify.status < 400 && back.startsWith(`${APP}/auth/confirm?code=`), `${verify.status} ${back.replace(/code=[^&]+/, "code=…")}`);
const confirm = await get(back, jar);
check("/auth/confirm exchanges the code and redirects home", confirm.status >= 300 && confirm.status < 400 && (confirm.headers.get("location") ?? "").replace(APP, "") === "/", `${confirm.status} ${confirm.headers.get("location")}`);
const home = await get(`${APP}/`, jar);
const homeHtml = await home.text();
check("signed in: home renders tabs in locked order", home.status === 200 && /Jelajahi[\s\S]*Belajarku[\s\S]*Guruku[\s\S]*Komunitas/.test(homeHtml), `HTTP ${home.status}`);
check("signed in: noindex header", (home.headers.get("x-robots-tag") ?? "").includes("noindex"));

const prof = await db.query(`select p.account_hash from public.profiles p join auth.users u on u.id = p.account_id where u.email = 'tri@example.com'`);
check("profile row created with HMAC account hash", prof.rows.length === 1 && /^[0-9a-f]{64}$/.test(prof.rows[0].account_hash));
const hash = prof.rows[0]?.account_hash;

// 4. APIs
const status = await (await get(`${APP}/api/guru`, jar)).json();
check("Guruku status: open (safety text final), usage readable", status.available === true && !status.closedReason && status.usage?.mode === "trial", JSON.stringify(status).slice(0, 160));
// Locally GEMINI_API_KEY is a placeholder: Google rejects it, which must release the Rp100 reservation at Rp0.
const guruPost = await get(`${APP}/api/guru`, jar, { method: "POST", headers: { origin: APP, "content-type": "application/json" }, body: JSON.stringify({ message: "Apa itu fotosintesis?" }) });
const guruBody = await guruPost.json();
check("Guruku POST with a rejected key returns provider_error", guruPost.status === 502 && guruBody.status === "provider_error", `${guruPost.status} ${JSON.stringify(guruBody)}`);
const ledger = (await db.query(`select status, settled_idr from public.spend_ledger where account_hash = $1 order by id desc limit 1`, [hash])).rows[0];
check("provider rejection releases the reservation (Rp0 charged)", ledger?.status === "released" && Number(ledger.settled_idr ?? 0) === 0, JSON.stringify(ledger));
const crossSite = await get(`${APP}/api/guru`, jar, { method: "POST", headers: { origin: "https://evil.test", "content-type": "application/json" }, body: "{}" });
check("cross-origin Guruku POST rejected", crossSite.status === 403);

const picks = await (await get(`${APP}/api/jelajahi?acak=1`, jar)).json();
check("Jelajahi random picks from whitelist", Array.isArray(picks.videos) && picks.videos.length === 6, JSON.stringify(picks).slice(0, 100));
const ev = await get(`${APP}/api/events`, jar, { method: "POST", headers: { origin: APP, "content-type": "application/json" }, body: JSON.stringify({ name: "tab_view", props: { tab: "guruku", tab_index: 3, email: "tri@example.com" } }) });
check("client event accepted", ev.status >= 200 && ev.status < 300, `HTTP ${ev.status}`);
const evRows = await db.query(`select name, props::text, account_hash from public.events order by ts`);
check("events stored with account hash, no email/IP", evRows.rows.length >= 2 && evRows.rows.every((r) => !r.props.includes("@") && !/\d+\.\d+\.\d+\.\d+/.test(r.props)), evRows.rows.map((r) => r.name).join(","));

const anon = new Jar();
const unauth = await get(`${APP}/api/jelajahi`, anon);
check("signed-out API call gets 401", unauth.status === 401);

console.log(JSON.stringify({ account_hash: hash, results: results.filter((r) => !r.ok).length === 0 }));
await db.end();
process.exit(results.some((r) => !r.ok) ? 1 : 0);
