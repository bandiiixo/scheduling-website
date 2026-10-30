-- =========================================================
-- KNG ENTERTAINMENT - FIXED MIGRATION PATCH
-- Run this instead of the previous migration
-- =========================================================

create extension if not exists pgcrypto;


-- =========================================================
-- 1. FIX PERMISSION FUNCTION
-- IMPORTANT:
-- Do NOT DROP kng_schedule_access_rank because existing
-- RLS policies depend on it.
-- =========================================================

create or replace function public.kng_schedule_access_rank()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case coalesce(
    (
      select sa.access_level
      from public.staff_access sa
      where sa.user_id = auth.uid()
        and sa.active = true
      limit 1
    ),
    'public'
  )
    when 'public' then 0
    when 'member' then 1
    when 'adm' then 2
    when 'manager' then 3
    when 'director' then 4
    when 'admin' then 4
    when 'entertainment' then 2
    else 0
  end;
$$;


create or replace function public.kng_schedule_can_manage()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.kng_schedule_access_rank() >= 2;
$$;


create or replace function public.kng_schedule_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.kng_schedule_access_rank() >= 3;
$$;


create or replace function public.kng_schedule_is_director()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.kng_schedule_access_rank() >= 4;
$$;


-- =========================================================
-- 2. FIX STAFF ACCESS HIERARCHY
-- =========================================================

alter table public.staff_access
drop constraint if exists staff_access_access_level_check;

update public.staff_access
set access_level = 'member'
where access_level = 'viewer';

update public.staff_access
set access_level = 'adm'
where access_level = 'entertainment';

update public.staff_access
set access_level = 'director'
where access_level = 'admin';

alter table public.staff_access
add constraint staff_access_access_level_check
check (
  access_level in ('member','adm','manager','director')
);


-- =========================================================
-- 3. EVENT HOST / RANDOMISER COLUMNS
-- =========================================================

alter table public.events
add column if not exists host_source text not null default 'existing';

alter table public.events
add column if not exists host_locked boolean not null default false;

alter table public.events
add column if not exists host_claimed_by uuid
references auth.users(id) on delete set null;

alter table public.events
add column if not exists host_claimed_discord text;

alter table public.events
add column if not exists host_claimed_name text;

alter table public.events
add column if not exists host_claimed_at timestamptz;

alter table public.events
add column if not exists updated_by uuid
references auth.users(id) on delete set null;


-- Clean up any invalid/old host source values
update public.events
set host_source = 'existing'
where host_source is null
   or host_source not in ('existing','random','manual','planned');


alter table public.events
drop constraint if exists events_host_source_check;

alter table public.events
add constraint events_host_source_check
check (
  host_source in ('existing','random','manual','planned')
);


-- =========================================================
-- 4. EVENT HOST CLAIM FUNCTION
-- A logged-in Discord staff member can claim an event slot.
-- =========================================================

