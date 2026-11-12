const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
let db;
const ids = {
  student: '10111111-1111-4111-8111-111111111111',
  otherStudent: '10222222-2222-4222-8222-222222222222',
  academic: '10333333-3333-4333-8333-333333333333',
  coach: '10444444-4444-4444-8444-444444444444',
  otherCoach: '10555555-5555-4555-8555-555555555555',
  admin: '10666666-6666-4666-8666-666666666666'
};
const athlete = { name: 'Sample published athlete', sport: 'Rugby', goal: 'sports', graduation: '2028', academic: 'secondary', english: 'advanced', budget: 'budget20', email: 'private-student@example.test', notes: 'Private staff note' };
let reviewedUniversity, sampleUniversity, hiddenUniversity;
async function as(id, action) {
  await db.exec('begin; set local role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [id]);
  try { const result = await action(); await db.exec('commit'); return result; }
  catch (error) { await db.exec('rollback'); throw error; }
}
async function scalar(id, sql, values = []) { return (await as(id, () => db.query(sql, values))).rows[0].result; }
async function express(student = ids.student, coach = ids.coach, message = 'Sample recruiting message') {
  return scalar(coach, 'select express_interest($1,$2) as result', [student, message]);
}
async function respondInterest(interest, response, actor = ids.student) {
  await as(actor, () => db.query('select respond_to_interest($1,$2)', [interest, response]));
}
async function propose(interest, actor = ids.coach, when = new Date(Date.now() + 86400000).toISOString(), zone = 'America/New_York', duration = 30) {
  return scalar(actor, 'select propose_meeting($1,$2,$3,$4,$5) as result', [interest, when, zone, duration, 'Sample meeting message']);
}
async function respondMeeting(meeting, response, actor = ids.student) {
  await as(actor, () => db.query('select respond_to_meeting($1,$2)', [meeting, response]));
}
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;
    alter default privileges in schema public grant all on tables to anon,authenticated;
    alter default privileges in schema public grant execute on functions to anon,authenticated;`);
  await db.exec(fs.readFileSync('supabase/migrations/202611050001_sprint2.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/20261110145219_recruiting_interactions_catalog.sql','utf8'));
  for (const [name, id] of Object.entries(ids)) {
    const type = name.toLowerCase().includes('coach') ? 'coach' : 'player';
    await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [id, `${name}-private@example.test`, { name: `Sample ${name}`, account_type: type }]);
  }
  await db.query("update accounts set role='admin' where id=$1", [ids.admin]);
  for (const id of [ids.student, ids.otherStudent]) {
    await as(id, () => db.query('update student_profiles set draft=$1 where id=$2', [{ ...athlete, name: id === ids.student ? athlete.name : 'Sample second athlete' }, id]));
    await as(id, () => db.query('select publish_profile($1)', [id]));
  }
  reviewedUniversity = await scalar(ids.admin, "insert into universities(name,location,programs,sports,notes,source_url,source_name,verification_status,last_verified_at) values('Sample reviewed university','Sample location',array['Sample program'],array['Rugby'],'Private research notes','https://example.test/research','Sample source','human-reviewed',now()) returning id as result");
  sampleUniversity = await scalar(ids.admin, "insert into universities(name,is_sample,notes) values('Sample classroom university',true,'Private sample note') returning id as result");
  hiddenUniversity = await scalar(ids.admin, "insert into universities(name,notes) values('Hidden unverified university','Private staff research') returning id as result");
  await as(ids.coach, () => db.query('update coach_profiles set university_id=$1,data=$2 where user_id=$3', [reviewedUniversity, { institution: 'Untrusted client institution', name: 'Untrusted client name', email: 'private-coach@example.test' }, ids.coach]));
});
after(async () => db?.close());

test('SQL interactions: academic publication does not require a sport, athletic publication does', async () => {
  const draft = { ...athlete, name: 'Sample academic student', goal: 'academic' }; delete draft.sport;
  await as(ids.academic, () => db.query('update student_profiles set draft=$1 where id=$2', [draft, ids.academic]));
  await as(ids.academic, () => db.query('select publish_profile($1)', [ids.academic]));
  const snapshot = (await as(ids.academic, () => db.query('select data from published_profiles where id=$1', [ids.academic]))).rows[0].data;
  assert.equal(snapshot.goal, 'academic'); assert.equal(snapshot.sport, undefined);
  await as(ids.academic, () => db.query("update student_profiles set draft=jsonb_set(draft,'{goal}','\"sports\"') where id=$1", [ids.academic]));
  await assert.rejects(as(ids.academic, () => db.query('select publish_profile($1)', [ids.academic])), /sport/);
});
test('SQL interactions: catalog exposes only reviewed or explicit sample safe fields', async () => {
  for (const user of [ids.student, ids.coach]) {
    const rows = (await as(user, () => db.query('select * from university_catalog()'))).rows;
    assert.deepEqual(new Set(rows.map(row => row.id)), new Set([reviewedUniversity, sampleUniversity]));
    assert.equal(rows.find(row => row.id === sampleUniversity).is_sample, true);
    for (const row of rows) {
      assert.equal(Object.hasOwn(row, 'notes'), false); assert.equal(Object.hasOwn(row, 'verified_by'), false);
      assert.doesNotMatch(JSON.stringify(row), /Private|email|phone|contact/i);
    }
    assert.equal((await as(user, () => db.query('select * from universities'))).rows.length, 0);
  }
  await db.exec('begin; set local role anon;');
  await assert.rejects(db.query('select * from university_catalog()'), /permission denied/); await db.exec('rollback');
  await assert.rejects(as(ids.coach, () => db.query('update coach_profiles set university_id=gen_random_uuid() where user_id=$1', [ids.coach])), /foreign key/);
});
test('SQL interactions: only coaches express interest and labels are derived without private contact data', async () => {
  await assert.rejects(express(ids.student, ids.otherStudent), /Forbidden/);
  await assert.rejects(express(ids.student, ids.admin), /Forbidden/);
  const id = await express();
  assert.equal(await express(ids.student, ids.coach, 'Do not overwrite the original message'), id);
  const row = (await as(ids.student, () => db.query('select * from recruitment_interests where id=$1', [id]))).rows[0];
  assert.equal(row.status, 'pending'); assert.equal(row.coach_name, 'Sample coach');
  assert.equal(row.student_name, athlete.name); assert.equal(row.institution_name, 'Sample reviewed university');
  assert.equal(row.message, 'Sample recruiting message'); assert.doesNotMatch(JSON.stringify(row), /private.*@|budget20|Private staff note/);
  for (const user of [ids.otherStudent, ids.otherCoach]) assert.equal((await as(user, () => db.query('select * from recruitment_interests'))).rows.length, 0);
  assert.equal((await as(ids.admin, () => db.query('select * from recruitment_interests'))).rows.length, 1);
  await assert.rejects(as(ids.coach, () => db.query("insert into recruitment_interests(student_id,coach_id,coach_name,student_name) values($1,$2,'Forged','Forged')", [ids.otherStudent, ids.coach])), /permission denied/);
  await assert.rejects(as(ids.student, () => db.query("update recruitment_interests set status='accepted' where id=$1", [id])), /permission denied/);
});
test('SQL interactions: only the owning student accepts pending interest before scheduling', async () => {
  const id = await express();
  await assert.rejects(respondInterest(id, 'accepted', ids.coach), /Only the student/);
  await assert.rejects(respondInterest(id, 'accepted', ids.otherStudent), /Only the student/);
  await assert.rejects(respondInterest(id, 'accepted', ids.admin), /Only the student/);
  await assert.rejects(propose(id), /must be accepted/);
  await respondInterest(id, 'accepted');
  await assert.rejects(respondInterest(id, 'declined'), /not pending/);
});
test('SQL interactions: meeting dates, IANA timezone, duration and participant restrictions are enforced', async () => {
  const id = await express();
  await assert.rejects(propose(id, ids.otherCoach), /Forbidden/);
  await assert.rejects(propose(id, ids.admin), /Forbidden/);
  await assert.rejects(propose(id, ids.coach, '2000-01-01T00:00:00Z'), /future/);
  await assert.rejects(propose(id, ids.coach, 'infinity'), /future/);
  await assert.rejects(propose(id, ids.coach, undefined, 'Not/AZone'), /IANA/);
  await assert.rejects(propose(id, ids.coach, undefined, 'UTC', 0), /Duration/);
  const meeting = await propose(id);
  await assert.rejects(propose(id, ids.student), /active meeting/);
  for (const user of [ids.otherCoach, ids.otherStudent]) {
    assert.equal((await as(user, () => db.query('select * from meeting_requests'))).rows.length, 0);
    await assert.rejects(respondMeeting(meeting, 'accepted', user), /Forbidden/);
  }
  await assert.rejects(respondMeeting(meeting, 'accepted', ids.coach), /own proposal/);
  await assert.rejects(respondMeeting(meeting, 'accepted', ids.admin), /only cancel/);
  await respondMeeting(meeting, 'accepted');
  const row = (await as(ids.coach, () => db.query('select * from meeting_requests where id=$1', [meeting]))).rows[0];
  assert.equal(row.status, 'accepted'); assert.equal(row.response_by, ids.student);
  assert.equal(row.timezone, 'America/New_York'); assert.equal(row.duration_minutes, 30);
  await respondMeeting(meeting, 'reschedule_requested', ids.coach);
  const replacement = await propose(id, ids.student, undefined, 'UTC', 45);
  await respondMeeting(replacement, 'declined', ids.coach);
  await assert.rejects(respondMeeting(replacement, 'accepted', ids.coach), /already closed/);
});
test('SQL interactions: withdrawal blocks new discovery while retaining participant history and cancellation rights', async () => {
  const id = await express();
  const meeting = await propose(id);
  await as(ids.student, () => db.query('select withdraw_profile($1)', [ids.student]));
  await assert.rejects(express(ids.student, ids.otherCoach), /not available/);
  assert.equal((await as(ids.coach, () => db.query('select * from published_profiles where id=$1', [ids.student]))).rows.length, 0);
  assert.equal((await as(ids.coach, () => db.query('select * from recruitment_interests where id=$1', [id]))).rows.length, 1);
  assert.equal((await as(ids.student, () => db.query('select * from meeting_requests where id=$1', [meeting]))).rows.length, 1);
  await respondMeeting(meeting, 'cancelled', ids.admin);
  const replacement = await propose(id, ids.student);
  await respondInterest(id, 'withdrawn', ids.coach);
  const row = (await as(ids.student, () => db.query('select * from meeting_requests where id=$1', [replacement]))).rows[0];
  assert.equal(row.status, 'cancelled'); assert.equal(row.response_by, ids.coach);
  await assert.rejects(propose(id), /must be accepted/);
});
test('SQL interactions: declined interest is terminal and new RPCs expose no privileged public implementations', async () => {
  const id = await express(ids.otherStudent, ids.otherCoach);
  await respondInterest(id, 'declined', ids.otherStudent);
  await assert.rejects(respondInterest(id, 'accepted', ids.otherStudent), /not pending/);
  const routines = (await db.query("select n.nspname as schema,p.proname as name,p.prosecdef as definer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname in ('university_catalog','express_interest','respond_to_interest','propose_meeting','respond_to_meeting')")).rows;
  assert.equal(routines.length, 10);
  for (const row of routines) assert.equal(row.definer, row.schema === 'private');
  for (const signature of ['university_catalog()', 'express_interest(uuid,text)', 'respond_to_interest(uuid,text)', 'propose_meeting(uuid,timestamptz,text,integer,text)', 'respond_to_meeting(uuid,text)']) {
    const rights = (await db.query("select has_function_privilege('anon',$1,'EXECUTE') as allowed", [`public.${signature}`])).rows[0];
    assert.equal(rights.allowed, false);
  }
  await assert.rejects(as(ids.admin, () => db.query('delete from recruitment_interests')), /permission denied/);
  await assert.rejects(as(ids.coach, () => db.query("update meeting_requests set status='accepted'")), /permission denied/);
});
