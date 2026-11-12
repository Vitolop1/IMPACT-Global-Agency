# CS 452 Sprint 2: live development portal and recruiting workflow

Draft [PR #6](https://github.com/Vitolop1/IMPACT-Global-Agency/pull/6) targets `vito-dev` from `codex/cs452-sprint2-implementation`. No merge was performed.

## Changes

- Connect the portal to a dedicated Supabase development project. Auth roles are database controlled; publication copies an allowlist from the private draft.
- Support academic profiles without sports fields, a verified/sample university catalog, and coach discovery and favorites.
- Let a coach express interest, a student respond, and participants propose and accept a meeting. Keep interest and meetings separate from the staff pipeline and protect them with participant policies and guarded RPCs.
- Preserve staff stage, notes, assignment and history across student saves and publication actions.

## Verification

- `npm test`: 47 passed; the regular suite uses HTTP fixtures and embedded PostgreSQL. The configured build passed.
- Separate real Supabase check: three fixture publications, coach discovery and favorite, student acceptance of interest, time proposal and acceptance from separate browser contexts, and administrator oversight. An unrelated coach could not read or modify the records. Draft isolation, withdrawal and staff history also passed against the hosted service.
- Six Auth accounts were administratively confirmed for development. No real confirmation or recovery email was sent. Production rollout, shared binary media, and calendar/video integrations remain future work.

Refs #1, #2, #3, #4, #5. See [sprint notes](CS452_SPRINT2.md), [backend setup](SUPABASE_SETUP.md), and [AI disclosure](AI_USAGE.md).
