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

Implementation and verification results will be recorded after tests run. No Supabase project is configured at the start of this sprint; live Auth, email delivery, hosted database policies, and cross-device behavior are not yet verified.
