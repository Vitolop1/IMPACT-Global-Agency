-- Run after the migration in the dedicated IMPACT project's SQL editor.
-- All fixtures are fictional and rolled back. No email is sent by these inserts.
begin;
select set_config('test.player',gen_random_uuid()::text,true);
select set_config('test.coach',gen_random_uuid()::text,true);
select set_config('test.admin',gen_random_uuid()::text,true);
insert into auth.users(id,email,raw_user_meta_data) values
 (current_setting('test.player')::uuid,'cs452-player-'||current_setting('test.player')||'@example.invalid','{"name":"Sample SQL student","account_type":"admin","role":"admin"}'),
 (current_setting('test.coach')::uuid,'cs452-coach-'||current_setting('test.coach')||'@example.invalid','{"name":"Sample SQL coach","account_type":"coach"}'),
 (current_setting('test.admin')::uuid,'cs452-admin-'||current_setting('test.admin')||'@example.invalid','{"name":"Sample SQL admin"}');
update public.accounts set role='admin' where id=current_setting('test.admin')::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub',current_setting('test.player'),true);
do $$ begin
 if (select role from public.accounts where id=auth.uid()) <> 'player' then raise exception 'FAIL: signup role escalation'; end if;
end $$;
update public.student_profiles set draft='{"name":"Sample SQL athlete","sport":"Rugby","goal":"sports","graduation":"2028","academic":"secondary","english":"advanced","budget":"budget20","email":"private@example.invalid"}' where owner_id=auth.uid();
select public.publish_profile(current_setting('test.player')::uuid);
update public.student_profiles set draft=jsonb_set(draft,'{name}','"Unpublished SQL draft"') where owner_id=auth.uid();

select set_config('request.jwt.claim.sub',current_setting('test.coach'),true);
do $$ begin
 if exists(select 1 from public.student_profiles where id=current_setting('test.player')::uuid) then raise exception 'FAIL: coach can read private draft'; end if;
 if (select data->>'name' from public.published_profiles where id=current_setting('test.player')::uuid) <> 'Sample SQL athlete' then raise exception 'FAIL: draft changed publication'; end if;
 if exists(select 1 from public.published_profiles where id=current_setting('test.player')::uuid and (data ? 'budget' or data ? 'email')) then raise exception 'FAIL: private fields published'; end if;
end $$;
insert into public.coach_favorites(coach_id,student_id) values(auth.uid(),current_setting('test.player')::uuid);

select set_config('request.jwt.claim.sub',current_setting('test.admin'),true);
update public.recruitment_cases set status='ready',notes='Sample private note' where student_id=current_setting('test.player')::uuid;
select set_config('request.jwt.claim.sub',current_setting('test.player'),true);
update public.student_profiles set draft=jsonb_set(draft,'{bio}','"Saved draft"') where owner_id=auth.uid();
select public.withdraw_profile(current_setting('test.player')::uuid);
select set_config('request.jwt.claim.sub',current_setting('test.admin'),true);
do $$ begin
 if (select status from public.recruitment_cases where student_id=current_setting('test.player')::uuid) <> 'ready' then raise exception 'FAIL: player overwrote staff state'; end if;
 if not exists(select 1 from public.recruitment_history where student_id=current_setting('test.player')::uuid and new_status='ready') then raise exception 'FAIL: missing staff history'; end if;
end $$;
set local role anon;
do $$ begin
 if exists(select 1 from public.published_profiles where id=current_setting('test.player')::uuid) then raise exception 'FAIL: withdrawn profile visible'; end if;
end $$;
reset role;
select 'PASS: ownership, role protection, publication, privacy, withdrawal, staff status, history' as result;
rollback;
