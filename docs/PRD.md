# Lit Up
## Product Requirements Document

Version 0.1 | September 25, 2026 | Status: draft for product review

**Product promise:** Help curiosity become a practical learning journey, supported by relevant resources and a personalized AI tutor.

### 1. Executive brief

Lit Up is a web-based learning companion that brings together YouTube videos, books and audiobooks, courses, and university MOOCs. Learners discover resources, follow a small learning plan, and ask an API-connected AI tutor for help. A mobile app is a future possibility.

**Problem hypothesis:** Motivated learners can find abundant content but struggle to decide what is relevant, choose a sequence, and resolve confusion without personal support. Validate this with learner interviews before committing to a broad catalog.

**Proposed first release:** A responsive web app with a curated catalog, editable learner goals, a small set of curated learning paths, saved resources, self-reported progress, and a tutor with explicit source context. Start with a narrow pilot and improve the learning loop before expanding subjects.

**Confirmed from the user:** A broad audience of self-directed learners; the education concept; the named resource types and example providers; a personalized tutor connected through an API; web first with potential mobile later; and the @litup.id profile image as the logo.

**Proposed, not yet approved:** Initial subjects, launch geography and languages, age eligibility, account model, curated-path approach, launch metrics, technical services, and all detailed MVP requirements below. The brand PDF supplies a proposed palette, typography, and voice, not a finalized design system.

**Existing state:** The repository contains an uncommitted Next.js daily “sparks” journal prototype. The education catalog, student accounts, learning paths, and AI tutor are not implemented. Preserve existing work and browser-stored journal data during future development.

**Reading this document:** P0 means required for the proposed pilot; P1 means useful after the core pilot works. Requirement IDs identify testable product behavior. Numeric targets are initial planning targets and need baseline validation.

<!-- pagebreak -->

## 2. Audience, outcomes, and scope

### Confirmed audience

Serve a broad audience of self-directed learners, including students learning beyond a curriculum, working professionals building skills, people exploring new career directions, and lifelong learners following personal interests. Segment by goal, starting knowledge, available time, and language rather than school or job status. Launch geography, supported languages, and age eligibility remain open decisions.

**Exploring learner:** “I know what interests me, but I need a manageable place to start and someone to explain what I do not understand.”

**Goal-driven learner:** “I want to understand a topic or build a skill, with a plan that fits the time I have.”

**Returning learner:** “Help me remember where I stopped, adjust my plan, and continue without choosing everything again.”

**Content operator:** “I need to publish a coherent set of useful resources and correct broken or misleading entries.”

### Intended outcomes

- Learners identify a meaningful goal and a suitable next learning step.
- They can explain a concept or complete a small practice task after studying.
- They return to continue a plan and know what progress they have recorded.
- The team can curate trustworthy material and measure usefulness and tutor cost.

### P0 pilot scope

Responsive web experience; guest catalog browsing; account-based goals and progress; curated resource discovery and filters; resource detail pages and external links; curated paths adapted by simple rules; bookmarks; explicit completion controls; contextual tutoring; basic feedback; and a restricted content-publishing workflow.

### P1 and later

P1: richer recommendation feedback, reminders with opt-in, improved operator tools, and additional curated topics. Later: native mobile apps, automatic web-wide discovery, social feeds, live human tutoring, formal assessments, certificates, institutional dashboards, and offline content access.

### Explicit non-goals for the pilot

No payments or checkout in Lit Up, affiliate monetization commitments, LMS integration, automatic course-completion synchronization, or unrestricted scraping. No promise of access to full books, paid courses, or video transcripts. Purchases and enrollment happen with the external provider.

<!-- pagebreak -->

## 3. Learner journeys and information architecture

### First useful learning session

1. Browse topics and resource previews without an account.
2. Create an account when saving a resource, making a plan, or starting tutor chat. After authentication, resume the original action without duplicating it.
3. Describe a goal and choose experience level, available time, and preferred learning language. Format preferences are optional.
4. Review a proposed curated path, its expected effort, and why it fits. Accept it or change preferences; do not enroll automatically.
5. Open the first resource, understand its access conditions, then study on Lit Up where available or visit the provider.
6. Ask the tutor about the current step, try a practice question, and explicitly mark progress. On return, see the next incomplete step.

### Returning or changing direction

Resume from My learning, choose an active path, and see the last recorded state. Learners can pause a path, edit their goal, or choose another path. Changing preferences produces a proposed revision; it does not silently reset completed steps or overwrite the active plan.

