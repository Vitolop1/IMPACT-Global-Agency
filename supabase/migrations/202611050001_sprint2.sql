-- Sprint 2: private drafts, public snapshots, protected roles, staff-owned pipeline.
-- Apply to a dedicated IMPACT Supabase project, never an unrelated application.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'player' check (role in ('player','coach','admin')),
  created_at timestamptz not null default now()
);
create function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.accounts where id = (select auth.uid()) and role = 'admin');
$$;
create function private.is_player() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.accounts where id = (select auth.uid()) and role = 'player');
$$;
create function private.is_coach() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.accounts where id = (select auth.uid()) and role = 'coach');
$$;
revoke all on all functions in schema private from public;
grant execute on function private.is_admin(), private.is_player(), private.is_coach() to authenticated;

create table public.student_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid unique references public.accounts(id) on delete cascade,
  draft jsonb not null default '{}' check (jsonb_typeof(draft) = 'object' and octet_length(draft::text) <= 30000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.published_profiles (
  id uuid primary key references public.student_profiles(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  published_at timestamptz not null default now()
);
create index published_sport on public.published_profiles ((data->>'sport'));
create index published_graduation on public.published_profiles ((data->>'graduation'));
create table public.coach_profiles (
  user_id uuid primary key references public.accounts(id) on delete cascade,
  data jsonb not null default '{}' check (jsonb_typeof(data) = 'object' and octet_length(data::text) <= 10000),
  updated_at timestamptz not null default now()
);
create table public.coach_favorites (
  coach_id uuid not null references public.accounts(id) on delete cascade,
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coach_id, student_id)
);
create index coach_favorites_student on public.coach_favorites(student_id);
create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  account_id uuid unique references public.accounts(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 150),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.recruitment_cases (
  student_id uuid primary key references public.student_profiles(id) on delete cascade,
  status text not null default 'new' check (status in ('new','review','ready','contacted','opportunity','application','accepted','closed')),
  assigned_staff_id uuid references public.staff_members(id) on delete set null,
  notes text not null default '' check (length(notes) <= 10000),
  next_action_at date,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.accounts(id) on delete set null
);
create index cases_assigned_staff on public.recruitment_cases(assigned_staff_id);
create index cases_status_date on public.recruitment_cases(status, next_action_at);
create table public.recruitment_history (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  old_status text,
  new_status text not null,
  assigned_staff_id uuid references public.staff_members(id) on delete set null,
  notes text not null default '',
  next_action_at date,
  actor_id uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now()
);
create index history_student_date on public.recruitment_history(student_id, created_at desc);
create table public.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  location text not null default '',
  programs text[] not null default '{}',
  sports text[] not null default '{}',
  athletic_level text not null default '',
  website text,
  notes text not null default '',
  source_url text,
  source_name text,
  verification_status text not null default 'unverified' check (verification_status in ('unverified','ai-assisted','human-reviewed','verified')),
  last_verified_at timestamptz,
  verified_by uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.university_contacts (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  name text not null,
  role text not null default '',
  email text,
  phone text,
  notes text not null default '',
  source_url text,
  source_name text,
  verification_status text not null default 'unverified' check (verification_status in ('unverified','ai-assisted','human-reviewed','verified')),
  last_verified_at timestamptz,
  verified_by uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, university_id)
);
create index contacts_university on public.university_contacts(university_id);
create table public.recruitment_opportunities (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  university_id uuid not null references public.universities(id) on delete cascade,
  contact_id uuid,
  title text not null,
  notes text not null default '',
  due_at date,
  source_url text,
  source_name text,
  verification_status text not null default 'unverified' check (verification_status in ('unverified','ai-assisted','human-reviewed','verified')),
  last_verified_at timestamptz,
  verified_by uuid references public.accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (contact_id, university_id) references public.university_contacts(id, university_id)
);
create index opportunities_student on public.recruitment_opportunities(student_id);
create index opportunities_university on public.recruitment_opportunities(university_id);
create index opportunities_contact on public.recruitment_opportunities(contact_id, university_id);
-- Shared binary upload is intentionally not enabled in this sprint. Metadata is
-- private; external highlights links are part of the explicit published snapshot.
create table public.media_metadata (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profiles(id) on delete cascade,
  storage_path text unique,
  content_type text check (content_type in ('video/mp4','video/webm')),
  size_bytes bigint check (size_bytes between 1 and 52428800),
  created_at timestamptz not null default now()
);
create index media_student on public.media_metadata(student_id);

