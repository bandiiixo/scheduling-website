-- KNG Interactions integration migration
-- Safe to run after kng_schedule_operations.sql

create table if not exists public.ix_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  category text not null default 'UPDATE',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ix_announcements_created_idx on public.ix_announcements(created_at desc);

create table if not exists public.ix_hall_of_fame (
  id uuid primary key default gen_random_uuid(),
  winner_name text not null,
  image_url text,
  frame text not null default 'Original',
  frame_colour text not null default '#22D3EE',
  frame_mode text not null default 'none',
  hue integer not null default 180 check (hue between 0 and 359),
  intensity integer not null default 100 check (intensity between 0 and 100),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ix_hof_created_idx on public.ix_hall_of_fame(created_at desc);

alter table public.ix_hall_of_fame add column if not exists frame_mode text not null default 'none';
alter table public.ix_hall_of_fame add column if not exists hue integer not null default 180;
alter table public.ix_hall_of_fame add column if not exists intensity integer not null default 100;

create table if not exists public.ix_daily_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_date date not null,
  target_points integer not null default 8 check (target_points > 0),
  points_earned integer not null default 0 check (points_earned >= 0),
  created_at timestamptz not null default now(),
  unique(user_id, goal_date)
);

create index if not exists ix_daily_goals_user_date_idx on public.ix_daily_goals(user_id, goal_date desc);

alter table public.ix_announcements enable row level security;
alter table public.ix_hall_of_fame enable row level security;
alter table public.ix_daily_goals enable row level security;

drop policy if exists ix_announcements_read on public.ix_announcements;
drop policy if exists ix_announcements_manage on public.ix_announcements;
drop policy if exists ix_hof_read on public.ix_hall_of_fame;
drop policy if exists ix_hof_manage on public.ix_hall_of_fame;
drop policy if exists ix_goals_read on public.ix_daily_goals;
drop policy if exists ix_goals_manage on public.ix_daily_goals;

create policy ix_announcements_read on public.ix_announcements
for select to authenticated using (true);

create policy ix_announcements_manage on public.ix_announcements
for all to authenticated
using (public.kng_schedule_can_manage())
with check (public.kng_schedule_can_manage());

create policy ix_hof_read on public.ix_hall_of_fame
for select to authenticated using (true);

create policy ix_hof_manage on public.ix_hall_of_fame
for all to authenticated
using (public.kng_schedule_can_manage())
with check (public.kng_schedule_can_manage());

create policy ix_goals_read on public.ix_daily_goals
for select to authenticated
using (user_id = auth.uid() or public.kng_schedule_can_manage());

create policy ix_goals_manage on public.ix_daily_goals
for all to authenticated
using (public.kng_schedule_can_manage())
with check (public.kng_schedule_can_manage());

-- Public bucket for Hall of Fame winner images.
insert into storage.buckets (id, name, public)
values ('kng-hall-of-fame', 'kng-hall-of-fame', true)
on conflict (id) do update set public = true;

drop policy if exists kng_hof_storage_read on storage.objects;
drop policy if exists kng_hof_storage_insert on storage.objects;
drop policy if exists kng_hof_storage_update on storage.objects;
drop policy if exists kng_hof_storage_delete on storage.objects;

create policy kng_hof_storage_read on storage.objects
for select to public
using (bucket_id = 'kng-hall-of-fame');

create policy kng_hof_storage_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'kng-hall-of-fame' and public.kng_schedule_can_manage());

create policy kng_hof_storage_update on storage.objects
for update to authenticated
using (bucket_id = 'kng-hall-of-fame' and public.kng_schedule_can_manage())
with check (bucket_id = 'kng-hall-of-fame' and public.kng_schedule_can_manage());

create policy kng_hof_storage_delete on storage.objects
for delete to authenticated
using (bucket_id = 'kng-hall-of-fame' and public.kng_schedule_can_manage());

-- Event-type names requested for the integrated Entertainment site.
update public.event_types set name = 'Party' where lower(name) = 'f3';
update public.event_types set name = 'Battle Royale' where lower(name) = 'br';
update public.event_types set name = 'Community Meeting' where lower(name) = 'meeting';

insert into public.event_types (name, colour, description)
select 'Event', '#ff2d5b', 'General KNG Entertainment event'
where not exists (select 1 from public.event_types where lower(name) = 'event');

alter table public.events add column if not exists is_meeting boolean not null default false;

-- Community Meeting and Staff Meeting are meetings, not event leaderboard entries.
update public.events
set is_meeting = true
where event_type_id in (
  select id from public.event_types where lower(name) in ('community meeting','staff meeting')
);

