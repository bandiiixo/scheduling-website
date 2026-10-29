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
      and sa.access_level in ('manager', 'admin')
  );
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
      and sa.access_level = 'admin'
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
for select to authenticated using (true);
create policy ops_tracker_write on public.ops_tracker
for insert to authenticated with check (public.kng_schedule_can_manage() or created_by = auth.uid());

create policy ops_points_read on public.ops_points
for select to authenticated using (true);
create policy ops_points_write on public.ops_points
for insert to authenticated with check (public.kng_schedule_can_manage());

create policy ops_hungry_read on public.ops_hungry
for select to authenticated using (true);
create policy ops_hungry_write on public.ops_hungry
for all to authenticated using (public.kng_schedule_can_manage()) with check (public.kng_schedule_can_manage());

create policy ops_reductions_read on public.ops_reductions
for select to authenticated using (true);
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
for select to authenticated using (true);
create policy ops_prizes_write on public.ops_prizes
for all to authenticated using (public.kng_schedule_can_manage()) with check (public.kng_schedule_can_manage());

create policy ops_helpers_read on public.ops_helpers
for select to authenticated using (true);
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

-- Entertainment permission: managers/admins keep full access; Entertainment can manage
-- entertainment events and operations without becoming a full administrator.
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
      and sa.access_level in ('manager', 'admin', 'entertainment')
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
