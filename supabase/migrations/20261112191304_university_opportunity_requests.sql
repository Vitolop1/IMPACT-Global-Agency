begin;

create table public.university_opportunity_requests (
  id uuid primary key default gen_random_uuid(),
  student_account_id uuid not null references public.accounts(id) on delete cascade,
  university_id uuid references public.universities(id) on delete set null,
  student_name text not null,
  university_name text not null,
  is_sample boolean not null,
  kind text not null check (kind in ('tryout','academic')),
  message text not null default '' check (length(message) <= 1000),
  status text not null default 'pending' check (status in ('pending','reviewing','closed','withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index university_requests_student_created on public.university_opportunity_requests(student_account_id,created_at desc);
create index university_requests_university on public.university_opportunity_requests(university_id);
create unique index university_requests_active on public.university_opportunity_requests(student_account_id,university_id,kind)
  where status in ('pending','reviewing');
create trigger university_requests_updated before update on public.university_opportunity_requests
  for each row execute function private.touch_updated_at();

alter table public.university_opportunity_requests enable row level security;
revoke all on public.university_opportunity_requests from public,anon,authenticated;
grant select on public.university_opportunity_requests to authenticated;
create policy university_request_student_or_staff on public.university_opportunity_requests for select to authenticated
  using (student_account_id=(select auth.uid()) or (select private.is_admin()));

create function private.submit_university_request(university_id uuid, kind text, message text default '') returns uuid
  language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); target public.universities; student public.accounts; result uuid;
begin
  if actor is null or not private.is_player() then raise exception 'Forbidden' using errcode='42501'; end if;
  if $2 is null or $2 not in ('tryout','academic') or length(coalesce($3,'')) > 1000 then
    raise exception 'Invalid university request' using errcode='22023';
  end if;
  select * into student from public.accounts a where a.id=actor;
  select * into target from public.universities u where u.id=$1
    and ((u.is_sample and student.is_sample) or (not u.is_sample and u.verification_status in ('human-reviewed','verified')))
    for share;
  if not found then raise exception 'Institution not available' using errcode='22023'; end if;
  insert into public.university_opportunity_requests(student_account_id,university_id,student_name,university_name,is_sample,kind,message)
    values(actor,target.id,student.display_name,target.name,student.is_sample or target.is_sample,$2,trim(coalesce($3,'')))
    returning id into result;
  return result;
end;
$$;

create function private.update_university_request(request_id uuid, next_status text) returns void
  language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); staff boolean := private.is_admin();
begin
  if actor is null or $2 is null
    or ($2='withdrawn' and not private.is_player())
    or ($2 in ('reviewing','closed') and not staff)
    or $2 not in ('reviewing','closed','withdrawn') then
    raise exception 'Forbidden' using errcode='42501';
  end if;
  update public.university_opportunity_requests r set status=$2
    where r.id=$1
      and (($2='withdrawn' and r.student_account_id=actor and r.status in ('pending','reviewing'))
        or ($2='reviewing' and staff and r.status='pending')
        or ($2='closed' and staff and r.status in ('pending','reviewing')));
  if not found then raise exception 'Request unavailable or already updated' using errcode='42501'; end if;
end;
$$;

create function public.submit_university_request(university_id uuid, kind text, message text default '') returns uuid
  language sql security invoker set search_path = '' as $$
  select private.submit_university_request($1,$2,$3);
$$;
create function public.update_university_request(request_id uuid, next_status text) returns void
  language sql security invoker set search_path = '' as $$
  select private.update_university_request($1,$2);
$$;

revoke all on function private.submit_university_request(uuid,text,text),private.update_university_request(uuid,text),
  public.submit_university_request(uuid,text,text),public.update_university_request(uuid,text) from public,anon,authenticated;
grant execute on function private.submit_university_request(uuid,text,text),private.update_university_request(uuid,text),
  public.submit_university_request(uuid,text,text),public.update_university_request(uuid,text) to authenticated;

commit;
