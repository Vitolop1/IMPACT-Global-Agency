# Connect the IMPACT development backend

## Current state

The portal uses [impact-dev](https://supabase.com/dashboard/project/jbhvwpfgpnwyqzfobxcq) in `us-east-1`, provisioned with a quoted additional cost of $0. RugbyNow and andamio-dev were left unchanged. The local checkout is configured with the project URL and publishable key only.

## 1. Choose the dedicated project

Use the existing IMPACT development project. For a new environment, inspect its tables and migration history first. The initial migration is intended for a clean schema.

## 2. Apply and check the schema

These migrations are applied to `impact-dev`, in order. The hosted migration API assigned its own version numbers:

| Source migration | Hosted migration |
| --- | --- |
| `202611050001_sprint2.sql` | `20261110195721_sprint2_initial_schema` |
| `20261110145219_recruiting_interactions_catalog.sql` | `20261110195811_recruiting_interactions_catalog` |
| `20261112191304_university_opportunity_requests.sql` | `20261112191702_university_opportunity_requests` |

Check the migration history before pushing via CLI; do not replay the same SQL under different version numbers. The hosted security advisor found no issues with the requests schema; it reported that Auth leaked-password protection was disabled. The separate `supabase/tests/permissions.sql` check uses transaction-local fixtures and rolls back. It passes in the embedded SQL suite; the hosted workflow below uses actual Auth sessions and test accounts instead.

## 3. Configure Auth

- Enable email/password Auth. Keep email confirmation enabled for the real workflow.
- Configure a working mail provider and test delivery. Supabase's development email limits do not constitute a production mail setup.
- The development Site URL is set to `http://localhost:8000` in `impact-dev`.
- The development allowlist includes `http://localhost:8000/portal` and `http://localhost:8000/portal?reset=1`, for signup and recovery respectively.
- Add equivalent URLs for the exact staging origin when testing a deployed preview. Keep production redirects scoped to the intended host and paths.
- The PKCE verifier is stored in the requesting browser. Open confirmation/recovery links in that same browser. An invalid, expired, or missing-verifier recovery link does not grant password-reset access.

The application asks Supabase to send mail when a user submits signup or recovery. No real signup confirmation or recovery email was sent during verification. Configure the mail provider and verify delivery with an authorized mailbox before relying on these flows.

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

## 6. Verify the hosted workflow

Six development accounts were created with the server-only Supabase Auth Admin API and administratively confirmed. The global confirmation setting was not disabled. Their unique passwords are in the private, ignored `.local/ACCESOS-IMPACT.md`; the ignored machine-readable equivalent is `.local/test-accounts.json`. The fixture provisioning script refuses to reset existing users and its server credential is not required to run the portal or smoke test.

Start the configured portal with `npm start`, then run from another terminal:

```bash
node --env-file-if-exists=.env scripts/live-portal-smoke.cjs
```

The smoke test only targets this development project and fixture identities. It uses Playwright with independent contexts and the real Auth and REST endpoints, without interception or mocks. It can publish fixture profiles and create interest/meeting records; reruns reuse an existing accepted interaction. The optional `--verify-lifecycle` argument also temporarily edits, withdraws and restores the hockey fixture's publication. Do not use that option while editing the fixture manually.

Published snapshots are intentionally public, including to unauthenticated API clients. Private fields are in separate tables. If IMPACT decides discovery must be restricted to approved coaches, change this policy and the publication consent before collecting real data.

University requests are private to the requesting student and IMPACT administrators. Students can request a tryout or academic opportunity from eligible catalog entries and withdraw an active request. Staff can mark it under review or close it. Fictional universities accept requests only from test accounts. Changing a status never contacts the institution or confirms a tryout.

## References reviewed

- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Password recovery client API](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)
- [RLS and trusted authorization data](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Publishable versus secret API keys](https://supabase.com/docs/guides/getting-started/api-keys)
