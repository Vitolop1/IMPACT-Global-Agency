# CS 452 Sprint 2

Date: November 5, 2026. Repository: Vitolop1/IMPACT-Global-Agency.

## Goal and starting point

Move the existing HTML/CSS/JavaScript prototype toward secure login, shared profiles, and a useful recruitment pipeline. Sprint 1 established the business requirements and a browser-local prototype; it did not deliver a production backend.

## Selected requirements

- Supabase Auth signup, login, logout, recovery, reset, and session persistence.
- Roles stored in a protected database table; public registration can request player or coach only.
- Separate private draft, published snapshot, and administrator-controlled recruitment state.
- Player edits must preserve published data and staff status. Explicit publication validates and promotes the draft. Withdrawal removes discovery access.
- Coaches receive published, allowlisted fields without budget, private contact details, or staff notes.
- Administrator pipeline: New, Reviewing, Ready, Contacted, Opportunity, Application, Accepted, Closed.
- Universities, contacts, and opportunities retain sources and human-verification information. No invented real university records.
- Preserve the original seven browser scenarios; add lifecycle, authentication, permission, and SQL regression tests and CI.

## Workflow

Start: latest origin/vito-dev at 0a88df1. Feature branch: codex/cs452-sprint2-implementation. Target PR: vito-dev. Do not merge or push changes to main.

Issue creation was attempted before coding. GitHub returned HTTP 403. Exact Issue titles/bodies are in GITHUB_ISSUES.md; no Issue numbers are invented.

## Initial architecture decision

Keep the current screens and vanilla JavaScript. Add a small domain module and a Supabase adapter. A deliberately enabled local demo remains available for tests and classroom demonstrations. Unconfigured production mode must fail closed and must not silently fall back to local accounts.

The browser uses only a Supabase project URL and publishable key. A protected account-role table and database RLS enforce authorization. Administrator promotion happens through a trusted database operation, not signup metadata or localStorage.

## Verification status

Final local verification: 32 tests passed, zero failed; `npm run build` succeeded in unconfigured mode. No IMPACT Supabase project is configured. Live Auth, email delivery, hosted database policies, and real cross-device behavior remain unverified. The user will provide a dedicated IMPACT development project. Unrelated connected projects were not modified.

## Implemented architecture

`profile-domain.js` defines publication and recruitment rules independently of the DOM. `portal.js` retains the existing screens and delegates shared operations to `supabase-entry.js`, which bundles the official Supabase client. The same UI can use an explicitly enabled local demo; production mode never falls back to demo authentication.

The database is the authorization boundary. `accounts.role` is readable by the account owner/admin, but clients cannot write it. Signup accepts only player/coach intent. Initial administrator promotion is a trusted SQL operation. Frontend role checks support navigation; database policies enforce access.

Supabase's client manages session storage, refresh, and PKCE callback verification. `getUser()` verifies the session with Auth, then the application reads the protected account role. Recovery UI opens only after the SDK's PASSWORD_RECOVERY event. A query parameter alone does not authorize a reset.

## Database architecture

| Entity | Purpose and access |
| --- | --- |
| accounts | Auth identity reference and trusted role; self/admin read, no client role writes |
| student_profiles | Private editable JSON draft; owner/admin; only draft column can be updated |
| published_profiles | Public allowlisted snapshot; readable by link visitors/coaches; writes only through authorized publication RPCs |
| coach_profiles / coach_favorites | Coach-owned information and saved published candidates |
| staff_members | Administrator-managed staff roster |
| recruitment_cases / recruitment_history | Staff status, assignment, notes, action date, and immutable history |
| universities | Location, programs/sports arrays, athletic level, source and verification |
| university_contacts | Private contacts linked to a university, with provenance |
| recruitment_opportunities | Student/university/contact relationship, due date, source and verification |
| media_metadata | Private metadata foundation; no shared binary storage integration yet |

Programs and sports are arrays on a university for this sprint. Separate catalog tables would add complexity without a working catalog requirement. Contact/university relationships are enforced by a composite foreign key. Foreign-key and discovery-query indexes support the implemented lookups.

