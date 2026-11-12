# IMPACT Global Agency

IMPACT helps students and student-athletes, particularly from Argentina and Latin America, explore academic, athletic, and cultural opportunities. This repository contains the public website and recruitment portal. It is also Vito Loprestti's University of Lynchburg CS 452 Senior Project.

Development happens on `vito-dev` or a feature branch based on it. `main` remains the stable deployment branch; use reviewed Pull Requests.

## Run locally

Use Node 24 (the version used for validation).

```bash
npm ci
npx playwright install chromium
npm start
```

Open the [site](http://localhost:8000/) or the [portal](http://localhost:8000/portal). In the configured development checkout, test logins are in the private, ignored `.local/ACCESOS-IMPACT.md` file. Other checkouts need the public configuration below.

`npm run demo` explicitly enables the local prototype. It is useful for classroom demonstrations and contains fictional sample profiles.

| Demo account | Password | Role |
| --- | --- | --- |
| jugador@impactglobalagency.com | impactdemo | Player/student |
| coach@impactglobalagency.com | impactdemo | Coach |
| admin@impactglobalagency.com | impactdemo | Administrator |

These are test identifiers, not contact email addresses. Demo accounts and permissions are NOT production security.

`npm start` reads an optional ignored `.env`. Without Supabase configuration it keeps sign-in unavailable; it never silently enables demo accounts. The public website still works.

## Current working features

- Four-language public website, responsive navigation, inquiry form, and WhatsApp message preparation.
- Player draft/edit/publish/withdraw/preview and HTML export.
- Separate draft and published snapshots, including immutable references to local uploaded videos.
- Coach discovery, filters, favorites, profile viewing, and CSV export using published data only.
- A responsive coach candidate grid with local avatar placeholders, and a signed-in university catalog where students can request a sports tryout or academic opportunity for IMPACT staff review.
- Administrator profile editing, explicit publication/withdrawal, pipeline status, assignment, notes, dates, and history.
- University, contact, staff, and opportunity forms with provenance and human-verification fields.
- Optional inquiry-to-profile handoff within the same browser tab. Answers enter an authenticated form and require review/save; there is no anonymous profile-creation endpoint.

## Prototype/local-only features

In demo mode, accounts, profile drafts, published snapshots, favorites, research records, and pipeline state live in `localStorage` under `impactPortalV1`. Sessions use `sessionStorage`. Uploaded MP4/WebM videos up to 50 MB live in IndexedDB (`impactPortalMedia`).

Existing V1 profile records are migrated in memory to separate snapshots and saved on the next edit. Published video blobs are not overwritten by draft uploads. Old blobs are retained until browser storage is cleared; automated cleanup is future work.

Demo data is not synchronized between browsers or devices. Clearing browser storage deletes it. Use fictional data in this mode.

## Supabase-backed implementation

The source now includes:

- Official Supabase Auth client integration: signup, login, logout, persistent session, forgot-password, and PKCE reset callback.
- Protected database roles, ownership/RLS policies, private profile drafts, and allowlisted public snapshots.
- Shared profile read/write, publication/withdrawal RPCs, coach favorites, admin pipeline/research persistence, and reviewed opportunity suggestions.
- Academic/cultural/exchange profiles without sports fields, a safe university catalog, and coach institution selection.
- Coach interest, student response, in-portal inbox, and participant-controlled meeting proposals with local time display and administrator oversight.
- Versioned schema in `supabase/migrations/`.
- Transactional SQL smoke checks: `supabase/tests/permissions.sql`.

**Development connection:** [impact-dev](https://supabase.com/dashboard/project/jbhvwpfgpnwyqzfobxcq) is migrated and connected. Six fictional Supabase Auth accounts have been provisioned. Independent browser contexts using the real service completed publication, discovery, an interest response, meeting acceptance, and administrator oversight. Email delivery is separate and has not been tested.

Follow [Supabase setup](docs/SUPABASE_SETUP.md). Copy `.env.example` to an ignored `.env`, then set only:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_BROWSER_PUBLISHABLE_KEY
```

Leave `IMPACT_MODE` empty for Supabase. A legacy `anon` key is supported; secret/service-role keys are rejected. No server secret is required by the browser integration.

## Publication and recruitment rules

A draft save changes private editable data. It never changes the published snapshot or staff status. Publish validates the draft and replaces the snapshot explicitly. Withdraw deletes the snapshot; coach search, saved discovery, CSV exports, and public routes stop returning it.

Player edits do not change staff status, including when republishing. Only administrators can change New → Reviewing → Ready → Contacted → Opportunity → Application → Accepted → Closed. Administrators may move between any listed stages; changes are recorded in history. The stored key `review` is retained for compatibility.

Published snapshots exclude budget, account email, age, internal notes, assignments, and review history. A student can intentionally include information in free text, so the publication form asks them to review what they share.

Universities, contacts, and opportunities start `unverified`. Other states are `ai-assisted`, `human-reviewed`, and `verified`. Reviewed records require an HTTPS source and verification date. The database records the authenticated reviewer. A status records a human's review; it is not a guarantee that a university fact is correct. No real university data is seeded.

## Testing

```bash
npm test
npm run build
```

Validation: **49 tests passed, 0 failed**. This includes browser coverage of the candidate grid and university request flow, plus SQL/RLS tests for request privacy and allowed status changes.

The regular suite runs without cloud credentials: the SQL tests use embedded PostgreSQL (PGlite) and the Supabase browser contract tests use an HTTP fixture. The separate [hosted verification](docs/SUPABASE_SETUP.md#6-verify-the-hosted-workflow) uses real credentials and changes only development fixtures; it does not run in CI.

Screenshots are written to ignored `test-results/`. `PLAYWRIGHT_MODULE_PATH` can select an existing Playwright installation.

GitHub Actions is configured for pushes to `vito-dev`/`codex/**` and PRs into `vito-dev`/`main`. It installs dependencies and Chromium, runs `npm test`, builds, and uploads results on failure. See [checks on draft PR #6](https://github.com/Vitolop1/IMPACT-Global-Agency/pull/6/checks).

## Build and hosting

`npm run build` creates ignored `dist/` using tracked public assets, a bundled browser client, and generated public runtime configuration. It excludes environment files, SQL, documentation, tests, and Git metadata. The development server also restricts access to public routes/assets.

Vercel now builds and publishes `dist/`; Cloudflare Workers uses `dist/` for its ASSETS binding. Run the build before Cloudflare deployment. Cloudflare Pages should also use `npm run build` and output directory `dist`. Set the two public Supabase variables in the hosting environment before enabling hosted login.

No production deployment is performed by this sprint. A deployment without configuration intentionally shows sign-in as unavailable.

## Not yet implemented

- Live signup confirmation and recovery email delivery. The signup and PKCE recovery/reset UI were tested with an HTTP fixture; seeded accounts were confirmed administratively.
- Shared binary media uploads, storage policies, signed playback URLs, and cleanup. In Supabase mode, upload controls are disabled with an explanation; HTTPS highlights links work through the profile model.
- Import of local demo accounts/profiles into real accounts.
- Claiming an administrator-created student record from a newly registered account.
- External email notifications, calendar/video integrations, university-data research, and automatic matching.
- Concurrent-edit conflict resolution, production monitoring, and a completed production security review.

## Next steps and class material

Review discovery consent and permissions before accepting real student data. Configure and verify email separately before a wider rollout.

- [Sprint technical notes](docs/CS452_SPRINT2.md)
- [Presentation-ready report and demo plan](docs/SPRINT2_PRESENTATION.md)
- [AI assistance disclosure](docs/AI_USAGE.md)
- [Exact Issue titles/bodies](docs/GITHUB_ISSUES.md)
