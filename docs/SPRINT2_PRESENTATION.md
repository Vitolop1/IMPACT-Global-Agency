# CS 452 Sprint 2 presentation report

University of Lynchburg · IMPACT Global Agency

Sprint 1 established the business needs, identified students, coaches and staff, and delivered a browser-local prototype. Sprint 2 turned that prototype into a portal with real authentication, a shared database, and a recruiting interaction that can be demonstrated from separate sessions.

| Area | Evidence |
| --- | --- |
| Authentication | Six fictional accounts log in using real Supabase Auth. Sessions survive reload and logout clears the session. Protected database roles enforce access. |
| Student profiles | Two athletes and one non-athlete published profiles to the shared database. Real draft saves preserved the old publication; republishing replaced it; withdrawal removed coach discovery. |
| Coach workflow | A coach found a published academic student, saved a favorite, and sent interest. The coach could not read private drafts, budgets or staff data. |
| Recruiting interaction | The student accepted the interest, the coach proposed a meeting, and the student accepted. Independent browser contexts displayed the same instant in their respective time zones. |
| Administration | The administrator saw the accepted meeting, edited a separate fixture's staff stage and assignment, and saw its history. The student's later publication actions preserved the staff case. |
| Negative test | The second coach could neither read nor modify the other pair's interest/meeting records. |
| Validation | 47 local tests passed. The separate hosted check used real Auth and database calls, with no HTTP fixture. See [draft PR #6 checks](https://github.com/Vitolop1/IMPACT-Global-Agency/pull/6/checks). |

## Three-minute demo for Arnob

Open [the local portal](http://localhost:8000/portal) and sign in beforehand in three independent browser sessions. Use the private access file at `.local/ACCESOS-IMPACT.md` off-screen. Use the rugby student and academic coach for a fresh pairing; the academic student and rugby coach already have the accepted meeting from the hosted check.

1. **0:00–0:30 — Context and student.** “Sprint 1 defined the problem and produced a local prototype. Sprint 2 connected the same portal to a shared database.” Show the rugby student's current institution and universities of interest as different fields. Edit the fictional bio, save a draft, and explicitly publish it.
2. **0:30–1:10 — Coach.** In the coach session, reload and find the rugby student by sport. Show the published profile, save it, and click “Estoy interesado”. Explain which fields the coach does not receive.
3. **1:10–2:05 — Student and meeting.** In the student session open Connections and refresh, then accept the interest. Switch to the coach, refresh, and propose a time. Return to the student, refresh, and accept. Point to the displayed timezone.
4. **2:05–3:00 — Administration and limits.** In the administrator session refresh Connections to show the accepted meeting. Show the separate staff pipeline and history. End with the draft PR, 47 tests, and the distinction between tested real login and pending email delivery. If time is short, show the previously accepted meeting under Connections.

## Questions to be ready to answer

- **Why is the login secure enough for this demo?** Supabase verifies the identity; the role lives in a protected database table. Access policies still apply if a user modifies frontend state.
- **Why separate the draft, public profile and staff case?** Draft edits must not go live until the student publishes. Coaches should never receive budgets or internal notes. Student edits do not reset recruiting progress.
- **Who can see meeting information?** The participants and authorized administrators. The database checks the current account, ownership and state before applying a response.
- **What remains before real students use it?** Test confirmation and recovery emails; review whether publications should remain public or be limited to approved coaches; verify actual university facts; review production privacy and operations. No production deployment, calendar integration or shared video upload was done.

[Issues #1–#5](https://github.com/Vitolop1/IMPACT-Global-Agency/issues) and [draft PR #6](https://github.com/Vitolop1/IMPACT-Global-Agency/pull/6) record the work. The PR targets `vito-dev`. See [technical notes](CS452_SPRINT2.md), [backend setup](SUPABASE_SETUP.md), and [AI usage](AI_USAGE.md) for evidence and what Vito should review personally.