### Information architecture

- **Explore / Jelajahi:** curated topics, search, filters, and resource detail pages.
- **My learning / Belajarku:** active paths, saved resources, completed steps, and next actions.
- **Tutor / Tutor AI:** conversation scoped to a selected path or resource; context is visible.
- **Profile:** preferences, account settings, and data controls.
- **Operator area:** restricted catalog and path maintenance; excluded from learner navigation.

### Important alternate paths

No matches: offer nearby topics and a clear reset action, without inventing resources. No suitable path: show relevant catalog entries and explain that a path is not available. Paid material: identify the external purchase requirement before the learner leaves. Broken resource: keep the plan intact and offer an operator-approved alternative. Tutor unavailable: retain the message draft and keep catalog, bookmarks, and progress usable.

<!-- pagebreak -->

## 4. Requirements: discovery and resource access

### CAT-01 | P0 | Curated resource catalog

Publish only reviewed entries. Each entry has a stable ID, title, creator/provider, canonical HTTPS URL, resource type, topic, language, difficulty, access label, summary, and last-reviewed date. Duration is optional and labeled as unknown when absent. Access labels distinguish free, paid, mixed/free preview, and unknown. Avoid displaying unverified live prices.

**Acceptance:** Every published entry has required fields and a working destination at review time. Draft or archived entries do not appear in public discovery. A detail page clearly distinguishes editorial summary from original provider content.

### CAT-02 | P0 | Search and filtering

Search the published catalog by title, summary, topic, and creator. Combine topic, language, level, format, and access filters. Preserve the current query and filters when returning from a detail page. Search covers Lit Up's catalog, not the entire internet.

**Acceptance:** A controlled seed catalog returns the expected results for exact and partial queries; combined filters narrow results correctly. Empty states offer a reset. Search terms containing markup display as text and cannot execute code.

### CAT-03 | P0 | Resource detail and outbound access

Show why the resource is relevant, its type and access conditions, and a labeled provider action. For YouTube, an embed is optional when permitted and available; always provide an external link. Books, audiobooks, courses, and MOOCs use outbound links for the pilot.

**Acceptance:** Learners can open the resource without an embed. Links identify the destination and any new-tab behavior. Missing thumbnails use a designed fallback. An outbound click never marks a resource complete.

### CAT-04 | P0 | Catalog quality and unavailable resources

Let learners report broken links, incorrect details, or unsuitable content. Operators can review reports, update entries, or archive them. Existing bookmarks and path steps retain the resource identity and show an unavailable state rather than disappearing.

**Acceptance:** A report reaches a restricted review queue with its resource ID. After an entry is archived, it leaves discovery and remains identifiable in existing plans. Replacing a path resource requires an explicit plan update and does not copy completion to the replacement.

<!-- pagebreak -->

## 5. Requirements: goals, plans, and progress

### LRN-01 | P0 | Learner profile and goal

Capture a short free-text goal, starting level, weekly time budget, and language preference. Explain why each input helps. Learners can edit preferences later. Do not infer age, ability, or sensitive traits from chat.

**Acceptance:** Required fields validate with helpful messages; submitted preferences survive sign-out and sign-in. Changing a preference does not mutate an accepted path until the learner confirms a revision.

### LRN-02 | P0 | Curated path selection

Use transparent topic, level, language, and time-fit rules to rank approved paths. Each path has a learning outcome, ordered steps, effort estimates, resource references, and small practice or reflection prompts. The AI may explain a path; it cannot silently introduce unreviewed resources or fabricate links.

**Acceptance:** Suggested paths cite the preferences used. Learners can preview all steps and accept or decline. If no match meets required language or level constraints, explain the gap instead of claiming a match. Acceptance creates a versioned learner plan.

### LRN-03 | P0 | Saved resources

Save and remove resources independently of a learning path. Show current metadata and availability. Save/remove operations are repeatable without duplicate entries.

**Acceptance:** A saved resource appears once across sessions and devices. Removing a bookmark leaves path membership and completion unchanged. An unauthorized account cannot read or change another learner's saved list.

### LRN-04 | P0 | Explicit progress and resume

Use not started, in progress, and completed step states, with user-controlled completion and undo. A resource launch can record activity but cannot prove study time or mastery. Calculate path progress from completed steps, not link clicks. Completion can reveal a reflection or optional practice prompt.