create or replace function public.claim_event_host_slot(
  p_event_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_discord_id text;
  v_name text;
begin

  if auth.uid() is null then
    raise exception 'Sign in required.';
  end if;


  -- Get Discord ID from the logged-in Discord account
  select i.provider_id
  into v_discord_id
  from auth.identities i
  where i.user_id = auth.uid()
    and i.provider = 'discord'
  order by i.created_at desc
  limit 1;


  v_discord_id := nullif(trim(coalesce(v_discord_id, '')), '');


  if v_discord_id is null then
    raise exception 'No Discord account is linked to this login.';
  end if;


  -- Find the matching KNG staff member
  select s.name
  into v_name
  from public.staff s
  where s.discord_id = v_discord_id
    and s.active = true
  limit 1;


  if v_name is null then
    v_name := 'Staff';
  end if;


  -- Claim only if nobody has claimed it yet
  update public.events
  set
    host_claimed_by = auth.uid(),
    host_claimed_discord = v_discord_id,
    host_claimed_name = left(v_name, 120),
    host_claimed_at = now(),
    updated_by = auth.uid()
  where id = p_event_id
    and status = 'scheduled'
    and host_claimed_by is null;


  if not found then
    return false;
  end if;


  return true;

end;
$$;


grant execute on function public.claim_event_host_slot(uuid)
to authenticated;


-- =========================================================
-- 5. PRIZE CATALOGUE
-- =========================================================

alter table public.ops_prizes
add column if not exists command_template text
not null
default '!additem {discord_id} {code} {amount} {reason}';


-- Make sure the three actual prizes exist
insert into public.ops_prizes
(
  label,
  code,
  amount,
  command_template,
  active
)
values
(
  'Dirty Money',
  'dinheirosujo',
  500000,
  '!additem {discord_id} {code} {amount} {reason}',
  true
),
(
  'Dollars',
  'dollars',
  500000,
  '!additem {discord_id} {code} {amount} {reason}',
  true
),
(
  'Event VIP',
  'vipevento1',
  1,
  '!additem {discord_id} {code} {amount} {reason}',
  true
)
on conflict (code)
do update set
  label = excluded.label,
  amount = excluded.amount,
  command_template = excluded.command_template,
  active = true;


-- =========================================================
-- 6. PRIZE WIN HISTORY
-- THIS FIXES:
-- "Could not find the 'reason' column of 'ops_prize_wins'"
-- =========================================================

alter table public.ops_prize_wins
add column if not exists reason text
not null
default 'Event Winner';

alter table public.ops_prize_wins
add column if not exists completed boolean
not null
default false;

alter table public.ops_prize_wins
add column if not exists completed_at timestamptz;

alter table public.ops_prize_wins
add column if not exists completed_by uuid
references auth.users(id) on delete set null;


-- =========================================================
-- 7. PRIZE WIN INDEXES
-- =========================================================

create index if not exists ops_prize_wins_created_idx
on public.ops_prize_wins(created_at desc);

create index if not exists ops_prize_wins_discord_idx
on public.ops_prize_wins(discord_id);

create index if not exists ops_prize_wins_completed_idx
on public.ops_prize_wins(completed, created_at desc);


-- =========================================================
-- 8. RLS FOR PRIZE WINS
-- =========================================================

alter table public.ops_prize_wins
enable row level security;

drop policy if exists ops_prize_wins_read
on public.ops_prize_wins;

drop policy if exists ops_prize_wins_write
on public.ops_prize_wins;


create policy ops_prize_wins_read
on public.ops_prize_wins
for select
to authenticated
using (
  public.kng_schedule_can_manage()
);


create policy ops_prize_wins_write
on public.ops_prize_wins
for all
to authenticated
using (
  public.kng_schedule_can_manage()
)
with check (
  public.kng_schedule_can_manage()
);


-- =========================================================
-- 9. EVENTS/RANDOMISER COLUMNS
-- =========================================================

alter table public.events
add column if not exists visibility text
not null
default 'public';

alter table public.events
add column if not exists recurrence_group_id uuid;

alter table public.events
add column if not exists recurrence_rule text;

alter table public.events
add column if not exists status text
not null
default 'scheduled';

alter table public.events
add column if not exists is_meeting boolean
not null
default false;

alter table public.events
add column if not exists attendance_count integer;

alter table public.events
add column if not exists winner_name text;

alter table public.events
add column if not exists completion_notes text;

alter table public.events
add column if not exists completed_at timestamptz;

alter table public.events
add column if not exists completed_by uuid
references auth.users(id) on delete set null;


-- =========================================================
-- 10. EVENT CONSTRAINTS
-- =========================================================

update public.events
set visibility = 'public'
where visibility is null
   or visibility not in ('public','staff');

update public.events
set status = 'scheduled'
where status is null
   or status not in ('scheduled','completed','cancelled');


alter table public.events
drop constraint if exists events_visibility_check;

alter table public.events
add constraint events_visibility_check
check (
  visibility in ('public','staff')
);


alter table public.events
drop constraint if exists events_status_check;

alter table public.events
add constraint events_status_check
check (
  status in ('scheduled','completed','cancelled')
);


alter table public.events
drop constraint if exists events_attendance_check;

alter table public.events
add constraint events_attendance_check
check (
  attendance_count is null
  or attendance_count >= 0
);


-- =========================================================
-- 11. EVENT INDEXES
-- =========================================================

create index if not exists events_visibility_idx
on public.events(visibility);

create index if not exists events_recurrence_group_idx
on public.events(recurrence_group_id);

create index if not exists events_status_idx
on public.events(status, event_date);

create index if not exists events_host_locked_idx
on public.events(host_locked, event_date, start_time);

create index if not exists events_host_claimed_idx
on public.events(host_claimed_by);


-- =========================================================
-- 12. RELOAD SUPABASE SCHEMA
-- =========================================================

notify pgrst, 'reload schema';
