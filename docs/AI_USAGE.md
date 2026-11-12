# AI assistance disclosure

## Decisions and work owned by Vito

Vito defined IMPACT's purpose, users, business requirements, university project goals, priorities, Git workflow, and the requirement to distinguish real progress from unfinished work. Vito selected Supabase as the backend candidate and specified the draft/public/staff separation and need for human verification of recruiting information.

Vito owns final product decisions, review of this implementation, verification of actual university facts, choice/configuration of the IMPACT project, acceptance of security/privacy policies, and the class presentation. This document does not claim that Vito has already personally reviewed every generated line or completed the live setup.

## Suggestions and implementation assisted by Codex

Codex substantially assisted or generated:

- Architecture: separate private drafts, published snapshots, staff-owned cases, a protected role table, and an explicit local demo mode.
- JavaScript: profile-domain functions, Supabase adapter, authentication/recovery UI integration, recruiting forms, source tracking, intake handoff, and build/configuration handling.
- SQL: the versioned schema, constraints, role bootstrap, RLS policies, publication and participant RPCs, provenance validation, history triggers, and rollback smoke checks.
- Testing/debugging: PostgreSQL/RLS tests, browser HTTP fixtures, lifecycle/media/export regressions, and a separate real Auth/API smoke test in independent browser contexts.
- Development setup: applied migrations to the dedicated IMPACT project, provisioned fictional Auth accounts and fixtures, and verified the shared portal using only the test users' permissions.
- Documentation and Git workflow: Issue drafts, logical commit organization, CI configuration, setup instructions, sprint notes, and the presentation report.

No real university facts, admissions claims, coach details, or scholarship opportunities were generated to populate the application. Fictional records occur only in labeled demos/tests; SQL test fixtures are rolled back.

## Main files and why they changed

| Files | Purpose |
| --- | --- |
| portal/profile-domain.js | Separate draft/public rules and protect staff status |
| portal/supabase-entry.js | Connect official Auth and shared database operations |
| portal/portal.js, portal/index.html, portal/portal.css | Preserve role screens while adding auth, pipeline/research, and explicit publication actions |
| assets/impact-i18n.js | Translate the new controls/messages in the existing four languages |
| index.html | Explicit same-tab intake handoff; retain WhatsApp behavior |
| server.js, scripts/config.cjs, scripts/build.cjs, scripts/demo.cjs | Public configuration, bundling, safe static output, and explicit demo startup |
| .env.example, .gitignore, .assetsignore | Keep actual environment values and generated/private files out of source/deployments |
| supabase/migrations/202611050001_sprint2.sql | Protected roles, ownership, private/published profiles, pipeline, provenance, and RLS |
| supabase/migrations/20261110145219_recruiting_interactions_catalog.sql | Academic profile validation, catalog, and guarded recruiting interactions |
| scripts/provision-test-users.cjs, scripts/live-portal-smoke.cjs | Local fixture provisioning and opt-in hosted verification |
| supabase/tests/permissions.sql | Reproducible hosted SQL smoke script with rollback |
| tests/*.test.cjs, tests/helpers/supabase-fixture.cjs | Regression, Auth contract, SQL permission, and environment checks |
| package.json, package-lock.json | Official Supabase SDK, esbuild, embedded PostgreSQL testing, and reproducible commands |
| vercel.json, wrangler.jsonc | Publish generated public dist output rather than the repository root |
| .github/workflows/portal-tests.yml | Run tests/build on development pushes and PRs |
| README.md, docs/* | Accurate setup, evidence, limitations, presentation, and AI disclosure |

## What Vito should personally understand and review

1. Why a hidden admin button or local password hash is not authorization, and how the protected accounts table/RLS change that boundary.
2. Why a draft row and a published snapshot are separate, which fields publication permits, and why staff state does not belong in player-editable data.
3. How signup metadata is restricted to public-role intent and why administrator promotion is a trusted SQL action.
4. How PKCE confirmation/recovery callbacks work and why a URL query parameter alone cannot authorize password changes.
5. The public nature of published snapshots, the consent language, and whether IMPACT instead wants approved-coach-only discovery before real student use.
6. What source/verification fields mean, who reviewed a record, and why an AI-assisted or verified label cannot replace checking the actual source.
7. The difference between successful local SQL/HTTP contract tests and an actual hosted service/email test.
8. How the meeting and interest RPCs identify the actor with `auth.uid()`, restrict transitions to participants, and preserve the separate staff pipeline.

## Validation and uncertainty

Codex ran `npm test`: 47 passed, zero failed, including the original seven browser scenarios. Codex also built the configured portal and ran the separate hosted smoke test with Supabase development accounts.

Hosted login and shared behavior were verified with independent browser sessions. Signup confirmation and recovery email delivery, production deployment, shared binary media, demo-data import/account linking, concurrency handling, and a full production security review remain incomplete.

GitHub Issue creation was attempted before coding and returned HTTP 403. Exact Issue scopes were saved; the authorized GitHub session later created Issues #1–#5 and draft PR #6. Their timing is documented rather than backdated. A separate Codex review found and fixed blank-source handling, private privileged RPC placement, and zero-row-save reporting. See the presentation report for branch/PR evidence.