**Acceptance:** Completing or undoing a step immediately updates the displayed count and persists to the account. Reloading shows the same state. Completion retries cannot double-count. Learners may submit or skip a short reflection/practice response; submitted responses are private, persist with the step, and emit one event per submission. Offline or failed writes show unsaved status and retry. Multiple sessions follow the latest server-accepted change.

**Plan changes:** Published path edits create a new version. Existing learners keep their accepted version until they choose to update; changed resource IDs start incomplete.

<!-- pagebreak -->

## 6. Requirements: personalized AI tutor

### AI-01 | P0 | Visible and bounded context

Show which goal, path step, and resource inform the conversation. Send only necessary learner preferences, current context, and bounded conversation history to a server-side model integration. Keep conversations separated by learner and context. Changing context starts a new thread or requires an explicit choice to carry context forward.

**Acceptance:** Two-account tests show no cross-account messages or retrieval. The tutor names its active context correctly and does not claim to have watched a video or read a book when that material was not supplied.

### AI-02 | P0 | Grounded explanations and source honesty

Use approved catalog metadata and authorized excerpts or transcripts where available. For resource-specific claims, cite the supporting item or excerpt with a usable link. Clearly distinguish a general explanation from a claim grounded in source content. If only a summary is available, say so; do not invent quotations, chapters, timestamps, or references.

**Acceptance:** Evaluation covers missing transcripts, unsupported questions, contradictory material, and malicious instructions inside supplied content. Retrieved content cannot override tutor instructions or trigger actions. Lack of support produces a limitation or clarifying question.

### AI-03 | P0 | Teaching behavior

Respond in the learner's chosen language, adapt explanation depth to the selected level, and use relevant examples. For help with practice, offer a hint, then an explanation and a short check for understanding when useful. Personalization is based on stated goals and interactions; do not present it as a validated learning-style diagnosis.

**Acceptance:** A review rubric scores relevance, clarity, factual support, and useful next steps. Users can mark a response helpful or unhelpful and optionally explain why.

### AI-04 | P0 | Failure handling and cost controls

Keep credentials server-side. Enforce authenticated usage, configurable per-account limits, message/context length limits, timeouts, and a global cost ceiling. Retain the learner's draft on failure. A retry creates at most one visible answer; interrupted replies are labeled incomplete. The tutor cannot purchase, enroll, change progress, or alter account settings.

**Acceptance:** Simulated timeout, provider outage, quota exhaustion, duplicate submission, and unavailable retrieval produce clear recovery states. Logs contain operational IDs and error categories, not API keys or raw conversation text by default.

<!-- pagebreak -->

## 7. Accounts, content operations, and data

### ACC-01 | P0 | Account boundary and controls

Use one supported authentication method for the pilot; the exact service is undecided. Guests can browse; personal state and tutor usage require sign-in. Authorize access to every learner-owned record on the server. Provide account recovery, sign-out, conversation deletion, and account-data deletion flows.

**Acceptance:** Expired sessions return to sign-in without losing a pending non-sensitive action. Direct requests using another learner's IDs are denied. A deletion confirmation explains the scope; active product data is removed within the proposed seven-day service window. Backup expiry and provider-side retention must be documented before launch.

### OPS-01 | P0 | Restricted publishing workflow

Operators create draft resources and paths, preview them, then publish or archive. Validate required metadata and URLs. Record the editor, timestamp, and change. A restricted admin screen or reviewed import workflow is acceptable for the pilot; do not require a full CMS.

**Acceptance:** A learner cannot access publishing actions. A path cannot publish with missing, draft, or archived resource references. Publishing creates a version and preserves prior learner-plan versions. Reports can be marked reviewed with a recorded disposition.

### Logical data model

- **Learner + preferences:** account reference, chosen language, level, time budget, and editable goals.
- **Resource:** stable ID, provider metadata, access status, availability, editorial summary, review date, and permitted source context.
- **Path + path version + step:** outcome, audience fit, ordered resource references, prompts, and estimates.
- **Learner plan + step progress:** accepted path version, explicit state, server timestamps, and last activity.
- **Reflection/practice response:** learner-owned step response, prompt/version, submission time, and editable text; no mastery score is inferred.
- **Bookmark:** unique learner/resource pair, independent of path membership.
- **Tutor thread + message:** learner/context ownership, role, content, source references, completion status, and usage metadata.
- **Feedback + content report + audit event:** target IDs, category, optional comment, review status, and operator changes.

### Data boundaries

Store account and learning state in a persistent backend, not browser-only storage. Restrict transcript/excerpt ingestion to authorized material. Define conversation retention, analytics retention, deletion handling, and model-provider data treatment before pilot launch. Never send full chat messages, goals, or email addresses in analytics events.

