-- KNG Schedule: integrated operations layer
-- Run this AFTER the existing KNG Schedule schema.
-- It adds the useful operational concepts identified from the public frontend:
-- tracker, points, hungry pool, reductions, audit/security, prizes and helpers.

create extension if not exists pgcrypto;

create table if not exists public.ops_tracker (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references public.staff(id) on delete set null,
  team text not null,
  activity_type text not null,
  status text not null default 'Logged',
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_points (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  amount integer not null check (amount between -25 and 25),
  reason text not null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_hungry (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  event_time time,
  title text not null,
  department text,
  notes text,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_reductions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.staff(id) on delete cascade,
  amount integer not null check (amount > 0),
  reason text not null,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_name text,
  action text not null,
  target_type text,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_security (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_name text,
  event_type text not null,
  severity text not null default 'info',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_prizes (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  code text not null unique,
  amount integer not null check (amount > 0),
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_helpers (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  staff_id uuid not null references public.staff(id) on delete cascade,
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique(event_id, staff_id)
);

create index if not exists ops_tracker_created_idx on public.ops_tracker(created_at desc);
create index if not exists ops_tracker_team_idx on public.ops_tracker(team);
create index if not exists ops_points_staff_idx on public.ops_points(staff_id, created_at desc);
create index if not exists ops_hungry_date_idx on public.ops_hungry(event_date, event_time);
create index if not exists ops_reductions_staff_idx on public.ops_reductions(staff_id, created_at desc);
create index if not exists ops_audit_created_idx on public.ops_audit(created_at desc);
create index if not exists ops_security_created_idx on public.ops_security(created_at desc);
create index if not exists ops_helpers_event_idx on public.ops_helpers(event_id);

-- Permission helpers use the existing KNG Schedule staff_access table.
create or replace function public.kng_schedule_can_manage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_access sa
    where sa.user_id = auth.uid()
      and sa.active = true
      and sa.access_level in ('adm', 'manager', 'director')
  );
$$;

create or replace function public.kng_schedule_access_rank()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case coalesce((select sa.access_level from public.staff_access sa where sa.user_id = auth.uid() and sa.active = true limit 1), 'member')
    when 'public' then 0
    when 'member' then 1
    when 'adm' then 2
    when 'manager' then 3
    when 'director' then 4
    else 0
  end;
$$;

create or replace function public.kng_schedule_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_access sa
    where sa.user_id = auth.uid()
      and sa.active = true
      and sa.access_level in ('manager', 'director')
  );
$$;

alter table public.ops_tracker enable row level security;
alter table public.ops_points enable row level security;
alter table public.ops_hungry enable row level security;
alter table public.ops_reductions enable row level security;
alter table public.ops_audit enable row level security;
alter table public.ops_security enable row level security;
alter table public.ops_prizes enable row level security;
alter table public.ops_helpers enable row level security;

-- Re-runnable policies.
drop policy if exists ops_tracker_read on public.ops_tracker;
drop policy if exists ops_tracker_write on public.ops_tracker;
drop policy if exists ops_points_read on public.ops_points;
drop policy if exists ops_points_write on public.ops_points;
drop policy if exists ops_hungry_read on public.ops_hungry;
drop policy if exists ops_hungry_write on public.ops_hungry;
drop policy if exists ops_reductions_read on public.ops_reductions;
drop policy if exists ops_reductions_write on public.ops_reductions;
drop policy if exists ops_audit_read on public.ops_audit;
drop policy if exists ops_audit_insert on public.ops_audit;
drop policy if exists ops_security_read on public.ops_security;
drop policy if exists ops_security_write on public.ops_security;
drop policy if exists ops_prizes_read on public.ops_prizes;
drop policy if exists ops_prizes_write on public.ops_prizes;
drop policy if exists ops_helpers_read on public.ops_helpers;
drop policy if exists ops_helpers_write on public.ops_helpers;

create policy ops_tracker_read on public.ops_tracker
for select to authenticated using (public.kng_schedule_can_manage());
create policy ops_tracker_write on public.ops_tracker
for insert to authenticated with check (public.kng_schedule_can_manage() or created_by = auth.uid());

create policy ops_points_read on public.ops_points
for select to authenticated using (public.kng_schedule_can_manage());
create policy ops_points_write on public.ops_points
for insert to authenticated with check (public.kng_schedule_can_manage());

create policy ops_hungry_read on public.ops_hungry
for select to authenticated using (public.kng_schedule_can_manage());
create policy ops_hungry_write on public.ops_hungry
for all to authenticated using (public.kng_schedule_can_manage()) with check (public.kng_schedule_can_manage());

create policy ops_reductions_read on public.ops_reductions
for select to authenticated using (public.kng_schedule_can_manage());
create policy ops_reductions_write on public.ops_reductions
for all to authenticated using (public.kng_schedule_can_manage()) with check (public.kng_schedule_can_manage());

create policy ops_audit_read on public.ops_audit
for select to authenticated using (public.kng_schedule_can_manage());
create policy ops_audit_insert on public.ops_audit
for insert to authenticated with check (actor_id = auth.uid());

create policy ops_security_read on public.ops_security
for select to authenticated using (public.kng_schedule_can_manage());
create policy ops_security_write on public.ops_security
for insert to authenticated with check (public.kng_schedule_is_admin());

create policy ops_prizes_read on public.ops_prizes
for select to authenticated using (public.kng_schedule_can_manage());
create policy ops_prizes_write on public.ops_prizes
for all to authenticated using (public.kng_schedule_can_manage()) with check (public.kng_schedule_can_manage());

create policy ops_helpers_read on public.ops_helpers
for select to authenticated using (public.kng_schedule_can_manage());
create policy ops_helpers_write on public.ops_helpers
for all to authenticated using (public.kng_schedule_can_manage()) with check (public.kng_schedule_can_manage());

-- Starter prize examples are deliberately omitted. The source frontend exposed
-- a configurable catalogue rather than a fixed set of rewards.

-- =========================================================
-- KNG ENTERTAINMENT additions
-- =========================================================

alter table public.events add column if not exists visibility text not null default 'public' check (visibility in ('public','staff'));
alter table public.events add column if not exists recurrence_group_id uuid;
alter table public.events add column if not exists recurrence_rule text;
alter table public.events add column if not exists status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled'));
create index if not exists events_visibility_idx on public.events(visibility);
create index if not exists events_recurrence_group_idx on public.events(recurrence_group_id);

create table if not exists public.ops_prize_wins (
  id uuid primary key default gen_random_uuid(),
  prize_id uuid not null references public.ops_prizes(id) on delete restrict,
  recipient_name text not null,
  discord_id text not null,
  amount integer not null default 1,
  command text not null,
  won_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists ops_prize_wins_created_idx on public.ops_prize_wins(created_at desc);
create index if not exists ops_prize_wins_recipient_idx on public.ops_prize_wins(discord_id);

alter table public.ops_prizes add column if not exists command_template text not null default '/giveitem {discord_id} {code} {amount}';

create table if not exists public.ops_timeouts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  expires_at timestamptz not null,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists ops_timeouts_email_idx on public.ops_timeouts(email, expires_at desc);

create table if not exists public.ops_access_blocks (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  reason text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists ops_access_blocks_active_idx on public.ops_access_blocks(email, active);

alter table public.ops_prize_wins enable row level security;
alter table public.ops_timeouts enable row level security;
alter table public.ops_access_blocks enable row level security;

drop policy if exists ops_prize_wins_read on public.ops_prize_wins;
drop policy if exists ops_prize_wins_write on public.ops_prize_wins;
drop policy if exists ops_timeouts_read on public.ops_timeouts;
drop policy if exists ops_timeouts_write on public.ops_timeouts;
drop policy if exists ops_access_blocks_read on public.ops_access_blocks;
drop policy if exists ops_access_blocks_write on public.ops_access_blocks;

create policy ops_prize_wins_read on public.ops_prize_wins
for select to authenticated using (public.kng_schedule_can_manage());
create policy ops_prize_wins_write on public.ops_prize_wins
for all to authenticated using (public.kng_schedule_can_manage()) with check (public.kng_schedule_can_manage());

create policy ops_timeouts_read on public.ops_timeouts
for select to authenticated using (public.kng_schedule_can_manage() or lower(email) = lower(auth.jwt()->>'email'));
create policy ops_timeouts_write on public.ops_timeouts
for all to authenticated using (public.kng_schedule_can_manage()) with check (public.kng_schedule_can_manage());

create policy ops_access_blocks_read on public.ops_access_blocks
for select to authenticated using (public.kng_schedule_can_manage() or lower(email) = lower(auth.jwt()->>'email'));
create policy ops_access_blocks_write on public.ops_access_blocks
for all to authenticated using (public.kng_schedule_can_manage()) with check (public.kng_schedule_can_manage());

-- Five permission layers: public -> member -> adm -> manager -> director.
-- ADM can manage KNG Entertainment operations; Manager and Director inherit all lower permissions.
create or replace function public.kng_schedule_can_manage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_access sa
    where sa.user_id = auth.uid()
      and sa.active = true
      and sa.access_level in ('adm', 'manager', 'director')
  );
$$;

-- Useful starter event types. Existing rows with the same name are left untouched.
insert into public.event_types (name, colour, description)
select 'Party', '#d61f3a', 'KNG Party event'
where not exists (select 1 from public.event_types where lower(name) = 'party');

insert into public.event_types (name, colour, description)
select 'Event', '#ef334f', 'General KNG entertainment event'
where not exists (select 1 from public.event_types where lower(name) = 'event');

insert into public.event_types (name, colour, description)
select 'Battle Royale', '#9b2c5e', 'Battle Royale event'
where not exists (select 1 from public.event_types where lower(name) = 'battle royale');

insert into public.event_types (name, colour, description)
select 'Community Meeting', '#6d28d9', 'Recurring community meeting'
where not exists (select 1 from public.event_types where lower(name) = 'community meeting');

-- Starter recurring Community Meeting: every 2 weeks, staff-only.
-- This creates 13 fortnightly meetings from the next Monday after migration.
-- If your database already has a Community Meeting, no duplicate starter is added.
do $$
declare
  type_id uuid;
  group_id uuid := gen_random_uuid();
  d date;
  until_date date := current_date + interval '180 days';
begin
  select id into type_id from public.event_types where lower(name) = 'community meeting' limit 1;
  if type_id is not null and not exists (
    select 1 from public.events where lower(title) = 'community meeting' and recurrence_rule = 'biweekly'
  ) then
    d := current_date + ((8 - extract(isodow from current_date)::int) % 7);
    while d <= until_date::date loop
      insert into public.events (title,event_type_id,event_date,start_time,end_time,visibility,recurrence_group_id,recurrence_rule,description,staff_required)
      values ('Community Meeting',type_id,d,'19:00','20:00','staff',group_id,'biweekly','KNG Entertainment Community Meeting',0);
      d := d + 14;
    end loop;
  end if;
end $$;

-- Migrate the previous KNG Entertainment role names into the new hierarchy.
update public.staff_access set access_level = 'adm' where access_level = 'entertainment';
update public.staff_access set access_level = 'manager' where access_level = 'admin';

-- =========================================================
-- DISCORD AUTH + STAFF ACCESS CONFIRMATION
-- =========================================================
-- Discord handles authentication. This layer handles authorisation:
-- a Discord account can sign in, but it does not become staff until
-- an existing ADM, Manager or Director confirms the access request.

create table if not exists public.staff_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  discord_id text not null,
  discord_username text,
  requested_name text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_access_level text not null default 'adm',
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists staff_access_requests_status_idx on public.staff_access_requests(status, created_at desc);
create index if not exists staff_access_requests_discord_idx on public.staff_access_requests(discord_id);
create unique index if not exists staff_access_requests_one_pending_idx
  on public.staff_access_requests(user_id) where status = 'pending';

alter table public.staff_access_requests enable row level security;

drop policy if exists staff_access_requests_select on public.staff_access_requests;
drop policy if exists staff_access_requests_insert on public.staff_access_requests;

create policy staff_access_requests_select on public.staff_access_requests
for select to authenticated
using (user_id = auth.uid() or public.kng_schedule_can_manage());

create policy staff_access_requests_insert on public.staff_access_requests
for insert to authenticated
with check (user_id = auth.uid() and status = 'pending');

create or replace function public.request_staff_access(p_requested_access_level text default 'member')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  identity_row record;
  staff_row record;
  request_id uuid;
  discord_name text;
  current_rank integer;
  requested_rank integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  p_requested_access_level := lower(coalesce(trim(p_requested_access_level), 'member'));
  if p_requested_access_level not in ('member','adm','manager','director') then
    raise exception 'Invalid requested access level.';
  end if;

  current_rank := public.kng_schedule_access_rank();
  requested_rank := case p_requested_access_level when 'member' then 1 when 'adm' then 2 when 'manager' then 3 when 'director' then 4 else 99 end;
  if requested_rank <= current_rank then
    raise exception 'You can only request the next permission level.';
  end if;
  if requested_rank > current_rank + 1 then
    raise exception 'Permission levels must be approved in order: Member → ADM → Manager → Director.';
  end if;
  if requested_rank = 4 then
    raise exception 'Director access is assigned directly by an existing Director.';
  end if;

  select i.provider_id, i.identity_data
    into identity_row
  from auth.identities i
  where i.user_id = auth.uid()
    and i.provider = 'discord'
  order by i.created_at desc
  limit 1;

  if identity_row.provider_id is null then
    raise exception 'Discord sign-in is required for staff access.';
  end if;

  discord_name := coalesce(
    identity_row.identity_data->>'global_name',
    identity_row.identity_data->>'username',
    'Discord user'
  );

  select s.id, s.name
    into staff_row
  from public.staff s
  where s.discord_id = identity_row.provider_id
    and s.active = true
  limit 1;

  insert into public.staff_access_requests
    (user_id, discord_id, discord_username, requested_name, status, requested_access_level)
  values
    (auth.uid(), identity_row.provider_id, discord_name, coalesce(staff_row.name, discord_name), 'pending', p_requested_access_level)
  returning id into request_id;

  return request_id;
exception
  when unique_violation then
    select id into request_id
    from public.staff_access_requests
    where user_id = auth.uid() and status = 'pending'
    order by created_at desc limit 1;
    return request_id;
end;
$$;

create or replace function public.approve_staff_access_request(p_request_id uuid, p_access_level text default 'adm')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  req record;
  updated_count integer;
begin
  if not public.kng_schedule_can_manage() then
    raise exception 'You do not have permission to approve staff access.';
  end if;

  if p_access_level not in ('member','adm','manager') then
    raise exception 'Only Member, ADM or Manager access can be confirmed through the approval chain.';
  end if;

  if public.kng_schedule_access_rank() < case p_access_level
      when 'member' then 2
      when 'adm' then 3
      when 'manager' then 4
      else 99
    end then
    raise exception 'Security chain: ADM confirms Members; Manager confirms Members and ADMs; Director confirms Members, ADMs and Managers.';
  end if;

  select * into req
  from public.staff_access_requests
  where id = p_request_id
  for update;

  if req.id is null then
    raise exception 'Access request not found.';
  end if;

  if req.status <> 'pending' then
    raise exception 'This access request has already been decided.';
  end if;

  if coalesce(req.requested_access_level, 'member') <> p_access_level then
    raise exception 'The approval level does not match the requested permission level.';
  end if;

  update public.staff_access
     set access_level = p_access_level, active = true
   where user_id = req.user_id;
  get diagnostics updated_count = row_count;

  if updated_count = 0 then
    insert into public.staff_access (user_id, access_level, active)
    values (req.user_id, p_access_level, true);
  end if;

  update public.staff_access_requests
     set status = 'approved', requested_access_level = p_access_level,
         review_note = 'Access confirmed by staff.', reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_request_id;

  return true;
end;
$$;

create or replace function public.reject_staff_access_request(p_request_id uuid, p_reason text default 'Access not approved')
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.kng_schedule_can_manage() then
    raise exception 'You do not have permission to reject staff access.';
  end if;

  update public.staff_access_requests
     set status = 'rejected', review_note = coalesce(nullif(trim(p_reason), ''), 'Access not approved'),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_request_id;

  if not found then
    raise exception 'Access request not found.';
  end if;

  return true;
end;
$$;

grant execute on function public.kng_schedule_access_rank() to authenticated;
grant execute on function public.request_staff_access() to authenticated;
grant execute on function public.approve_staff_access_request(uuid,text) to authenticated;
grant execute on function public.reject_staff_access_request(uuid,text) to authenticated;
