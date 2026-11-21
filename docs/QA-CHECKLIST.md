# Lit Up stealth pilot: QA checklist (before deploy)

Tick each item with name, date and evidence. Unticked items block the production deploy.
`npm run preflight` must also exit 0 against the env you are deploying.

## Gate items

- [x] **Condition (a): model and price.** Model ID `gemini-3.5-flash-lite` and its price
  (input USD 0.30 / 1M tokens, output incl. thinking USD 2.50 / 1M tokens, as in
  `lib/guru/pricing.ts`) verified against Google's live pricing page by **Elon (CTO review of
  PR 1, 21 Nov 2026)**. Guruku sends `thinkingLevel: MINIMAL` (Google lists only thinking levels
  for this model). Re-check if Google changes the page before deploy.
- [ ] **Condition (a): PAID tier key. Owner: Fedro.** In Google AI Studio, confirm the project
  behind `GEMINI_API_KEY` has billing enabled (paid tier). *Not verified by the agent or Elon.*
- [x] **Guruku safety text.** Elon's merged LU-GURU-SAFETY-20261121 text is in
  `lib/guru/prompt-text.ts` with `status: "final"` (hard-stop and refusal copy included;
  `tests/unit/guru-safety.test.ts` holds an independent copy).
- [ ] **reserve_spend concurrency check, logged.** `TEST_DATABASE_URL=… npm run check:concurrency`
  passes and `docs/qa/reserve-concurrency-log.json` is committed for the current migration
  (preflight compares the migration hash). Parallel reservations must never exceed the cap.
- [ ] **Condition (c): allowlist on the preview URL** (run once the preview exists; Vercel
  Authentication is off for previews, so the script reaches the app directly):

  ```bash
  npm run check:preview -- \
    --url https://lit-up-indonesia-<hash>-<team-slug>.vercel.app --on-list tri@<domain>
  ```

  Uses the preview's own Supabase project (same env as the preview). It checks: the page is
  the app's sign-in (not a Vercel login wall) and `noindex`; an off-allowlist address on `/masuk`
  gets the neutral message and **no user is created**; the same address sent straight to the
  Supabase Auth API is refused by the hook (HTTP 403); the `--on-list` address gets the neutral
  message. Then, by hand: Tri opens the emailed link on her phone and lands on Jelajahi; no email
  arrived for the off-list address (it is a non-deliverable `example.com` address by default).
  (Local equivalent: `npm run test:e2e`.)
- [ ] **G5 automated check.** `npm run g5:check` over all whitelist IDs; every failure is
  listed in `data/jelajahi-g5-excluded.json` (hidden, not substituted).
- [ ] **G5 manual sample.** Play the 20 IDs in `docs/qa/g5-oembed-report.json` →
  `manual_sample` in the preview (Jelajahi search by title): each plays embedded, or shows
  the truthful fallback.
- [ ] **Deletion.** Using Tri's test identity: Akun → Hapus akun & data → type HAPUS.
  Check Supabase: user gone, `deletion_log` has a dated row, `spend_ledger` rows for it have
  no account hash. Sign in again works (fresh account).
- [ ] **Hard stop copy.** On a preview, temporarily set
  `MONTHLY_BURN_ALERT_IDR=50` and `MONTHLY_BURN_HARD_STOP_IDR=99` (below one Rp100 reserve):
  Guruku shows "Guruku sedang istirahat…", Jelajahi/Belajarku still work. Revert both.
- [ ] **Noindex.** `curl -I <preview>/` shows `x-robots-tag: noindex, nofollow`;
  `/robots.txt` disallows all.
- [ ] **Vercel Authentication off for previews**, env vars present in Preview and Production,
  Supabase redirect URLs include the preview pattern.

## Daily during the pilot

- [ ] `npm run spend:status`: settled vs Google billing console; no stale reservations;
  Metric 4 line reads "below threshold, n = X" (p95 and max per trial unit vs Rp2,800, with
  full vs partial units). Report it with n; it is a reading, not a pass.
- [ ] Rp4m alert path: `ALERT_WEBHOOK_URL` set, or someone reads the server logs for `[ALERT]`.
  Email alert to `ALERT_EMAIL_TO` is **not wired** (no free email sender on this route).
