-- KNG ENTERTAINMENT FINAL INTEGRATION / REPAIR MIGRATION
-- Run AFTER the existing KNG Schedule schema and the previously installed operations SQL.
-- This script is rerunnable. It repairs the permission helpers, RLS, Hungry Pool,
-- event visibility/meetings, Interactions tables, and Hall of Fame storage.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- Permission hierarchy
-- PUBLIC 0 -> MEMBER 1 -> ADM 2 -> MANAGER 3 -> DIRECTOR 4
-- ---------------------------------------------------------
create or replace function public.kng_schedule_access_rank()
returns integer
language sql stable security definer
set search_path = public
as $$
  select case coalesce((select sa.access_level from public.staff_access sa where sa.user_id = auth.uid() and sa.active = true limit 1), 'public')
    when 'public' then 0
    when 'member' then 1
    when 'adm' then 2
    when 'manager' then 3
    when 'director' then 4
    else 0
  end;
$$;

create or replace function public.kng_schedule_can_manage()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.kng_schedule_access_rank() >= 2;
$$;

create or replace function public.kng_schedule_is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.kng_schedule_access_rank() >= 3;
$$;

grant execute on function public.kng_schedule_access_rank() to authenticated;
grant execute on function public.kng_schedule_can_manage() to authenticated;
grant execute on function public.kng_schedule_is_admin() to authenticated;

-- ---------------------------------------------------------
-- Event model / event types
-- ---------------------------------------------------------
alter table public.events add column if not exists visibility text not null default 'public';
alter table public.events add column if not exists recurrence_group_id uuid;
alter table public.events add column if not exists recurrence_rule text;
alter table public.events add column if not exists status text not null default 'scheduled';
alter table public.events add column if not exists is_meeting boolean not null default false;

update public.event_types set name = 'Party' where lower(name) = 'f3';
update public.event_types set name = 'Battle Royale' where lower(name) = 'br';
update public.event_types set name = 'Community Meeting' where lower(name) = 'meeting';

insert into public.event_types (name, colour, description)
select 'Party', '#ff2d78', 'KNG Entertainment party'
where not exists (select 1 from public.event_types where lower(name) = 'party');

insert into public.event_types (name, colour, description)
select 'Event', '#ff2d5b', 'General KNG Entertainment event'
where not exists (select 1 from public.event_types where lower(name) = 'event');

insert into public.event_types (name, colour, description)
select 'Battle Royale', '#7c3aed', 'Battle Royale entertainment event'
where not exists (select 1 from public.event_types where lower(name) = 'battle royale');

insert into public.event_types (name, colour, description)
select 'Community Meeting', '#2563eb', 'Community meeting; not counted as an entertainment event'
where not exists (select 1 from public.event_types where lower(name) = 'community meeting');

insert into public.event_types (name, colour, description)
select 'Staff Meeting', '#10b981', 'Staff meeting; not counted as an entertainment event'
where not exists (select 1 from public.event_types where lower(name) = 'staff meeting');

update public.events e
set is_meeting = true, visibility = 'staff'
where e.event_type_id in (select id from public.event_types where lower(name) in ('community meeting','staff meeting'));

-- Secure event visibility: public players see only public events; staff see staff events.
alter table public.events enable row level security;
drop policy if exists "Anyone can view events" on public.events;
drop policy if exists "Managers can create events" on public.events;
drop policy if exists "Managers can update events" on public.events;
drop policy if exists "Managers can delete events" on public.events;
drop policy if exists kng_events_select on public.events;
drop policy if exists kng_events_insert on public.events;
drop policy if exists kng_events_update on public.events;
drop policy if exists kng_events_delete on public.events;

create policy kng_events_select on public.events
for select using (
  coalesce(visibility,'public') <> 'staff'
  or public.kng_schedule_access_rank() >= 1
);

create policy kng_events_insert on public.events
for insert to authenticated
with check (public.kng_schedule_can_manage());

create policy kng_events_update on public.events
for update to authenticated
using (public.kng_schedule_can_manage())
with check (public.kng_schedule_can_manage());

create policy kng_events_delete on public.events
for delete to authenticated
using (public.kng_schedule_can_manage());

-- Event allocations follow the event visibility rule.
alter table public.event_staff enable row level security;
drop policy if exists "Anyone can view event allocations" on public.event_staff;
drop policy if exists "Managers can allocate staff" on public.event_staff;
drop policy if exists "Managers can change allocations" on public.event_staff;
drop policy if exists "Managers can remove allocations" on public.event_staff;
drop policy if exists kng_event_staff_select on public.event_staff;
drop policy if exists kng_event_staff_insert on public.event_staff;
drop policy if exists kng_event_staff_update on public.event_staff;
drop policy if exists kng_event_staff_delete on public.event_staff;

create policy kng_event_staff_select on public.event_staff
for select using (
  exists (select 1 from public.events e where e.id = event_staff.event_id and (coalesce(e.visibility,'public') <> 'staff' or public.kng_schedule_access_rank() >= 1))
);
create policy kng_event_staff_insert on public.event_staff
for insert to authenticated with check (public.kng_schedule_can_manage());
create policy kng_event_staff_update on public.event_staff
for update to authenticated using (public.kng_schedule_can_manage()) with check (public.kng_schedule_can_manage());
create policy kng_event_staff_delete on public.event_staff
for delete to authenticated using (public.kng_schedule_can_manage());

