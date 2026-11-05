const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
let db;
const player='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222', coach='33333333-3333-4333-8333-333333333333', admin='44444444-4444-4444-8444-444444444444';
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);
  await db.exec(fs.readFileSync('supabase/migrations/202611050001_sprint2.sql','utf8'));
  for (const [id,type] of [[player,'player'],[other,'player'],[coach,'coach'],[admin,'admin']]) await db.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)',[id,{name:'Sample test account',account_type:type,role:'admin'}]);
  await db.query("update public.accounts set role='admin' where id=$1",[admin]);
});
after(async () => db?.close());
async function as(id, fn) {
  await db.exec('begin; set local role authenticated;');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
  try { const value=await fn(); await db.exec('commit'); return value; }
  catch(e) { await db.exec('rollback'); throw e; }
}
const sample = {name:'Sample athlete',sport:'Rugby',goal:'sports',graduation:'2028',academic:'secondary',english:'advanced',budget:'budget20',email:'private@example.test',notes:'Do not publish'};
test('SQL: signup metadata cannot grant admin; roles cannot be changed by clients', async () => {
  const r=await as(player,()=>db.query('select role from accounts where id=$1',[player]));
  assert.equal(r.rows[0].role,'player');
  await assert.rejects(as(player,()=>db.query("update accounts set role='admin' where id=$1",[player])), /permission denied/);
});
test('SQL: owner saves a draft; other players and coaches cannot read it or staff notes', async () => {
  await as(player,()=>db.query('update student_profiles set draft=$1 where id=$2',[sample,player]));
  for(const id of [other,coach]) {
    const r=await as(id,()=>db.query('select * from student_profiles where id=$1',[player])); assert.equal(r.rows.length,0);
    assert.equal((await as(id,()=>db.query('select * from recruitment_cases'))).rows.length,0);
  }
  await assert.rejects(as(coach,()=>db.query('select publish_profile($1)',[player])),/Forbidden/);
});
test('SQL: publication is allowlisted; draft edits preserve snapshot and staff status', async () => {
  await as(admin,()=>db.query("update recruitment_cases set status='ready', notes='Private staff note' where student_id=$1",[player]));
  await as(player,()=>db.query('select publish_profile($1)',[player]));
  const published=(await as(coach,()=>db.query('select data from published_profiles where id=$1',[player]))).rows[0].data;
  assert.equal(published.name,sample.name);
  for(const key of ['budget','email','notes']) assert.equal(key in published,false);
  await as(player,()=>db.query('update student_profiles set draft=$1 where id=$2',[{...sample,name:'Edited draft'},player]));
  assert.equal((await as(coach,()=>db.query('select data from published_profiles where id=$1',[player]))).rows[0].data.name,sample.name);
  assert.equal((await as(admin,()=>db.query('select status from recruitment_cases where student_id=$1',[player]))).rows[0].status,'ready');
  await assert.rejects(as(player,()=>db.query("update recruitment_cases set status='closed' where student_id=$1 returning *",[player])).then(r=>{assert.equal(r.rows.length,0); throw new Error('denied by RLS');}),/denied by RLS/);
  await as(player,()=>db.query('select publish_profile($1)',[player]));
  assert.equal((await as(coach,()=>db.query('select data from published_profiles where id=$1',[player]))).rows[0].data.name,'Edited draft');
});
test('SQL: favorites are private and withdrawal removes anonymous and coach discovery', async () => {
  await as(coach,()=>db.query('insert into coach_favorites(coach_id,student_id) values($1,$2)',[coach,player]));
  assert.equal((await as(other,()=>db.query('select * from coach_favorites'))).rows.length,0);
  await as(player,()=>db.query('select withdraw_profile($1)',[player]));
  assert.equal((await as(coach,()=>db.query('select * from published_profiles'))).rows.length,0);
  assert.equal((await as(coach,()=>db.query('select * from coach_favorites'))).rows.length,0);
  await db.exec('begin; set local role anon;');
  assert.equal((await db.query('select * from published_profiles')).rows.length,0); await db.exec('rollback');
});
test('SQL: administrator pipeline updates record immutable history', async () => {
  const r=await as(admin,()=>db.query("update recruitment_cases set status='contacted' where student_id=$1 returning *",[player]));
  assert.equal(r.rows[0].updated_by,admin);
  const h=await as(admin,()=>db.query('select * from recruitment_history where student_id=$1 order by created_at',[player]));
  assert.equal(h.rows.at(-1).new_status,'contacted');
  await assert.rejects(as(admin,()=>db.query('delete from recruitment_history')), /permission denied/);
});
test('SQL: research needs provenance and relationships; suggestions exclude unverified data', async () => {
  await assert.rejects(as(admin,()=>db.query("insert into universities(name,verification_status) values('Sample test university','verified')")),/requires a source/);
  const uni=(await as(admin,()=>db.query("insert into universities(name,source_url,verification_status,last_verified_at) values('Sample test university','https://example.test/source','verified',now()) returning id"))).rows[0].id;
  await as(admin,()=>db.query("insert into recruitment_opportunities(student_id,university_id,title) values($1,$2,'Sample test opportunity')",[player,uni]));
  assert.equal((await as(player,()=>db.query('select * from suggested_universities()'))).rows.length,0);
  await as(admin,()=>db.query("update recruitment_opportunities set verification_status='human-reviewed',source_url='https://example.test/opportunity',last_verified_at=now() where student_id=$1",[player]));
  assert.equal((await as(player,()=>db.query('select * from suggested_universities()'))).rows.length,1);
  assert.equal((await as(coach,()=>db.query('select * from universities'))).rows.length,0);
  await assert.rejects(as(admin,()=>db.query("insert into recruitment_opportunities(student_id,university_id,title) values($1,gen_random_uuid(),'Invalid FK')",[player])),/foreign key/);
});
