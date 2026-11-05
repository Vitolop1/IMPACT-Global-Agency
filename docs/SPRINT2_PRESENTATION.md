# CS 452 Sprint 2 presentation report

University of Lynchburg · IMPACT Global Agency · November 5, 2026

## 1. Sprint 1 recap

Sprint 1 focused on understanding IMPACT, talking with the team, identifying students, coaches, and administrators, and deciding what the platform should do. A public website and local portal prototype already existed. Accounts and profiles stayed in one browser. There was no shared production backend.

## 2. Sprint 2 goals

- Secure login: replace local account checks with Supabase Auth and database-controlled permissions.
- Shared data: save profiles in a shared database, with clear ownership and private information.
- Recruiting pipeline: help IMPACT staff track students, universities, contacts, and opportunities.

## 3. What was ACTUALLY completed

| Item | Status | Evidence and limit |
| --- | --- | --- |
| Draft/publication and staff-status fixes | Completed | Domain, browser, and SQL regressions pass. Draft saves preserve the live snapshot and Ready status. |
| Auth frontend and Supabase client integration | Completed | Signup/login/logout/session/recovery/reset contract tests pass using the official client and a labeled HTTP fixture. |
| Live secure login and email delivery | Not completed | Dedicated IMPACT project and Auth/email configuration are pending. No real recovery email was tested. |
| Database schema and access rules | Completed | Versioned SQL plus eleven embedded-PostgreSQL tests, including RLS and relationships. |
| Real shared Supabase workflow | Partially completed | Read/write/publication/favorites adapter is implemented and tested across independent contexts using shared fixture data. No hosted project is connected. |
| Pipeline and research screens | Completed | Local demo supports stages, staff assignment, notes, dates, history, universities, contacts, and opportunities. Shared persistence code is implemented but not live-verified. |
| Source and human-verification tracking | Completed | SQL and forms require source/date for reviewed records; no real university facts were generated. |
| Shared binary media | Not completed | Local uploads work; shared mode supports external HTTPS links and disables file upload. |
| Public intake handoff | Completed | Safe same-tab proof of concept; authenticated review/save required. It is not an anonymous database endpoint. |
| Tests and GitHub Actions | Completed | 35 local tests pass; feature-branch CI run 42051908190 passed. |
| GitHub Issues | Completed | Issues #1–#5 created during follow-up, after the initial connector rejection. Their timing is recorded honestly. |
| Feature branch and commits | Completed | Branch pushed; logical commits listed below. |
| Pull Request | Completed | Draft PR #6 opened into vito-dev. No merge was performed. |

## 4. Secure login

The portal now has an integration with Supabase Auth. The shared-mode login has no demo account selector. The player/coach choice appears when creating an account; administration is a protected database role.

Supabase checks the user's identity. The application then reads the role from a database table that the user cannot change. Editing localStorage cannot grant access to real admin data. Password recovery uses a verified PKCE callback before showing the reset form.

I can demonstrate the local login today and show automated tests of the Supabase integration. I cannot yet demonstrate live email confirmation or recovery because the IMPACT project is not configured.

## 5. Supabase / shared data

The migration creates accounts, private student drafts, published snapshots, coach profiles/favorites, staff, recruitment cases/history, universities, contacts, opportunities, and private media metadata.

Private drafts contain the student's editable information. Publication copies only approved fields into a separate snapshot. Budget, account email, age, and staff notes are excluded. Database policies enforce ownership and access.

The application has a Supabase repository for profiles, favorites, pipeline, and research records. The real connection is still pending. In the available local demo, those records stay in localStorage and videos stay in IndexedDB. No real browser-to-browser cloud synchronization is claimed yet.

## 6. Recruiting pipeline

The stages are New, Reviewing, Ready, Contacted, Opportunity, Application, Accepted, and Closed. Only administrators change them. A player saving or publishing a profile does not reset staff progress.

Staff can assign responsibility, add private notes, set a next-action date, and inspect history. Universities can record location, programs, sports, level/division, sources, and verification. Contacts link to universities. Opportunities link students to universities and optional contacts.

Unverified, AI-assisted, human-reviewed, and verified records are distinguished. Reviewed records require an HTTPS source and verification date; the database records who reviewed them. A person still needs to check the source. No university facts or real opportunities were invented.

## 7. Player / Coach / Admin

### Player / Student

- Edit academic and athletic fields and save a private draft.
- Publish explicitly or withdraw the publication.
- Preview the profile and use local video uploads or shared-mode HTTPS highlights links.
- See assigned university suggestions when the university and opportunity have been reviewed.

### Coach

- Search and filter published candidates.
- Open the published version rather than unfinished student edits.
- Save favorites and export the published list.
- Receive no private budget, account email, or staff notes in shared discovery payloads.

### Administrator

- Create/edit managed profiles and explicitly publish or withdraw them.
- Update recruiting stage, staff assignment, notes, and action dates.
- Inspect changes in pipeline history.
- Add/edit university, contact, opportunity, and staff records with sources and verification.

These workflows run locally now. Their hosted Supabase behavior still needs live verification.

## 8. GitHub evidence

