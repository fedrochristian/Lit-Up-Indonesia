# Lit Up stealth pilot: deploy runbook

Allowlist-only pilot, Sun 22 Nov 2026 13:00–17:00 WIB. Nothing here is done by the
agent: deploys, Vercel settings and Supabase settings wait for the owner's own words.

Order: Supabase → env vars → preview deploy → QA checklist (`docs/QA-CHECKLIST.md`) →
`npm run preflight` → owner says deploy → promote.

## 1. Environment variables

Set every variable in **both Preview and Production** in Vercel
(Project `lit-up-indonesia` → Settings → Environment Variables), and in a local
`.env.local` for scripts. Names are in `.env.example`; never commit values.

| Name | Required | Value / default |
| --- | --- | --- |
| `GEMINI_API_KEY` | yes | Google AI Studio key on a **PAID** tier project (QA condition (a)). Server-only. |
| `GEMINI_MODEL` | no | `gemini-3.5-flash-lite` (must have a price entry in `lib/guru/pricing.ts`, or Guruku stays closed) |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL (Singapore) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon (publishable) key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Supabase service role key. Server-only, never `NEXT_PUBLIC_`. |
| `ACCOUNT_HMAC_KEY` | yes | Random secret, at least 32 characters (`openssl rand -hex 32`). Changing it breaks the link between old events and accounts. |
| `ALLOWLIST_EMAILS` | yes | Comma-separated, max 13: Fedro, Tri (test identity), Steve, Elon, Leo, Charlie, Peter, plus test accounts |
| `NEXT_PUBLIC_SITE_URL` | yes | Production origin, e.g. `https://litup.id`. Previews use their own origin automatically. |
| `PILOT_CAPS_LIFTED` | no | `false`. `true` switches to 100 messages/day per learner; the Rp5m hard stop still applies. |
| `ALERT_WEBHOOK_URL` | no | Free incoming webhook (Slack/Discord/Google Chat) for the Rp4m alert. |
| `ALERT_EMAIL_TO` | no | Recorded only; no email sender is wired (free route). See QA checklist. |
| `MAX_OUTPUT_TOKENS` | no | 1024 |
| `SHORT_RESPONSE_MAX_TOKENS` | no | 400 |
| `THINKING_BUDGET_TOKENS` | no | 512 |
| `MAX_INPUT_TOKENS` | no | 4000 |
| `PER_CALL_RESERVE_IDR` | no | 100 (config refuses values below the worst-case call cost, Rp93 at defaults) |
| `TRIAL_SESSION_MSG_CAP` | no | 14 (x 2 sessions; retries count) |
| `PILOT_DAILY_MSG_CAP` | no | 100 |
| `FREE_MONTHLY_SHORT_CAP` | no | 5 |
| `RATE_LIMIT_USER_PER_MIN` | no | 6 (burst 3 per 10 s is fixed) |
| `RATE_LIMIT_IP_PER_MIN` | no | 30 |
| `USD_IDR_RATE` | no | 18264 |
| `COST_P95_TRIAL_MAX_IDR` | no | 2800 (= 28 x Rp100; renamed from `COST_P95_SESSION_MAX_IDR`) |
| `MONTHLY_BURN_ALERT_IDR` | no | 4000000 |
| `MONTHLY_BURN_HARD_STOP_IDR` | no | 5000000 (per WIB calendar month, resets 00:00 WIB on the 1st) |
| `TRIGGER_CONVERSION_ENABLED` | no | `false` (floor: 100 trials) |
| `TRIGGER_MAU_ENABLED` | no | `false` |

## 2. Supabase (Free plan, Singapore)

1. Create a project in region **Southeast Asia (Singapore)**.
2. SQL Editor → run `supabase/migrations/20261121120000_litup_pilot.sql` once.
   (Or `npx supabase link` + `npx supabase db push`.)
3. Authentication → Sign In / Providers: keep **Email** only; turn off every other provider.
   Leave "Allow new users to sign up" on (the hook below is the gate; turning sign-up
   off would also block allowlisted first-time sign-ins).
4. Authentication → Hooks → **Before User Created** → Postgres →
   `public.hook_before_user_created`. Any email not on the allowlist gets HTTP 403.
5. Fill the hook's allowlist table (stores SHA-256 hashes, not emails):
   `npx tsx --env-file=.env.local scripts/sync-allowlist.mts` (dry run), then add `--apply`.
   Re-run after every `ALLOWLIST_EMAILS` change.
6. Authentication → URL Configuration:
   - Site URL: `https://litup.id` (or the production `NEXT_PUBLIC_SITE_URL`)
   - Redirect URLs:
     - `https://litup.id/**`
     - `https://lit-up-indonesia.vercel.app/**`
     - `https://lit-up-indonesia-*-<owner-team-slug>.vercel.app/**` (preview pattern; keep the
       team slug so other people's `lit-up-indonesia-…` projects cannot receive links)
     - `http://localhost:3000/**`
7. Authentication → Email Templates → **Magic Link**: replace the link with
   `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email`
   so links work when opened on another device. (`/auth/confirm` also accepts the default
   `?code=` link, but that one only works in the browser that asked for it.)
8. Built-in email sending is rate-limited on the Free plan (a few emails per hour). Fine
   for 7–13 people; send links a few minutes apart. Custom SMTP would be a paid/extra service.
9. Database → Backups: confirm platform backups are retained 30 days or less (deletion
   promise: hard delete within 7 days, backups expire within 30 days).

## 3. Vercel (project `lit-up-indonesia`, owner's account)

1. Env vars from section 1 in **Preview and Production**.
2. Settings → Deployment Protection → **Vercel Authentication: off for previews**. The
   app's allowlist sign-in is the gate. (Agent did not change this.)
3. Indexing: handled in code (`X-Robots-Tag: noindex, nofollow` on every response,
   `robots.txt` disallows all, `<meta name="robots" content="noindex">`).
4. Open the PR's preview URL and run `docs/QA-CHECKLIST.md`.
5. Deploy to production only after the owner says so. Rollback: Deployments → previous
   production deployment → Promote (instant, no rebuild).

## 4. Guruku safety text

Guruku is closed (no model calls, no spend) until the merged LU-GURU-SAFETY text from
Elon is pasted into `lib/guru/prompt-text.ts` (`GURU_PROMPT`: text, rule ID,
`status: "final"`). The AI disclosure, hard-stop and refusal copy sit in the same file.
No other file changes are needed; re-run `npm test` and `npm run preflight`.

## 5. Operating the pilot

- Spend: `npm run spend:status` (month totals, alert/hard stop state, Metric 4 p95 vs
  Rp2,800, stale reservations). `-- --settle-stale` settles reservations older than 15 min at
  their reserved amount (conservative).
- Deletion requests outside the app:
  `npm run account:delete -- --email someone@example.com` (dry run with counts), then
  `--confirm`. Records a dated deletion log; cost aggregates stay without the account ID.
- Hard stop at Rp5m: Guruku shows "Guruku sedang istirahat…"; Jelajahi and Belajarku keep working.