-- ---------------------------------------------------------
-- Hungry Pool: manager/director create, staff claim, staff manually complete.
-- Never auto-completes.
-- ---------------------------------------------------------
alter table public.ops_hungry add column if not exists status text not null default 'open';
alter table public.ops_hungry add column if not exists claimed_by uuid references auth.users(id) on delete set null;
alter table public.ops_hungry add column if not exists claimed_by_name text;
alter table public.ops_hungry add column if not exists claimed_at timestamptz;
alter table public.ops_hungry add column if not exists completed_by uuid references auth.users(id) on delete set null;
alter table public.ops_hungry add column if not exists completed_by_name text;
alter table public.ops_hungry add column if not exists completed_at timestamptz;

update public.ops_hungry set status='open' where status is null or status='';

alter table public.ops_hungry enable row level security;
drop policy if exists ops_hungry_read on public.ops_hungry;
drop policy if exists ops_hungry_write on public.ops_hungry;
drop policy if exists kng_hungry_select on public.ops_hungry;
drop policy if exists kng_hungry_insert on public.ops_hungry;
drop policy if exists kng_hungry_update on public.ops_hungry;
drop policy if exists kng_hungry_delete on public.ops_hungry;

create policy kng_hungry_select on public.ops_hungry
for select to authenticated using (public.kng_schedule_access_rank() >= 1);
create policy kng_hungry_insert on public.ops_hungry
for insert to authenticated with check (public.kng_schedule_can_manage());
create policy kng_hungry_update on public.ops_hungry
for update to authenticated using (public.kng_schedule_can_manage() or claimed_by = auth.uid()) with check (public.kng_schedule_can_manage() or claimed_by = auth.uid());
create policy kng_hungry_delete on public.ops_hungry
for delete to authenticated using (public.kng_schedule_can_manage());

