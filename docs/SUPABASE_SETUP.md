# Connect the IMPACT development backend

## Current state

The integration is implemented and tested locally. No IMPACT hosted project has been selected, migrated, or configured. The connected Supabase account showed RugbyNow and andamio-dev; both were left unchanged. The user chose to provide a separate IMPACT development project.

## 1. Choose the dedicated project

Create/select an IMPACT development project and provide its name or project ref. Before applying SQL, inspect its tables and migration history. This migration creates new public tables and is intended for a clean project; do not apply it blindly to an existing application.

## 2. Apply and check the schema

In that project's SQL editor, run `supabase/migrations/202611050001_sprint2.sql` once. It is a transaction: a failure rolls back the migration. The file is also compatible with a Supabase CLI migration workflow if one is adopted later.

Then run `supabase/tests/permissions.sql`. It creates fictional transaction-local fixtures, tests ownership, role protection, publication privacy, withdrawal, and staff state, and rolls everything back. A successful script returns a PASS result. This script has passed locally against embedded PostgreSQL; it has not yet run on hosted Supabase.

Review the project's security/performance advisories after migration. No university records are seeded.

## 3. Configure Auth

- Enable email/password Auth. Keep email confirmation enabled for the real workflow.
- Configure a working mail provider and test delivery. Supabase's development email limits do not constitute a production mail setup.
- Set the development Site URL to `http://localhost:8000`.
- Allow callbacks on `http://localhost:8000/portal**` during local development. The recovery path is `/portal?reset=1`; the SDK can add PKCE flow parameters.
- Add the equivalent `/portal**` callback on the exact staging origin when testing a deployed preview. Review and tighten the callback configuration for the final deployment; do not allow arbitrary origins.
- The PKCE verifier is stored in the requesting browser. Open confirmation/recovery links in that same browser. An invalid, expired, or missing-verifier recovery link does not grant password-reset access.

The application asks Supabase to send mail only when a user submits signup or password recovery. No live mail was sent during the local fixture tests.

## 4. Set public client configuration

Copy `.env.example` to `.env` in the repository root. Fill in:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_BROWSER_PUBLISHABLE_KEY
IMPACT_MODE=
```

Find the project URL in the project's connection/API settings and the browser publishable key in API Keys. A legacy anon key also works. Do not use a secret key, service-role key, database password, or access token. The configuration code rejects secret/service-role keys.

`.env` is ignored. `.env.example` intentionally has empty values only. `npm start` loads `.env`; `npm run build` embeds only the public URL/key into ignored `dist/portal/runtime-config.js`. The development server does not serve environment files or repository metadata.

For hosted previews, set the same two variables in the hosting environment, then build. Leave `IMPACT_MODE` empty. `npm run demo` is a deliberate local prototype mode and ignores shared configuration.

## 5. Create roles safely

Register a normal player or coach through the application. Signup metadata can request either public role. Metadata requesting admin still becomes player; subsequent metadata edits do not alter database roles.

After registering the intended administrator and confirming the email, a trusted project owner can run this in the SQL editor, replacing the placeholder email:

```sql
update public.accounts
set role = 'admin'
where id = (
  select id from auth.users where email = 'YOUR_ADMIN_EMAIL'
);
```

Check that exactly the intended account changed. The client has no write privileges on `accounts`. No public administrator-promotion RPC exists. Never implement promotion through `user_metadata`.

Administrative assignment uses `staff_members` records. Add real staff names through the admin form; an account connection is optional in the schema and has no public edit flow in this sprint.

## 6. Verify the real end-to-end workflow

Use fictional test data in the development project:

1. Sign up a player and confirm the email in the same browser.
2. Sign in, edit fields, save a draft, and reload.
3. Publish with explicit consent.
4. In an independent browser, sign in as a coach and find that publication.
5. Inspect network responses: no private draft, budget, account email, or internal notes should be returned to the coach.
6. Change the player's draft; the coach must still see the previous publication until republish.
7. As administrator, assign staff, set Ready, and write a note. Save another player draft; Ready must remain.
8. Withdraw; coach discovery and the public route must stop returning the publication.
9. Request password recovery, open the actual email link, set a new password, and verify the old password fails.
10. Review hosted database policies and advisories, then record results in the sprint notes.

Published snapshots are intentionally public, including to unauthenticated API clients. Private fields are in separate tables. If IMPACT decides discovery must be restricted to approved coaches, change this policy and the publication consent before collecting real data.

## References reviewed

- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Password recovery client API](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
- [RLS and trusted authorization data](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Publishable versus secret API keys](https://supabase.com/docs/guides/getting-started/api-keys)
