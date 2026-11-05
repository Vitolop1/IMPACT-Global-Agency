# CS 452 Sprint 2: Supabase integration and recruiting workflow

Base: `vito-dev`

Head: `codex/cs452-sprint2-implementation`

Created as [draft PR #6](https://github.com/Vitolop1/IMPACT-Global-Agency/pull/6), targeting vito-dev. The original connector returned HTTP 403; creation succeeded through the existing authorized GitHub session. No merge was performed.

Open: https://github.com/Vitolop1/IMPACT-Global-Agency/compare/vito-dev...codex/cs452-sprint2-implementation?expand=1

Copy the following as the description:

## Result
This sprint adds a Supabase Auth/shared-data implementation while preserving the vanilla JavaScript portal and a deliberately enabled local demo. It fixes draft/publication isolation and staff-status preservation, adds the recruiting pipeline and source-aware research forms, and automates tests.

## Implemented
- Separate private drafts, explicit published snapshots, withdrawal, and immutable local video references.
- Official Supabase client signup/login/logout, persistent sessions, forgot-password and PKCE reset integration.
- Versioned PostgreSQL schema, protected database roles, ownership/RLS, publication RPCs, staff history, universities/contacts/opportunities with verification provenance.
- Shared profile/favorites/admin repository; private budget/contact/staff fields excluded from published payloads.
- Safe same-tab intake handoff, public build output/environment handling, and GitHub Actions.

## Actual verification
- npm test: 35 passed, zero failed, including the original seven browser scenarios.
- SQL/RLS tests run in embedded PostgreSQL with representative public-schema default grants.
- Browser Supabase tests use a labeled HTTP contract fixture; independent contexts share fixture data.
- npm run build succeeds in unconfigured mode; desktop/mobile login screenshots inspected.

## Incomplete / release blockers
No IMPACT Supabase project is selected/configured or migrated. Hosted Auth, actual email delivery and real cross-device shared persistence remain unverified. A separate impact-dev project is planned; the creation tool requires an explicit organization selection, which is pending. Unrelated projects remain untouched.
Shared binary media storage, demo-data import/account claiming, conflict handling and production hardening remain future work. This PR is a draft for review, not a production launch.

## Issues and CS 452 evidence
Issues were prepared before coding; the connector returned HTTP 403. Issues #1–#5 were created afterward through the existing authorized GitHub session, with their timing stated honestly.

Refs #1, #2, #3, #4, #5.
See docs/CS452_SPRINT2.md, docs/SUPABASE_SETUP.md and docs/AI_USAGE.md for architecture, setup, limitations and substantial AI assistance. The requirements/business decisions and final human review belong to Vito.

Target: vito-dev. Do not merge to main.
