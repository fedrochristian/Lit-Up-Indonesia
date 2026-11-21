/**
 * QA condition (c): allowlist check against a real preview deployment.
 *
 *   npx tsx --env-file=.env.local scripts/check-preview-allowlist.mts \
 *     --url https://lit-up-indonesia-<hash>-<team-slug>.vercel.app [--on-list tri@…] [--off-list x@example.com]
 *
 * .env.local must hold the same Supabase project as the preview
 * (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY).
 * Sends at most one real email (to --on-list). Never prints keys.
 */
import { adminFromEnv, flag } from "./lib.mjs";

const NEUTRAL = "Kalau emailmu terdaftar";
const raw = flag("url");
if (!raw || !/^https?:\/\//.test(raw)) {
  console.error("Pass --url https://<preview-host>");
  process.exit(2);
}
const base = new URL(raw).origin;
const offList = flag("off-list") ?? `litup-offlist-${Date.now()}@example.com`;
const bypass = `litup-bypass-${Date.now()}@example.com`;
const onList = flag("on-list");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = adminFromEnv();

let failed = 0;
const report = (ok: boolean, name: string, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#x27;/g, "'");

/** Submits the real /masuk form (server action, progressive-enhancement POST). */
async function submitSignIn(email: string): Promise<{ status: number; html: string }> {
  const page = await fetch(`${base}/masuk`, { redirect: "manual" });
  const html = await page.text();
  const cookie = page.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const form = new FormData();
  for (const m of html.matchAll(/<input[^>]*type="hidden"[^>]*name="([^"]+)"(?:[^>]*value="([^"]*)")?/g)) {
    form.append(m[1], decode(m[2] ?? ""));
  }
  form.append("email", email);
  const res = await fetch(`${base}/masuk`, { method: "POST", body: form, redirect: "manual", headers: { origin: base, cookie } });
  return { status: res.status, html: await res.text() };
}

async function userExists(email: string): Promise<boolean> {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    if (data.users.some((u) => u.email?.toLowerCase() === email.toLowerCase())) return true;
    if (data.users.length < 100) return false;
  }
  return false;
}

const masuk = await fetch(`${base}/masuk`, { redirect: "manual" });
const masukHtml = await masuk.text();
report(
  masuk.status === 200 && masukHtml.includes("Masuk ke Lit Up"),
  "preview serves the app's sign-in page (Vercel Authentication off for previews)",
  `HTTP ${masuk.status}${masuk.status === 401 || /vercel\.com\/(login|sso)/.test(masuk.headers.get("location") ?? "") ? " (Vercel login wall)" : ""}`,
);
report((masuk.headers.get("x-robots-tag") ?? "").includes("noindex"), "noindex header on the preview", masuk.headers.get("x-robots-tag") ?? "missing");

const off = await submitSignIn(offList);
report(off.status === 200 && off.html.includes(NEUTRAL), "off-allowlist email gets the neutral message", `${offList}, HTTP ${off.status}`);
await new Promise((r) => setTimeout(r, 2000));
report(!(await userExists(offList)), "off-allowlist email: no Supabase user created");

const direct = await fetch(`${supabaseUrl}/auth/v1/otp`, {
  method: "POST",
  headers: { apikey: anonKey ?? "", "content-type": "application/json" },
  body: JSON.stringify({ email: bypass, create_user: true }),
});
const directBody = await direct.text();
report(
  direct.status === 403 || /uji internal|Pendaftaran belum dibuka/.test(directBody),
  "direct Supabase Auth sign-up for an off-list email refused by the hook",
  `HTTP ${direct.status} ${directBody.slice(0, 120)}`,
);
report(!(await userExists(bypass)), "direct Auth API: no Supabase user created");

if (onList) {
  const on = await submitSignIn(onList);
  report(on.status === 200 && on.html.includes(NEUTRAL), "allowlisted email gets the neutral message (link requested)", `HTTP ${on.status}`);
  console.log(`MANUAL  open the email sent to ${onList} and confirm it lands on Jelajahi; confirm no email for ${offList}.`);
} else {
  console.log("SKIP    --on-list not given: allowlisted sign-in not exercised.");
}

console.log(failed ? `\n${failed} check(s) failed.` : "\nAutomated condition (c) checks pass. Complete the MANUAL step and tick docs/QA-CHECKLIST.md.");
process.exit(failed ? 1 : 0);
