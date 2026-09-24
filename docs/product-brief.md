# Lit Up — product direction

Imported from the visible Lit Up conversation in Cursor on September 25, 2026.
This document preserves the user's stated idea and distinguishes it from the
prototype currently in the repository.

## Confirmed vision

Lit Up is an education web app, with a possible mobile app in the future.
It brings learning resources from different sources together and provides
students with an AI assistant, connected through an API, as a personalized tutor.

The user identified these resource types and example sources:

- YouTube videos.
- Books and audiobooks, with links to buy through sources such as Amazon and Audible.
- Courses from sources such as Coursera.
- University MOOCs and other learning resources.

The user asked for help progressing from ideation through creation.
The sources above are examples from that discussion; specific integrations,
providers, and purchasing flows have not been selected.

During PRD development, the user confirmed that the first release should serve
a broad audience of self-directed learners. See [the draft PRD](PRD.md) for
proposed requirements, acceptance criteria, and remaining decisions.

## Current implementation

Cursor and this workspace point to the same project:
`/Users/fedrochristian/Documents/Lit Up`.
The existing Cursor changes are already present locally and are uncommitted.

The code currently implements a daily journal rather than the education concept:

- A dark, amber calendar interface branded Lit Up.
- Create, edit, and delete daily entries called "sparks."
- Entry titles, notes, and music, people, place, or other tags.
- Browser-local storage and example entries.

The implementation uses Next.js 16.3.6, React 19, TypeScript, and Tailwind CSS 4.
The main files are `app/page.tsx`, `app/layout.tsx`, `app/globals.css`,
`components/`, and `lib/`.

There is no implemented learning-resource catalog, course integration, student
account system, or API-connected AI tutor in the inspected source files.
The daily journal is existing prototype work, not a confirmed product requirement
from the user's education-app description.

## Decisions still open

The visible Cursor conversation does not settle:

- Initial subjects and learning goals within the confirmed self-directed audience.
- The first learning journey and minimum feature set.
- Whether resources are manually curated, searched, imported, or recommended.
- Which AI provider to use and what learning context the tutor receives.
- Account, progress-storage, and deployment requirements.
- Whether and how to reuse the journal prototype in the education app.
- The timing and approach for a mobile app.

These are unresolved design choices, not requirements to infer from the prototype.

## Handoff

Use the confirmed education vision above as the basis for future ideation and
implementation. Preserve existing local work when developing the next iteration.
Read `AGENTS.md` and the relevant installed Next.js documentation before changing
application code.