Repository: [Vitolop1/IMPACT-Global-Agency](https://github.com/Vitolop1/IMPACT-Global-Agency)

Feature branch: [codex/cs452-sprint2-implementation](https://github.com/Vitolop1/IMPACT-Global-Agency/tree/codex/cs452-sprint2-implementation)

| Commit | Work |
| --- | --- |
| f0b66d7 | Sprint requirements and Issue drafts, before implementation |
| 51b4d00 | Separate drafts/publications and preserve staff status |
| 071eff8 | Supabase schema, protected roles, and SQL tests |
| a876e74 | Auth integration, shared repository, and recruiting screens |
| adb7e1b | Browser/SQL coverage and CI |
| 5db3494 | Publication privilege and CSV privacy refinements |
| b5c70a6 | Accurate README, setup, technical notes, and AI disclosure |

The branch was created from the latest vito-dev at 0a88df1. main was not changed.

GitHub Actions: [Portal tests, successful run 42051908190](https://github.com/Vitolop1/IMPACT-Global-Agency/actions/runs/42051908190), commit b5c70a6. Later documentation-only commits may trigger additional runs.

The original connector returned HTTP 403. The existing authorized GitHub session then created [Issues #1–#5](https://github.com/Vitolop1/IMPACT-Global-Agency/issues) and [draft PR #6](https://github.com/Vitolop1/IMPACT-Global-Agency/pull/6) into vito-dev. Issue scopes were prepared before implementation, but the Issues were created afterward; no historical timing is claimed. GITHUB_ISSUES.md and PULL_REQUEST.md record the evidence.

## 9. Problems I found

- The original local login could be changed from the browser. Real permissions must be enforced by the backend.
- localStorage does not share recruitment records between users or devices.
- Saving a draft changed an already published profile. Separate snapshots now prevent that.
- Player saves reset staff status. Player-editable data and staff cases are now separate.
- Shared data needs ownership, trusted roles, privacy policies, migrations, callbacks, and email setup—not just a database connection.
- Local tests can prove rules and integration behavior, but they cannot prove hosted email delivery or a service that has not been configured.

## 10. Testing

Codex ran the complete suite: **35 passed, zero failed**. The original seven browser scenarios were retained.

- 17 browser scenarios: routes/assets, four languages, WhatsApp, original roles, signup/login/logout, session restoration, recovery/reset contract, role tampering, lifecycle/media, pipeline/research, intake, favorites, CSV privacy, and responsive screens.
- 5 domain tests: snapshots, private-field exclusion, migration, validation, and admin-only status changes.
- 11 SQL tests: role protection, RLS isolation, relationships, snapshot rules, staff history, provenance, grants, server validation, and rollback smoke checks.
- 2 configuration tests: explicit demo mode, unconfigured behavior, and rejection of secret/service keys.

The build passed, desktop/mobile shared-login screenshots were inspected, and GitHub Actions passed on Linux. Earlier setup failures came from a missing browser runtime and sandbox registry access; those were resolved. There are no unresolved failures in the tested suite.

Important limit: Auth/shared-data browser tests use an HTTP fixture, and SQL tests use embedded PostgreSQL with test identities. Hosted Supabase, actual emails, and production deployment remain untested.

## 11. AI disclosure

- I defined IMPACT's goals, users, business rules, and sprint priorities.
- Codex helped generate the schema, access rules, JavaScript, and tests.
- Codex also helped debug the changes and prepare documentation and CI.
- University information still needs human verification; no real university facts were invented.
- I am responsible for understanding the code and reviewing the final decisions.

## 12. What I learned

This sprint shows how a local prototype starts becoming real software. Login screens are only one part of security; the database must enforce who can read and change information. Shared data needs ownership and privacy rules. Drafts, publications, and staff decisions need different storage and rules.

The project also shows why business requirements matter. “Save draft” and “Ready” have meanings for students and staff that the code must preserve. AI can help build and test the system, but people still need to check university information and review the implementation.

## 13. Next step

Connect the separate IMPACT development project. Inspect it, apply the migration, configure public keys and Auth/email callbacks, create controlled test roles, and demonstrate a real player → publication → independent coach → staff workflow. Run the rollback SQL checks and a real recovery-email test before calling shared authentication/data complete.

## Final demo plan — 2–3 minutes

Use `npm run demo` and fictional data. State at the start that this is the local demonstration; the real Supabase project is pending.

1. **0:00–0:20:** Open the portal and log in with the local administrator account. Set the sample student's stage to Ready and save.
2. **0:20–0:55:** Log out, sign in as the sample player, change the profile name, and Save draft. Open its published profile link: the old name remains. Publish explicitly and reload the link: the new name appears.
3. **0:55–1:20:** Log out and sign in as the sample coach. Find the published candidate, open it, and save a favorite. Explain that budget and staff notes are excluded.
4. **1:20–1:50:** Return to administrator. Show Ready was preserved, then change to Contacted with a note. Show history and the university/contact/opportunity forms. Keep research records empty or use clearly named fictional classroom samples with unverified status.
5. **1:50–2:20:** Show the versioned migration and protected role/publication rules. Say: “The database code is built and tested locally. The live IMPACT connection is the next step.”
6. **2:20–2:50:** Show the pushed branch, Issues and draft PR, and successful GitHub Actions run. Show the 35-pass test result. Show draft PR #6. Do not claim real recovery email or cloud synchronization.

## Completion summary

- **COMPLETED:** lifecycle fixes, local pipeline/research UI, Auth/shared adapter code, SQL schema/RLS, tests, CI, documentation, feature branch and pushed commits.
- **PARTIAL:** production authentication/shared data and hosted pipeline verification.
- **BLOCKED:** dedicated IMPACT project creation/configuration, pending explicit organization selection required by the creation tool.
- **NEXT:** activate the dedicated development backend, run real end-to-end/email checks, review draft PR #6, then merge into vito-dev only after acceptance.
