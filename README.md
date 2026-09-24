# Lit Up

A working local education website based on the [PRD](docs/PRD.md) and [brand direction](output/pdf/lit-up-brand-direction.pdf). Designed for self-directed learners with the original @litup.id logo, navy/yellow palette, and Indonesian interface.

## Run locally

```bash
npm install
npm run dev:local
```

Open **http://127.0.0.1:3011**. The preview binds to loopback only, using a separate `.next-preview` directory so the earlier Cursor server is not interrupted. Webpack avoids a Turbopack process/port restriction in this environment. Requires Node 20.9+; developed with Node 26.

## Working features

- Seven curated resources: video, courses, MOOCs, books, and audiobook. Combined topic, format, access, level, language, and text filters.
- Keyboard-operable detail dialogs with provider links, access conditions, and local issue reports. Outbound clicks never mark completion.
- Two four-step beginner paths: progress, explicit completion/undo, pause/resume, session estimates, and optional reflection notes.
- Goals/preferences, transparent rule-based path suggestions, bookmarks, and JSON export.
- Server-persistent storage in `.local/workspace.json`, ignored by Git. Validated, serialized atomic writes; corrupt files are preserved rather than reset.
- Optional server-side OpenAI tutor with visible context limitations, opt-in, request limits, and connection/error states.
- Responsive desktop/mobile layouts. Original editorial card artwork, not publisher covers.
- Previous Sparks journal preserved at `/journal`; original localStorage keys/data untouched. Browser storage is origin-specific: use the original hostname/port to see existing journal entries.

## Optional AI connection

Create `.env.local` with the variable names in `.env.example`:

```dotenv
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=a_text_model_available_to_your_project
```

Restart the local server. Never put credentials in `NEXT_PUBLIC_*` variables, commit them, or paste them into chat. Calls occur only after the learner opts in and presses Send. API usage can incur charges; set project spend limits.

The integration follows [official OpenAI text-generation documentation](https://developers.openai.com/api/docs/guides/text), using Responses with `store: false`, a 30-second timeout, and a 5-request/minute local limit. The last seven messages, learner preferences, and editorial resource metadata are sent; full source content is not fetched. Responses are displayed as text, never executed as HTML. Conversations are held only in page memory. `store: false` does not guarantee zero provider-side retention.

Without configuration, the tutor shows “Belum terhubung”; no simulated answers are shown. Live paid API replies have not been tested with a real key.

## Verification

```bash
npm test
npx tsc --noEmit
npm run build -- --webpack
npm run lint
```

Tests cover catalog references, origin checks, input limits, validation, idempotency, concurrent persistence, pause/undo, and corruption preservation. Tests use separate temporary storage.

The new education-app files pass lint. Full-project lint also finds two pre-existing `react-hooks/set-state-in-effect` errors in the preserved journal (`components/SparkForm.tsx`, `lib/use-sparks.ts`); these are not changed as part of the education build.

## Local prototype boundaries

This is a working implementation slice, **not the full production P0 release**. It is one shared local workspace, without accounts or cross-device sync. Do not expose it publicly. Host/origin checks reduce accidental cross-origin access but are not authentication and do not protect against local software.

Before a public pilot: add authentication, per-user database isolation, durable user-level API limits, moderation/age/privacy decisions, account deletion, consent-based analytics, and a protected operator interface. Reports currently stay in the local JSON queue; no external team is notified.

Maintain the catalog in `lib/catalog.ts`. There is no live ingestion or provider completion sync. Keep v1 paths immutable when adding versions; production upgrades need explicit acceptance and persisted plan snapshots. Initial topics and English-language resources are prototype choices, not final product commitments. Lit Up is not affiliated with linked providers, and access terms can change.

## Project context

- [Ideation / product brief](docs/product-brief.md)
- [PRD source](docs/PRD.md) · [PRD PDF](output/pdf/lit-up-prd.pdf)
- [Brand PDF](output/pdf/lit-up-brand-direction.pdf) · [Logo provenance](docs/brand-assets/README.md)

The planning deliverables are unchanged.
