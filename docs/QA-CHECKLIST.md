# Lit Up stealth pilot: QA checklist (before deploy)

Tick each item with name, date and evidence. Unticked items block the production deploy.
`npm run preflight` must also exit 0 against the env you are deploying.

## Gate items

- [ ] **Condition (a): model and price.** On Google's live Gemini API pricing page, confirm
  the model ID `gemini-3.5-flash-lite` exists and its price matches `lib/guru/pricing.ts`
  (input USD 0.30 / 1M tokens, output incl. thinking USD 2.50 / 1M tokens). If it differs,
  update `lib/guru/pricing.ts`; config refuses to run if the worst-case call exceeds the Rp100
  reserve. *Not verified by the agent: needs a person and the live page.*
- [ ] **Condition (a): PAID tier key.** In Google AI Studio, confirm the project behind
  `GEMINI_API_KEY` has billing enabled (paid tier). *Not verified by the agent.*
- [ ] **Guruku safety text.** Merged LU-GURU-SAFETY text from Elon pasted into
  `lib/guru/prompt-text.ts` with `status: "final"`; AI disclosure, hard-stop and refusal
  copy checked against it. Until then Guruku shows "Guruku belum aktif" and makes no calls.
- [ ] **reserve_spend concurrency check, logged.** `TEST_DATABASE_URL=… npm run check:concurrency`
  passes and `docs/qa/reserve-concurrency-log.json` is committed for the current migration
  (preflight compares the migration hash). Parallel reservations must never exceed the cap.
- [ ] **Condition (c): allowlist on the preview URL.** (1) An off-allowlist email on `/masuk`
  shows the neutral message and **no email arrives**; Supabase Auth → Users shows no new user.
  (2) Tri's test identity receives a link, opens it, lands on Jelajahi.
  (Automated equivalent against a local Supabase stack: `npm run test:e2e`, see the file header.)
- [ ] **G5 automated check.** `npm run g5:check` over all whitelist IDs; every failure is
  listed in `data/jelajahi-g5-excluded.json` (hidden, not substituted).
- [ ] **G5 manual sample.** Play the 20 IDs in `docs/qa/g5-oembed-report.json` →
  `manual_sample` in the preview (Jelajahi search by title): each plays embedded, or shows
  the truthful fallback.
- [ ] **Deletion.** Using Tri's test identity: Akun → Hapus akun & data → type HAPUS.
  Check Supabase: user gone, `deletion_log` has a dated row, `spend_ledger` rows for it have
  no account hash. Sign in again works (fresh account).
- [ ] **Hard stop copy** (after the safety text is in). On a preview, temporarily set
  `MONTHLY_BURN_ALERT_IDR=50` and `MONTHLY_BURN_HARD_STOP_IDR=99` (below one Rp100 reserve):
  Guruku shows "Guru sedang istirahat…", Jelajahi/Belajarku still work. Revert both.
- [ ] **Noindex.** `curl -I <preview>/` shows `x-robots-tag: noindex, nofollow`;
  `/robots.txt` disallows all.
- [ ] **Vercel Authentication off for previews**, env vars present in Preview and Production,
  Supabase redirect URLs include the preview pattern.

## Daily during the pilot

- [ ] `npm run spend:status`: settled vs Google billing console; no stale reservations;
  Metric 4 p95 per trial ≤ Rp2,800.
- [ ] Rp4m alert path: `ALERT_WEBHOOK_URL` set, or someone reads the server logs for `[ALERT]`.
  Email alert to `ALERT_EMAIL_TO` is **not wired** (no free email sender on this route).