Draft data and published data are separate rows. Publication validates required fields, category values, year, field lengths, and HTTPS highlights links, then copies only approved fields. It never copies budget, age, account email, staff status, notes, or arbitrary JSON. Clients cannot insert snapshots directly.

## Lifecycle decisions

- Save draft: update private editable data; keep publication and staff status unchanged.
- Publish: explicitly validate and replace the published snapshot. Preserve staff status.
- Withdraw: delete the published snapshot; discovery, saved discovery, exports, and public routes exclude it.
- Admin edit: save draft by default. A separate checkbox explicitly publishes those edits; withdrawal has its own action.
- Local video upload: create an immutable blob key. Publishing copies that reference. Replacing/removing a draft video leaves the existing publication intact.
- Shared mode: external highlights links are supported. Binary uploads are disabled until shared storage and access policies are implemented.

## Recruiting pipeline and verification

Stored stages: `new`, `review`, `ready`, `contacted`, `opportunity`, `application`, `accepted`, `closed`. The UI describes the progression as New, Reviewing/Under review, Ready, Contacted, Opportunity, Application, Accepted, Closed. Administrators can move between listed stages; a strict transition graph has not been claimed. Player saves and republication never silently reset a staff stage.

Database triggers record status, assignment, note, and next-action changes with actor and timestamp. Clients cannot edit/delete history. Staff names are records rather than user-editable role claims.

University, contact, and opportunity forms record source URL/name, verification state, last verified date, and reviewer. Reviewed data requires an HTTPS source and a non-future date. The database sets the reviewer from the authenticated identity. No real university data was generated or researched. Student suggestions show manually assigned opportunities only when both the university and opportunity are human-reviewed/verified; there is no automatic matching engine.

## Public intake proof of concept

The inquiry form still prepares a WhatsApp message. A separate Start my profile action stores a small field allowlist in the same tab's session storage and opens the portal. After authentication, the player can explicitly add answers to empty fields, review, and save. It does not create an account or a database row anonymously, overwrite an existing profile automatically, transfer contact details into a public record, or publish without consent.

## Test evidence

`npm test` ran all 32 tests successfully on Node 24: 16 browser scenarios (including the original seven), 5 domain tests, 9 SQL/PostgreSQL tests, and 2 configuration tests. Screenshots of desktop/mobile shared login were inspected. Tests exercise role tampering, signup intent, login/logout/session restoration, PKCE recovery/reset, draft/public separation, immutable local media, staff status/history, research forms, favorites, export privacy/formula protection, relationships, and RLS.

HTTP fixture tests demonstrate browser-to-adapter behavior and shared fixture state between independent contexts. They are not live Supabase tests. SQL tests execute PostgreSQL policies with test-only Auth identities; they do not verify hosted JWT validation or email delivery. A transaction/rollback SQL script is included for the future hosted smoke check.

GitHub Actions installs dependencies and Chromium, runs the suite and build, and uploads results on failure. The feature-branch [run 42051908190](https://github.com/Vitolop1/IMPACT-Global-Agency/actions/runs/42051908190) completed successfully at commit `b5c70a6`.

## Known limitations and next work

- Dedicated hosted IMPACT project, migration, public config, callback settings, email setup, and real shared workflow verification remain blocked on project selection.
- Shared binary media storage is not implemented. Local unused blobs have no automatic cleanup.
- Admin-created profiles are managed records without account-claiming; local demo accounts are never auto-imported into Auth.
- Saving then publishing uses separate API calls. A failed publication can leave a saved private draft while preserving the previous public snapshot.
- Optimistic concurrency, full audit history for all research edits, account deletion UX, monitoring, and production hardening remain future work.
- No production deployment or merge to main was performed.
- GitHub rejected Issue and draft-PR creation with HTTP 403. The feature branch was pushed successfully; exact Issues and PR text are prepared in GITHUB_ISSUES.md and PULL_REQUEST.md. No Issue/PR number is claimed.

See SUPABASE_SETUP.md, AI_USAGE.md, GITHUB_ISSUES.md, and SPRINT2_PRESENTATION.md for reproducible setup, disclosure, issue drafts, and the presentation/demo script.