create function private.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create function private.create_case() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.recruitment_cases(student_id) values(new.id); return new; end;
$$;
create trigger student_create_case after insert on public.student_profiles for each row execute function private.create_case();
create function private.track_case() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.updated_by = auth.uid();
  new.updated_at = now();
  if TG_OP = 'INSERT' or row(new.status, new.assigned_staff_id, new.notes, new.next_action_at) is distinct from row(old.status, old.assigned_staff_id, old.notes, old.next_action_at) then
    insert into public.recruitment_history(student_id, old_status, new_status, assigned_staff_id, notes, next_action_at, actor_id)
    values(new.student_id, case when TG_OP = 'INSERT' then null else old.status end, new.status, new.assigned_staff_id, new.notes, new.next_action_at, auth.uid());
  end if;
  return new;
end;
$$;
create trigger case_history before insert or update on public.recruitment_cases for each row execute function private.track_case();
create function private.provenance() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  if new.source_url is not null and new.source_url !~ '^https://' then raise exception 'Source URL must use HTTPS'; end if;
  if new.verification_status in ('human-reviewed','verified') then
    if nullif(trim(new.source_url), '') is null or new.last_verified_at is null then raise exception 'Reviewed data requires a source URL and verification date'; end if;
    if new.last_verified_at > now() then raise exception 'Verification date cannot be in the future'; end if;
    new.verified_by = auth.uid();
  else new.verified_by = null; new.last_verified_at = null;
  end if;
  return new;
end;
$$;
create trigger university_provenance before insert or update on public.universities for each row execute function private.provenance();
create trigger contact_provenance before insert or update on public.university_contacts for each row execute function private.provenance();
create trigger opportunity_provenance before insert or update on public.recruitment_opportunities for each row execute function private.provenance();
create trigger student_updated before update on public.student_profiles for each row execute function private.touch_updated_at();
create trigger coach_updated before update on public.coach_profiles for each row execute function private.touch_updated_at();

create function private.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
declare account_role text;
begin
  -- Metadata may request a public role, but can NEVER grant administrator access.
  account_role := case when new.raw_user_meta_data->>'account_type' = 'coach' then 'coach' else 'player' end;
  insert into public.accounts(id, display_name, role) values(new.id, left(coalesce(new.raw_user_meta_data->>'name',''),100), account_role);
  if account_role = 'player' then
    insert into public.student_profiles(id, owner_id, draft) values(new.id, new.id, jsonb_build_object('name', left(coalesce(new.raw_user_meta_data->>'name',''),100)));
  else insert into public.coach_profiles(user_id) values(new.id);
  end if;
  return new;
end;
$$;
create trigger impact_new_user after insert on auth.users for each row execute function private.handle_new_user();

