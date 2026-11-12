-- Add safe university discovery and consent-based recruiting conversations.
-- This follows the Sprint 2 baseline; it does not expose staff notes or contacts.
begin;
alter table public.accounts add column is_sample boolean not null default false;

alter table public.universities add column is_sample boolean not null default false;
alter table public.coach_profiles add column university_id uuid references public.universities(id) on delete set null;
create index coach_profiles_university on public.coach_profiles(university_id);

-- Academic/cultural/exchange students do not need an athletic field to publish.
create or replace function private.publish_profile(profile_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare p public.student_profiles; snapshot jsonb; required_key text;
begin
  select * into p from public.student_profiles where id = profile_id for update;
  if p.id is null or not (coalesce(p.owner_id = auth.uid(), false) or private.is_admin()) then raise exception 'Forbidden' using errcode='42501'; end if;
  foreach required_key in array array['name','goal','graduation','academic','english','budget'] loop
    if nullif(trim(p.draft->>required_key), '') is null then raise exception 'Incomplete profile: %', required_key; end if;
  end loop;
  if p.draft->>'goal' = 'sports' and nullif(trim(p.draft->>'sport'), '') is null then raise exception 'Incomplete profile: sport'; end if;
  if (p.draft->>'graduation') !~ '^20[0-9]{2}$' and p.draft->>'graduation' <> '2100' then raise exception 'Invalid graduation year'; end if;
  if p.draft->>'goal' not in ('sports','academic','cultural','exchange') or p.draft->>'academic' not in ('secondary','transfer','graduate') or p.draft->>'english' not in ('basic','intermediate','advanced','tested') or p.draft->>'budget' not in ('budget10','budget20','budget30','budget45','discuss') then raise exception 'Invalid profile category'; end if;
  if coalesce(p.draft->>'video','') <> '' and p.draft->>'video' !~ '^https://' then raise exception 'Highlights URL must use HTTPS'; end if;
  select coalesce(jsonb_object_agg(key,value), '{}') into snapshot from jsonb_each(p.draft)
  where key = any(array['name','sport','position','goal','major','university','graduation','school','gpa','academic','english','countries','club','bio','video']);
  if exists(select 1 from jsonb_each(snapshot) where jsonb_typeof(value) <> 'string' or length(value #>> '{}') > 2000) then raise exception 'Invalid profile field'; end if;
  -- Sample status is protected account data, not a player-editable draft field.
  snapshot := snapshot || jsonb_build_object('sample',coalesce((select a.is_sample from public.accounts a where a.id=p.owner_id),false));
  insert into public.published_profiles(id,data) values(p.id,snapshot)
  on conflict(id) do update set data=excluded.data, published_at=now();
end;
$$;

create function private.university_catalog() returns table(
  id uuid, name text, location text, programs text[], sports text[], athletic_level text,
  source_url text, source_name text, verification_status text, last_verified_at timestamptz, is_sample boolean
) language sql stable security definer set search_path = '' as $$
  select u.id,u.name,u.location,u.programs,u.sports,u.athletic_level,
    u.source_url,u.source_name,u.verification_status,u.last_verified_at,u.is_sample
  from public.universities u
  where auth.uid() is not null and (u.is_sample or u.verification_status in ('human-reviewed','verified'))
  order by u.name;
$$;

create table public.recruitment_interests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  coach_id uuid not null references public.accounts(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','declined','withdrawn')),
  coach_name text not null,
  student_name text not null,
  institution_name text not null default '',
  message text not null default '' check(length(message) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recruitment_interests_coach_student_unique unique(coach_id,student_id)
);
create index interests_student_created on public.recruitment_interests(student_id,created_at desc);
create trigger interests_updated before update on public.recruitment_interests for each row execute function private.touch_updated_at();

create table public.meeting_requests (
  id uuid primary key default gen_random_uuid(),
  interest_id uuid not null references public.recruitment_interests(id) on delete cascade,
  starts_at timestamptz not null,
  timezone text not null,
  duration_minutes integer not null default 30 check(duration_minutes between 15 and 180),
  status text not null default 'proposed' check(status in ('proposed','accepted','declined','reschedule_requested','cancelled')),
  proposed_by uuid not null references public.accounts(id) on delete cascade,
  response_by uuid references public.accounts(id) on delete set null,
  message text not null default '' check(length(message) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index meetings_interest_created on public.meeting_requests(interest_id,created_at desc);
create index meetings_proposed_by on public.meeting_requests(proposed_by);
create index meetings_response_by on public.meeting_requests(response_by);
create unique index meetings_one_active_per_interest on public.meeting_requests(interest_id) where status in ('proposed','accepted');
create trigger meetings_updated before update on public.meeting_requests for each row execute function private.touch_updated_at();

create function private.owns_student(student_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.student_profiles s where s.id=$1 and s.owner_id=(select auth.uid()));
$$;
create function private.can_read_interest(interest_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.recruitment_interests i join public.student_profiles s on s.id=i.student_id
    where i.id=$1 and (i.coach_id=(select auth.uid()) or s.owner_id=(select auth.uid()) or private.is_admin()));
$$;

create function private.express_interest(student_id uuid, message text default '') returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); candidate record; coach record; result uuid;
begin
  if actor is null or not private.is_coach() then raise exception 'Forbidden' using errcode='42501'; end if;
  if length(coalesce($2,'')) > 2000 then raise exception 'Message is too long'; end if;
  select s.owner_id,p.data into candidate from public.student_profiles s join public.published_profiles p on p.id=s.id
    where s.id=$1 for share of s,p;
  if not found or candidate.owner_id is null then raise exception 'Candidate is not available for recruiting'; end if;
  if candidate.owner_id=actor then raise exception 'Cannot express interest in your own profile'; end if;
  select left(coalesce(nullif(trim(a.display_name),''),nullif(trim(cp.data->>'name'),''),'Coach'),200) as name,
    left(coalesce(nullif(trim(u.name),''),nullif(trim(cp.data->>'institution'),''),''),200) as institution
    into coach from public.accounts a left join public.coach_profiles cp on cp.user_id=a.id
    left join public.universities u on u.id=cp.university_id and (u.is_sample or u.verification_status in ('human-reviewed','verified'))
    where a.id=actor;
  insert into public.recruitment_interests(student_id,coach_id,coach_name,student_name,institution_name,message)
    values($1,actor,coach.name,left(coalesce(nullif(trim(candidate.data->>'name'),''),'Student'),200),coach.institution,trim(coalesce($2,'')))
    on conflict on constraint recruitment_interests_coach_student_unique do nothing returning id into result;
  if result is null then select i.id into result from public.recruitment_interests i where i.coach_id=actor and i.student_id=$1; end if;
  return result;
end;
$$;

create function private.respond_to_interest(interest_id uuid, response text) returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); interest public.recruitment_interests; owner uuid;
begin
  if actor is null then raise exception 'Forbidden' using errcode='42501'; end if;
  if $2 is null or $2 not in ('accepted','declined','withdrawn') then raise exception 'Invalid interest response'; end if;
  select * into interest from public.recruitment_interests where id=$1 for update;
  if not found then raise exception 'Forbidden' using errcode='42501'; end if;
  select s.owner_id into owner from public.student_profiles s where s.id=interest.student_id;
  if $2 in ('accepted','declined') then
    if not coalesce(owner=actor,false) or not private.is_player() then raise exception 'Only the student can respond to this interest' using errcode='42501'; end if;
    if interest.status <> 'pending' then raise exception 'Interest is not pending'; end if;
  else
    if not (interest.coach_id=actor or coalesce(owner=actor,false) or private.is_admin()) then raise exception 'Forbidden' using errcode='42501'; end if;
    if interest.status not in ('pending','accepted') then raise exception 'Interest is already closed'; end if;
  end if;
  update public.recruitment_interests set status=$2 where id=$1;
  if $2='withdrawn' then
    update public.meeting_requests set status='cancelled',response_by=actor where meeting_requests.interest_id=$1 and status in ('proposed','accepted');
  end if;
end;
$$;

create function private.propose_meeting(interest_id uuid, starts_at timestamptz, timezone text, duration_minutes integer default 30, message text default '') returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); interest public.recruitment_interests; owner uuid; result uuid;
begin
  if actor is null or private.is_admin() then raise exception 'Forbidden' using errcode='42501'; end if;
  select * into interest from public.recruitment_interests where id=$1 for update;
  if not found then raise exception 'Forbidden' using errcode='42501'; end if;
  select s.owner_id into owner from public.student_profiles s where s.id=interest.student_id;
  if not ((interest.coach_id=actor and private.is_coach()) or (coalesce(owner=actor,false) and private.is_player())) then raise exception 'Forbidden' using errcode='42501'; end if;
  if interest.status <> 'accepted' then raise exception 'Interest must be accepted before scheduling'; end if;
  if $2 is null or not isfinite($2) or $2 <= now() then raise exception 'Meeting time must be in the future'; end if;
  if $3 is null or not exists(select 1 from pg_catalog.pg_timezone_names t where t.name=$3) then raise exception 'Invalid IANA timezone'; end if;
  if $4 is null or $4 not between 15 and 180 then raise exception 'Duration must be between 15 and 180 minutes'; end if;
  if length(coalesce($5,'')) > 2000 then raise exception 'Message is too long'; end if;
  if exists(select 1 from public.meeting_requests m where m.interest_id=$1 and m.status in ('proposed','accepted')) then raise exception 'An active meeting already exists'; end if;
  insert into public.meeting_requests(interest_id,starts_at,timezone,duration_minutes,proposed_by,message)
    values($1,$2,$3,$4,actor,trim(coalesce($5,''))) returning id into result;
  return result;
end;
$$;

create function private.respond_to_meeting(meeting_id uuid, response text) returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); interest_id_value uuid; interest public.recruitment_interests; meeting public.meeting_requests; owner uuid; is_participant boolean;
begin
  if actor is null then raise exception 'Forbidden' using errcode='42501'; end if;
  if $2 is null or $2 not in ('accepted','declined','reschedule_requested','cancelled') then raise exception 'Invalid meeting response'; end if;
  select m.interest_id into interest_id_value from public.meeting_requests m where m.id=$1;
  if not found then raise exception 'Forbidden' using errcode='42501'; end if;
  -- Every mutation locks the interest before its meetings to avoid lock inversion.
  select * into interest from public.recruitment_interests where id=interest_id_value for update;
  select * into meeting from public.meeting_requests where id=$1 for update;
  if not found then raise exception 'Forbidden' using errcode='42501'; end if;
  select s.owner_id into owner from public.student_profiles s where s.id=interest.student_id;
  is_participant := (interest.coach_id=actor and private.is_coach()) or (coalesce(owner=actor,false) and private.is_player());
  if private.is_admin() then
    if $2 <> 'cancelled' then raise exception 'Administrators may only cancel meetings' using errcode='42501'; end if;
  elsif not is_participant then raise exception 'Forbidden' using errcode='42501';
  end if;
  if meeting.status not in ('proposed','accepted') then raise exception 'Meeting is already closed'; end if;
  if $2 <> 'cancelled' and interest.status <> 'accepted' then raise exception 'Interest must be accepted before scheduling'; end if;
  if $2 in ('accepted','declined') then
    if meeting.proposed_by=actor then raise exception 'The proposer cannot respond to their own proposal'; end if;
    if meeting.status <> 'proposed' then raise exception 'Meeting is not awaiting a response'; end if;
  end if;
  if $2='reschedule_requested' and meeting.status='proposed' and meeting.proposed_by=actor then raise exception 'Cancel your proposal before proposing a replacement'; end if;
  if $2='accepted' and meeting.starts_at <= now() then raise exception 'Meeting time must be in the future'; end if;
  update public.meeting_requests set status=$2,response_by=actor where id=$1;
end;
$$;

alter table public.recruitment_interests enable row level security;
create policy interest_participant_read on public.recruitment_interests for select to authenticated
  using(coach_id=(select auth.uid()) or private.owns_student(student_id) or private.is_admin());
alter table public.meeting_requests enable row level security;
create policy meeting_participant_read on public.meeting_requests for select to authenticated
  using(private.can_read_interest(interest_id));
revoke all on public.recruitment_interests,public.meeting_requests from public,anon,authenticated;
grant select on public.recruitment_interests,public.meeting_requests to authenticated;

create function public.university_catalog() returns table(
  id uuid, name text, location text, programs text[], sports text[], athletic_level text,
  source_url text, source_name text, verification_status text, last_verified_at timestamptz, is_sample boolean
) language sql stable security invoker set search_path = '' as $$ select * from private.university_catalog(); $$;
create function public.express_interest(student_id uuid, message text default '') returns uuid language sql security invoker set search_path = '' as $$ select private.express_interest($1,$2); $$;
create function public.respond_to_interest(interest_id uuid, response text) returns void language sql security invoker set search_path = '' as $$ select private.respond_to_interest($1,$2); $$;
create function public.propose_meeting(interest_id uuid, starts_at timestamptz, timezone text, duration_minutes integer default 30, message text default '') returns uuid language sql security invoker set search_path = '' as $$ select private.propose_meeting($1,$2,$3,$4,$5); $$;
create function public.respond_to_meeting(meeting_id uuid, response text) returns void language sql security invoker set search_path = '' as $$ select private.respond_to_meeting($1,$2); $$;

revoke all on function private.university_catalog(),private.owns_student(uuid),private.can_read_interest(uuid),private.express_interest(uuid,text),private.respond_to_interest(uuid,text),private.propose_meeting(uuid,timestamptz,text,integer,text),private.respond_to_meeting(uuid,text) from public,anon,authenticated;
grant execute on function private.university_catalog(),private.owns_student(uuid),private.can_read_interest(uuid),private.express_interest(uuid,text),private.respond_to_interest(uuid,text),private.propose_meeting(uuid,timestamptz,text,integer,text),private.respond_to_meeting(uuid,text) to authenticated;
revoke all on function public.university_catalog(),public.express_interest(uuid,text),public.respond_to_interest(uuid,text),public.propose_meeting(uuid,timestamptz,text,integer,text),public.respond_to_meeting(uuid,text) from public,anon,authenticated;
grant execute on function public.university_catalog(),public.express_interest(uuid,text),public.respond_to_interest(uuid,text),public.propose_meeting(uuid,timestamptz,text,integer,text),public.respond_to_meeting(uuid,text) to authenticated;
commit;
