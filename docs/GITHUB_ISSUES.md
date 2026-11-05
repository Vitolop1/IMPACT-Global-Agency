# Sprint 2 Issues ready to create

GitHub's integration returned HTTP 403 (Resource not accessible by integration) for Issue creation on 2026-11-05. No Issues were created. The following are exact titles and bodies prepared before implementation. They describe current work, not past accomplishments.

## Issue 1: Secure authentication and account recovery

Replace browser-only authentication with a Supabase Auth integration for signup, login, logout, persistent sessions, and password recovery/reset. Use a unified login; role selection applies to registration only.

Acceptance criteria:
- Production mode fails closed when unconfigured; local demo is explicitly enabled for development.
- Administrator permissions come from a protected database role table, never user-editable metadata.
- No secrets are committed; .env.example and setup instructions identify public configuration.
- Auth UI and denied-access behavior have meaningful tests.
- Live Supabase/email verification is reported separately from mocked or local tests.

Created before Sprint 2 implementation for CS 452; this is planned work, not historical completion.

---

## Issue 2: Shared Supabase data and profile persistence

Introduce versioned SQL migrations and a Supabase repository for one complete profile workflow: player draft/save/publish, coach discovery/favorites, and admin access.

Acceptance criteria:
- Ownership, foreign keys, timestamps, indexes, and RLS are implemented.
- Draft/private data and published coach-visible data are separated.
- Budget, contact details, and staff notes are never included in public discovery payloads.
- SQL tests prove role isolation and lifecycle behavior.
- Independent browser contexts can share data when a real backend is configured.
- Setup and actual verification limits are documented.

No real student records or invented university data will be seeded.

---

## Issue 3: Define and improve recruiting pipeline

Implement the New → Reviewing → Ready → Contacted → Opportunity → Application → Accepted → Closed recruiting workflow with administrator-controlled assignment, notes, dates, and history.

Track universities, contacts, and opportunities with source, verification status, last-verified date, and reviewer. University records start unverified; do not seed invented facts.

Acceptance criteria:
- Admin can track a student through the pipeline and record assignments/history.
- Players cannot overwrite staff status; coaches cannot access internal notes.
- University/contact/opportunity records retain provenance and human-verification fields.
- Current UI capability and schema-only/future capability are distinguished in documentation.

---

## Issue 4: Fix profile publication and staff-review lifecycle

Reproduce and fix two confirmed prototype problems: Save draft changes an already published profile; a player save resets an admin-assigned ready status to review.

Acceptance criteria:
- Draft and published snapshots are separate, including uploaded media references.
- Save draft preserves the current published snapshot and staff status.
- Publish explicitly promotes the latest validated data.
- Withdrawal removes coach/public discovery and exports.
- Existing demo data has a compatible migration.
- Regression tests cover publish, edit, republish, withdrawal, and staff-status preservation.

---

## Issue 5: Run portal tests automatically in GitHub Actions

Add a simple workflow for development pushes and PRs into vito-dev/main.

Acceptance criteria:
- Checkout, install a documented Node version, npm ci, install Playwright Chromium, run npm test.
- A failing test fails the job.
- Useful test results/screenshots are uploaded on failure.
- Preserve the original seven browser scenarios and add relevant Sprint 2 tests.
- SQL tests run in CI if supported, with local versus live verification stated accurately.