<!-- pagebreak -->

## 8. Experience, brand, and quality requirements

### Brand and interface

Use the existing Lit Up profile logo and preserve its proportions. The proposed visual direction uses deep navy #202650, yellow #F6CF50, warm white #FAF8F0, and ink #202332. These supporting colors are proposals; the embedded logo retains its own original colors. Keep reading surfaces calm and reserve yellow for useful emphasis.

Use encouraging Indonesian by default for the proposed pilot, with English learning content clearly labeled. “Nyalakan mimpimu” is the tagline direction; “Hi Lits” can appear in welcome moments. Explain AI context and limitations where relevant without crowding normal learning screens with technical detail.

### UX-01 | P0 | Responsive and accessible interaction

Support widths from 360 px upward with no horizontal scrolling in core flows. All actions must work with a keyboard, have visible focus, and use meaningful labels. Do not encode availability or completion solely by color. Announce saved/error states, use readable type, respect reduced-motion preferences, and keep tutor input usable with a mobile keyboard.

**Acceptance:** Manually verify onboarding, discovery, saving, progress, and tutoring on mobile and desktop, with keyboard navigation and a screen reader. Check text contrast, zoom, touch targets, and logical reading order. Name the supported browser/device matrix before release.

### REL-01 | P0 | Reliability and responsiveness

Proposed pilot budgets: first useful catalog content within 3 seconds on an agreed mobile test profile; ordinary data actions within 1 second at p95; tutor first visible response within 5 seconds at p95. Use a 30-second tutor timeout with clear recovery. Measure model response separately from normal app performance.

**Acceptance:** Verify against a documented dataset and concurrency level agreed before load testing. Until these are chosen, these numbers are targets rather than validated guarantees. A provider outage must not prevent catalog use or progress updates.

### SEC-01 | P0 | Product security

Keep secrets server-side; validate inputs and external URLs; render user and model text safely; authorize all account data; restrict operator permissions; and enforce rate limits on expensive actions. Avoid exposing internal error details. Record security-relevant operational events without unnecessary personal data.

**Acceptance:** Check unauthorized access, stored script injection, repeated costly requests, and malicious source instructions. Fix all release-blocking defects before inviting pilot learners.

<!-- pagebreak -->

## 9. Measurement and learning plan

### North-star measure

**Weekly learners with meaningful learning activity:** unique signed-in learners who explicitly complete at least one plan step and submit a reflection or practice attempt in the same week. This is an engagement signal, not proof of mastery. Keep the distinction visible in reports.

### Proposed pilot scorecard

- **Activation:** at least 50% of new accounts accept a plan, open a resource from it, and receive a successful tutor response within 24 hours. Denominator: new accounts with a full 24-hour observation window; exclude team/test accounts.
- **Week-one continuation:** at least 30% of activated learners return for another learning action on days 2-7 after activation. Denominator: activated learners with a complete seven-day window. A landing-page visit alone does not qualify.
- **Tutor usefulness:** at least 80% helpful among rated responses; report rating participation and sample size alongside the score.
- **Source quality:** at least 90% of resource-specific answers in the prelaunch evaluation have correctly supported references; no fabricated quotations or source-access claims in the release evaluation set.
- **Operational cost:** track AI cost per successful response and activated learner. The owner must set per-account and total pilot spending limits before enabling real users.

### Event contract

Record resource_viewed, resource_opened, resource_saved, goal_saved, path_previewed, path_accepted, step_started, step_completed, step_reopened, reflection_submitted, tutor_request_started, tutor_response_completed, tutor_response_failed, tutor_feedback_submitted, and resource_reported.

Common fields: event ID, server timestamp, pseudonymous learner ID where available, session ID, resource/path/version/step IDs as relevant, and entry point. Tutor events also include request ID, latency, status, model identifier, and usage/cost metadata. Exclude raw prompts, replies, email addresses, and free-text goals. Deduplicate by event ID and request ID.

### Validation approach

Proposed discovery: interview 8-12 self-directed learners across student, professional/career, and personal-interest contexts. Observe how they choose resources. Proposed usability round: 5 learners complete the main journey without coaching. Proposed pilot: 20-30 learners across those contexts over four weeks; publish counts and qualitative findings because the cohort is too small for strong population claims. Targets are hypotheses to revise with evidence.

<!-- pagebreak -->

## 10. Delivery plan and release acceptance

### Sequence and dependencies