create or replace function public.claim_hungry_slot(p_id uuid, p_claimed_by_name text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if public.kng_schedule_access_rank() < 1 then raise exception 'Staff access required.'; end if;
  update public.ops_hungry
     set status='claimed', claimed_by=auth.uid(), claimed_by_name=coalesce(nullif(trim(p_claimed_by_name),''),'Staff member'), claimed_at=now()
   where id=p_id and status='open';
  if not found then raise exception 'This Hungry Pool slot is no longer open.'; end if;
  return true;
end; $$;

grant execute on function public.claim_hungry_slot(uuid,text) to authenticated;

create or replace function public.unclaim_hungry_slot(p_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if public.kng_schedule_access_rank() < 1 then raise exception 'Staff access required.'; end if;
  update public.ops_hungry
     set status='open', claimed_by=null, claimed_by_name=null, claimed_at=null
   where id=p_id and (claimed_by=auth.uid() or public.kng_schedule_can_manage()) and status='claimed';
  if not found then raise exception 'You cannot unclaim this slot.'; end if;
  return true;
end; $$;

grant execute on function public.unclaim_hungry_slot(uuid) to authenticated;

create or replace function public.complete_hungry_slot(p_id uuid, p_completed_by_name text)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if public.kng_schedule_access_rank() < 1 then raise exception 'Staff access required.'; end if;
  update public.ops_hungry
     set status='completed', completed_by=auth.uid(), completed_by_name=coalesce(nullif(trim(p_completed_by_name),''),'Staff member'), completed_at=now()
   where id=p_id and status='claimed' and (claimed_by=auth.uid() or public.kng_schedule_can_manage());
  if not found then raise exception 'Only the person who claimed this slot, or management, can complete it.'; end if;
  return true;
end; $$;

grant execute on function public.complete_hungry_slot(uuid,text) to authenticated;

-- ---------------------------------------------------------
-- Tracker / Points: staff can read the data used by the Interactions dashboard.
-- Management remains required to create/adjust records.
-- ---------------------------------------------------------
alter table public.ops_tracker enable row level security;
drop policy if exists ops_tracker_read on public.ops_tracker;
drop policy if exists ops_tracker_write on public.ops_tracker;
drop policy if exists kng_tracker_read on public.ops_tracker;
drop policy if exists kng_tracker_write on public.ops_tracker;
create policy kng_tracker_read on public.ops_tracker for select to authenticated using (public.kng_schedule_access_rank() >= 1);
create policy kng_tracker_write on public.ops_tracker for insert to authenticated with check (public.kng_schedule_can_manage() or created_by=auth.uid());

alter table public.ops_points enable row level security;
drop policy if exists ops_points_read on public.ops_points;
drop policy if exists ops_points_write on public.ops_points;
drop policy if exists kng_points_read on public.ops_points;
drop policy if exists kng_points_write on public.ops_points;
create policy kng_points_read on public.ops_points for select to authenticated using (public.kng_schedule_access_rank() >= 1);
create policy kng_points_write on public.ops_points for insert to authenticated with check (public.kng_schedule_can_manage());

-- ---------------------------------------------------------
-- Interactions tables
-- ---------------------------------------------------------
create table if not exists public.ix_announcements (
  id uuid primary key default gen_random_uuid(), title text not null, body text not null,
  category text not null default 'UPDATE', created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ix_announcements_created_idx on public.ix_announcements(created_at desc);

create table if not exists public.ix_hall_of_fame (
  id uuid primary key default gen_random_uuid(), winner_name text not null, image_url text,
  rendered_image_url text, frame text not null default 'KNG Estate Roleplay',
  frame_colour text not null default '#FF2D78', frame_mode text not null default 'none',
  hue integer not null default 330 check(hue between 0 and 359), intensity integer not null default 100 check(intensity between 0 and 100),
  photo_x integer not null default 0, photo_y integer not null default 0, photo_zoom numeric not null default 1,
  created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now()
);
alter table public.ix_hall_of_fame add column if not exists rendered_image_url text;
alter table public.ix_hall_of_fame add column if not exists photo_x integer not null default 0;
alter table public.ix_hall_of_fame add column if not exists photo_y integer not null default 0;
alter table public.ix_hall_of_fame add column if not exists photo_zoom numeric not null default 1;
create index if not exists ix_hof_created_idx on public.ix_hall_of_fame(created_at desc);

create table if not exists public.ix_daily_goals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  goal_date date not null, target_points integer not null default 8 check(target_points>0),
  points_earned integer not null default 0 check(points_earned>=0), created_at timestamptz not null default now(),
  unique(user_id,goal_date)
);
create index if not exists ix_daily_goals_user_date_idx on public.ix_daily_goals(user_id,goal_date desc);

alter table public.ix_announcements enable row level security;
alter table public.ix_hall_of_fame enable row level security;
alter table public.ix_daily_goals enable row level security;

drop policy if exists ix_announcements_read on public.ix_announcements;
drop policy if exists ix_announcements_manage on public.ix_announcements;
create policy ix_announcements_read on public.ix_announcements for select to authenticated using (true);
create policy ix_announcements_manage on public.ix_announcements for all to authenticated using(public.kng_schedule_can_manage()) with check(public.kng_schedule_can_manage());

drop policy if exists ix_hof_read on public.ix_hall_of_fame;
drop policy if exists ix_hof_manage on public.ix_hall_of_fame;
create policy ix_hof_read on public.ix_hall_of_fame for select to authenticated using (true);
create policy ix_hof_manage on public.ix_hall_of_fame for all to authenticated using(public.kng_schedule_can_manage()) with check(public.kng_schedule_can_manage());

drop policy if exists ix_goals_read on public.ix_daily_goals;
drop policy if exists ix_goals_manage on public.ix_daily_goals;
create policy ix_goals_read on public.ix_daily_goals for select to authenticated using(user_id=auth.uid() or public.kng_schedule_can_manage());
create policy ix_goals_manage on public.ix_daily_goals for all to authenticated using(public.kng_schedule_can_manage()) with check(public.kng_schedule_can_manage());

-- Storage bucket and policies for winner photos / rendered Hall of Fame cards.
insert into storage.buckets(id,name,public) values('kng-hall-of-fame','kng-hall-of-fame',true)
on conflict(id) do update set public=true;
drop policy if exists kng_hof_storage_read on storage.objects;
drop policy if exists kng_hof_storage_insert on storage.objects;
drop policy if exists kng_hof_storage_update on storage.objects;
drop policy if exists kng_hof_storage_delete on storage.objects;
create policy kng_hof_storage_read on storage.objects for select to public using(bucket_id='kng-hall-of-fame');
create policy kng_hof_storage_insert on storage.objects for insert to authenticated with check(bucket_id='kng-hall-of-fame' and public.kng_schedule_can_manage());
create policy kng_hof_storage_update on storage.objects for update to authenticated using(bucket_id='kng-hall-of-fame' and public.kng_schedule_can_manage()) with check(bucket_id='kng-hall-of-fame' and public.kng_schedule_can_manage());
create policy kng_hof_storage_delete on storage.objects for delete to authenticated using(bucket_id='kng-hall-of-fame' and public.kng_schedule_can_manage());

-- ---------------------------------------------------------
-- Access request functions / grants
-- ---------------------------------------------------------
-- Keep the existing approval functions but ensure the actual parameter signatures are granted.
grant execute on function public.request_staff_access(text) to authenticated;
grant execute on function public.approve_staff_access_request(uuid,text) to authenticated;
grant execute on function public.reject_staff_access_request(uuid,text) to authenticated;

-- Ensure the already-confirmed Director remains Director if that account exists.
update public.staff_access set access_level='director', active=true
where user_id='b6246d56-d72c-4d25-baeb-2baf9eb49de4';

-- ---------------------------------------------------------
-- Helpful indexes
-- ---------------------------------------------------------
create index if not exists ops_hungry_status_idx on public.ops_hungry(status, event_date, event_time);
create index if not exists events_status_idx on public.events(status, event_date);
