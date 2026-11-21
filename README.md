# Lit Up · litup.id (stealth pilot)

Allowlist-only pilot of the Lit Up learning app for Indonesian learners: Next.js 16 on
Vercel, Supabase (Auth magic link + Postgres, Singapore, Free plan), Gemini for Guruku.
Every page shows the prototype banner and is `noindex`.

Tabs, in this order: **Jelajahi** (Crash Course whitelist, embedded YouTube, browse by
topic), **Belajarku** (display-only plan, usage, watch trail), **Guruku** (AI tutor with
caps and a monthly hard stop), **Komunitas** (preview only).

- Deploy and settings: [docs/DEPLOY-RUNBOOK.md](docs/DEPLOY-RUNBOOK.md)
- Before deploy: [docs/QA-CHECKLIST.md](docs/QA-CHECKLIST.md) and `npm run preflight`
- Guruku safety wording lives only in [lib/guru/prompt-text.ts](lib/guru/prompt-text.ts)
  (currently awaiting the merged LU-GURU-SAFETY text; Guruku stays closed until then)

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in values; never commit
npm run dev                  # http://localhost:3000
```

Without Supabase variables the app fails closed: pages redirect to `/masuk`, APIs return 401.

## Checks

```bash
npm test                     # unit tests (no network, no DB)
npm run typecheck
npm run lint
npm run build

# Database tests against a scratch Postgres 15+ (creates and drops its own databases)
TEST_DATABASE_URL=postgres://user:pass@127.0.0.1:5432/postgres npm run test:db
TEST_DATABASE_URL=… npm run check:concurrency   # required logged check, writes docs/qa/reserve-concurrency-log.json

npm run g5:check             # oEmbed check over every whitelist ID (network)
npm run preflight            # pre-deploy gate
```

## Layout

| Path | What |
| --- | --- |
| `data/jelajahi-crashcourse-whitelist-20261121.json` | Whitelist, committed verbatim (1,643 IDs, 35 topics) |
| `data/jelajahi-g5-excluded.json` | IDs hidden after the G5 oEmbed check (not substituted) |
| `supabase/migrations/` | Schema, RLS, `reserve_spend`/`admit_guru_call`, allowlist hook, deletion |
| `lib/guru/` | Gemini call, pricing, caps pipeline, safety text slots |
| `lib/jelajahi/whitelist.ts` | Video source abstraction (whitelist now, YouTube-wide later) |
| `scripts/` | Allowlist sync, account deletion, spend status, G5 check, preflight |
| `docs/qa/` | Evidence logs (G5 report, concurrency logs) |

## Project context

- [Ideation / product brief](docs/product-brief.md)
- [PRD source](docs/PRD.md) · [PRD PDF](output/pdf/lit-up-prd.pdf)
- [Brand PDF](output/pdf/lit-up-brand-direction.pdf) · [Logo provenance](docs/brand-assets/README.md)