**Stage A - Product and content definition:** validate needs across the confirmed self-directed audience; choose two initial learning topics, outcomes, and pilot budget. Seed at least two paths with 4-6 steps each. This is a proposed content minimum, not a restriction to one demographic. Review every launch resource and its available tutor context.

**Stage B - Core learning flow:** implement catalog, account boundary, onboarding, path preview/acceptance, bookmarks, and persistent progress. Validate the journey with representative content before adding tutor complexity.

**Stage C - Contextual tutor:** select provider/model, implement source-context handling, citations, teaching behavior, feedback, quotas, and failure recovery. Complete a documented evaluation before pilot access.

**Stage D - Pilot readiness:** verify operator workflow, accessibility, analytics, account deletion, budgets, and support ownership. Run the small usability round, resolve critical friction, and invite the pilot cohort. Dates and staffing remain unestimated until scope and capacity are agreed.

### Release gate

- All P0 requirement acceptance checks pass with recorded evidence.
- The complete learner journey works on the agreed mobile and desktop matrix.
- Every published resource and path has an owner, review date, and valid references.
- Tutor evaluation covers at least 30 cases across explanation, practice, missing context, unsupported claims, malicious source text, and failure states.
- Cross-account access and operator authorization checks pass; no unresolved critical or high-impact security defects remain.
- Source support meets the prelaunch evaluation target in section 9; reviewers score relevance, clarity, and useful next steps separately. Adoption and rated-usefulness targets are assessed during the pilot, not used as prelaunch gates.
- Analytics events reconcile with scripted journeys, and duplicate events do not inflate progress or activation.
- Authentication, storage, hosting, model-provider retention, deletion behavior, and cost ceilings are selected and documented.
- A named owner can disable tutoring, archive content, and respond to pilot reports. Disabling tutoring leaves the learning catalog and saved progress available.

### Prototype transition

Archive the current journal route or retain it behind an explicitly separate route when education work begins. Do not silently migrate journal entries into learning progress or clear existing local storage. This PRD authorizes no code migration by itself; it describes the proposed product.

<!-- pagebreak -->

## 11. Decisions, risks, and references

### Decisions required before implementation or pilot

- **D1 / Eligibility and access - before UX:** the broad self-directed audience is confirmed. Decide launch geography, languages, and age eligibility; if minors are included, define the appropriate account and consent experience before recruitment.
- **D2 / Content - before seeding:** choose the first two topics, curator, path outcomes, and source-context permissions. Decide whether embeddings are needed at all for the small curated corpus.
- **D3 / Services - before integration:** choose authentication, persistent storage, hosting, and AI provider/model. Keep credentials and model calls on the server; preserve provider portability where practical.
- **D4 / Tutor - before evaluation:** approve context boundaries, response rubric, quotas, and the retention/deletion policy. Decide which authorized excerpts can support the initial paths.
- **D5 / Launch - before invitations:** assign operational owners, support process, total spend ceiling, browser matrix, and test concurrency. Agree whether the proposed pilot scorecard is useful.
- **D6 / Brand - before visual sign-off:** confirm production typography, relationship to the wider Lit Up organization, and access to an original vector logo. The raster profile logo is already available.

### Main risks and responses

**Too broad a catalog:** begin with two coherent topics and expand only after learner feedback. **Unsupported tutor claims:** bound context, cite real sources, and evaluate missing-content cases. **Stale external links:** review metadata, accept reports, and archive with graceful fallback. **High AI costs:** enforce quotas and a global ceiling before real usage. **Low learner return:** test the relevance of goals and next steps before adding gamification. **Sensitive chat content:** minimize collection, limit access, and settle retention and deletion behavior before launch.

### Source of truth and provenance

The user's education vision is recorded in docs/product-brief.md. The current brand direction is output/pdf/lit-up-brand-direction.pdf, version 0.2. The logo source and preservation notes are in docs/brand-assets/README.md. This PRD's detailed feature choices and acceptance targets are proposals derived from that context, not decisions recovered from Cursor.

Public brand references: [Instagram profile](https://www.instagram.com/litup.id/), [vision post](https://www.instagram.com/p/CtDg70sroVV/), and [Pena Harapan program](https://www.instagram.com/p/CtHA4P3S8Sx/), reviewed September 25, 2026. No external provider integration, endorsement, transcript availability, or content-use permission is assumed.

**Maintenance:** docs/PRD.md is the editable source. Update it when a decision is made, record the version/date, and regenerate the PDF so product and engineering use the same requirements.