create function public.publish_profile(profile_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare p public.student_profiles; snapshot jsonb; required_key text;
begin
  select * into p from public.student_profiles where id = profile_id for update;
  if p.id is null or not (coalesce(p.owner_id = auth.uid(), false) or private.is_admin()) then raise exception 'Forbidden' using errcode='42501'; end if;
  foreach required_key in array array['name','sport','goal','graduation','academic','english','budget'] loop
    if nullif(trim(p.draft->>required_key), '') is null then raise exception 'Incomplete profile: %', required_key; end if;
  end loop;
  if (p.draft->>'graduation') !~ '^20[0-9]{2}$' and p.draft->>'graduation' <> '2100' then raise exception 'Invalid graduation year'; end if;
  if p.draft->>'goal' not in ('sports','academic','cultural','exchange') or p.draft->>'academic' not in ('secondary','transfer','graduate') or p.draft->>'english' not in ('basic','intermediate','advanced','tested') or p.draft->>'budget' not in ('budget10','budget20','budget30','budget45','discuss') then raise exception 'Invalid profile category'; end if;
  if coalesce(p.draft->>'video','') <> '' and p.draft->>'video' !~ '^https://' then raise exception 'Highlights URL must use HTTPS'; end if;
  -- Do not copy arbitrary JSON, contact data, budget, media paths, or staff fields.
  select coalesce(jsonb_object_agg(key,value), '{}') into snapshot from jsonb_each(p.draft)
  where key = any(array['name','sport','position','goal','major','university','graduation','school','gpa','academic','english','countries','club','bio','video']);
  if exists(select 1 from jsonb_each(snapshot) where jsonb_typeof(value) <> 'string' or length(value #>> '{}') > 2000) then raise exception 'Invalid profile field'; end if;
  insert into public.published_profiles(id,data) values(p.id,snapshot)
  on conflict(id) do update set data=excluded.data, published_at=now();
end;
$$;
create function public.withdraw_profile(profile_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.student_profiles where id=profile_id and (owner_id=auth.uid() or private.is_admin())) then raise exception 'Forbidden' using errcode='42501'; end if;
  delete from public.published_profiles where id=profile_id;
end;
$$;
create function public.suggested_universities() returns table(id uuid, name text, location text, source_url text, verification_status text, last_verified_at timestamptz) language sql stable security definer set search_path = '' as $$
  select distinct u.id,u.name,u.location,u.source_url,u.verification_status,u.last_verified_at
  from public.universities u join public.recruitment_opportunities o on o.university_id=u.id
  join public.student_profiles s on s.id=o.student_id
  where s.owner_id=auth.uid() and u.verification_status in ('human-reviewed','verified') and o.verification_status in ('human-reviewed','verified');
$$;
revoke all on function public.publish_profile(uuid), public.withdraw_profile(uuid), public.suggested_universities() from public;
grant execute on function public.publish_profile(uuid), public.withdraw_profile(uuid), public.suggested_universities() to authenticated;

alter table public.accounts enable row level security;
create policy account_read on public.accounts for select to authenticated using(id=(select auth.uid()) or private.is_admin());
alter table public.student_profiles enable row level security;
create policy student_read on public.student_profiles for select to authenticated using(owner_id=(select auth.uid()) or private.is_admin());
create policy student_insert on public.student_profiles for insert to authenticated with check(private.is_admin() or (owner_id=(select auth.uid()) and private.is_player()));
create policy student_update on public.student_profiles for update to authenticated using(owner_id=(select auth.uid()) or private.is_admin()) with check(private.is_admin() or (owner_id=(select auth.uid()) and private.is_player()));
alter table public.published_profiles enable row level security;
create policy published_read on public.published_profiles for select to anon, authenticated using(true);
alter table public.coach_profiles enable row level security;
create policy coach_read on public.coach_profiles for select to authenticated using(user_id=(select auth.uid()) or private.is_admin());
create policy coach_insert on public.coach_profiles for insert to authenticated with check(user_id=(select auth.uid()) and private.is_coach());
create policy coach_update on public.coach_profiles for update to authenticated using(user_id=(select auth.uid()) and private.is_coach()) with check(user_id=(select auth.uid()) and private.is_coach());
alter table public.coach_favorites enable row level security;
create policy favorites_read on public.coach_favorites for select to authenticated using(coach_id=(select auth.uid()) and exists(select 1 from public.published_profiles p where p.id=student_id));
create policy favorites_insert on public.coach_favorites for insert to authenticated with check(coach_id=(select auth.uid()) and private.is_coach() and exists(select 1 from public.published_profiles p where p.id=student_id));
create policy favorites_delete on public.coach_favorites for delete to authenticated using(coach_id=(select auth.uid()));
alter table public.media_metadata enable row level security;
create policy media_owner on public.media_metadata for all to authenticated using(private.is_admin() or exists(select 1 from public.student_profiles s where s.id=student_id and s.owner_id=(select auth.uid()))) with check(private.is_admin() or exists(select 1 from public.student_profiles s where s.id=student_id and s.owner_id=(select auth.uid())));

do $$ declare target text; begin
  foreach target in array array['staff_members','recruitment_cases','recruitment_history','universities','university_contacts','recruitment_opportunities'] loop
    execute format('alter table public.%I enable row level security', target);
    execute format('create policy admin_only on public.%I for all to authenticated using(private.is_admin()) with check(private.is_admin())', target);
  end loop;
end $$;
-- Explicit grants, independent of Supabase's default privileges.
revoke all on public.accounts, public.student_profiles, public.published_profiles, public.coach_profiles, public.coach_favorites, public.staff_members, public.recruitment_cases, public.recruitment_history, public.universities, public.university_contacts, public.recruitment_opportunities, public.media_metadata from anon, authenticated;
grant select on public.published_profiles to anon, authenticated;
grant select on public.accounts to authenticated;
grant select,insert,update on public.student_profiles, public.coach_profiles to authenticated;
grant select,insert,delete on public.coach_favorites to authenticated;
grant select,insert,update,delete on public.staff_members, public.universities, public.university_contacts, public.recruitment_opportunities, public.media_metadata to authenticated;
grant select,update on public.recruitment_cases to authenticated;
grant select on public.recruitment_history to authenticated;
-- Trigger functions are not APIs.
revoke all on function private.touch_updated_at(), private.create_case(), private.track_case(), private.provenance(), private.handle_new_user() from public, anon, authenticated;
commit;
