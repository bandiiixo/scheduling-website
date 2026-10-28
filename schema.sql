-- KNG SCHEDULE DATABASE

create extension if not exists "pgcrypto";

create table if not exists public.event_types (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    colour text not null,
    description text,
    created_at timestamptz not null default now()
);

insert into public.event_types (name, colour, description)
values
    ('Meeting', '#3b82f6', 'General meeting'),
    ('BR', '#8b5cf6', 'Business robbery'),
    ('F3', '#f59e0b', 'F3 event'),
    ('Large Action', '#ef4444', 'Large-scale city action'),
    ('Staff Meeting', '#22c55e', 'KNG staff meeting')
on conflict (name) do nothing;

create table if not exists public.staff (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    discord_id text unique,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.staff_access (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null unique references auth.users(id) on delete cascade,
    access_level text not null default 'viewer'
        check (access_level in ('viewer', 'manager', 'admin')),
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.events (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    event_type_id uuid not null
        references public.event_types(id)
        on delete restrict,
    event_date date not null,
    start_time time not null,
    end_time time not null,
    location text,
    description text,
    staff_required integer not null default 0
        check (staff_required >= 0),
    created_by uuid references auth.users(id) on delete set null,
    updated_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint valid_event_time
        check (end_time > start_time)
);

create table if not exists public.event_staff (
    id uuid primary key default gen_random_uuid(),
    event_id uuid not null
        references public.events(id)
        on delete cascade,
    staff_id uuid not null
        references public.staff(id)
        on delete cascade,
    role text default 'Staff',
    allocated_by uuid references auth.users(id) on delete set null,
    allocated_at timestamptz not null default now(),
    unique(event_id, staff_id)
);

create table if not exists public.audit_log (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete set null,
    action text not null,
    entity_type text not null,
    entity_id uuid,
    details jsonb,
    created_at timestamptz not null default now()
);

create or replace function public.update_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists update_staff_updated_at on public.staff;
create trigger update_staff_updated_at
before update on public.staff
for each row
execute function public.update_updated_at();

drop trigger if exists update_staff_access_updated_at on public.staff_access;
create trigger update_staff_access_updated_at
before update on public.staff_access
for each row
execute function public.update_updated_at();

drop trigger if exists update_events_updated_at on public.events;
create trigger update_events_updated_at
before update on public.events
for each row
execute function public.update_updated_at();

create or replace function public.has_schedule_access(
    required_level text default 'manager'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    current_level text;
begin
    select access_level
    into current_level
    from public.staff_access
    where user_id = auth.uid()
      and active = true;

    if current_level is null then
        return false;
    end if;

    if required_level = 'viewer' then
        return true;
    end if;

    if required_level = 'manager' then
        return current_level in ('manager', 'admin');
    end if;

    if required_level = 'admin' then
        return current_level = 'admin';
    end if;

    return false;
end;
$$;

alter table public.event_types enable row level security;
alter table public.staff enable row level security;
alter table public.staff_access enable row level security;
alter table public.events enable row level security;
alter table public.event_staff enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists "Anyone can view event types" on public.event_types;
create policy "Anyone can view event types"
on public.event_types
for select
using (true);

drop policy if exists "Admins can manage event types" on public.event_types;
create policy "Admins can manage event types"
on public.event_types
for all
using (public.has_schedule_access('admin'))
with check (public.has_schedule_access('admin'));

drop policy if exists "Anyone can view active staff" on public.staff;
create policy "Anyone can view active staff"
on public.staff
for select
using (active = true);

drop policy if exists "Managers can create staff" on public.staff;
create policy "Managers can create staff"
on public.staff
for insert
with check (public.has_schedule_access('manager'));

drop policy if exists "Managers can update staff" on public.staff;
create policy "Managers can update staff"
on public.staff
for update
using (public.has_schedule_access('manager'))
with check (public.has_schedule_access('manager'));

drop policy if exists "Admins can delete staff" on public.staff;
create policy "Admins can delete staff"
on public.staff
for delete
using (public.has_schedule_access('admin'));

drop policy if exists "Users can view their own access" on public.staff_access;
create policy "Users can view their own access"
on public.staff_access
for select
using (
    user_id = auth.uid()
    or public.has_schedule_access('admin')
);

drop policy if exists "Admins can create access" on public.staff_access;
create policy "Admins can create access"
on public.staff_access
for insert
with check (public.has_schedule_access('admin'));

drop policy if exists "Admins can update access" on public.staff_access;
create policy "Admins can update access"
on public.staff_access
for update
using (public.has_schedule_access('admin'));

drop policy if exists "Admins can delete access" on public.staff_access;
create policy "Admins can delete access"
on public.staff_access
for delete
using (public.has_schedule_access('admin'));

drop policy if exists "Anyone can view events" on public.events;
create policy "Anyone can view events"
on public.events
for select
using (true);

drop policy if exists "Managers can create events" on public.events;
create policy "Managers can create events"
on public.events
for insert
with check (public.has_schedule_access('manager'));

drop policy if exists "Managers can update events" on public.events;
create policy "Managers can update events"
on public.events
for update
using (public.has_schedule_access('manager'));

drop policy if exists "Managers can delete events" on public.events;
create policy "Managers can delete events"
on public.events
for delete
using (public.has_schedule_access('manager'));

drop policy if exists "Anyone can view event allocations" on public.event_staff;
create policy "Anyone can view event allocations"
on public.event_staff
for select
using (true);

drop policy if exists "Managers can allocate staff" on public.event_staff;
create policy "Managers can allocate staff"
on public.event_staff
for insert
with check (public.has_schedule_access('manager'));

drop policy if exists "Managers can change allocations" on public.event_staff;
create policy "Managers can change allocations"
on public.event_staff
for update
using (public.has_schedule_access('manager'))
with check (public.has_schedule_access('manager'));

drop policy if exists "Managers can remove allocations" on public.event_staff;
create policy "Managers can remove allocations"
on public.event_staff
for delete
using (public.has_schedule_access('manager'));

drop policy if exists "Admins can view audit log" on public.audit_log;
create policy "Admins can view audit log"
on public.audit_log
for select
using (public.has_schedule_access('admin'));

drop policy if exists "Authenticated users can create audit entries" on public.audit_log;
create policy "Authenticated users can create audit entries"
on public.audit_log
for insert
with check (auth.uid() is not null);

create index if not exists idx_events_date on public.events(event_date);
create index if not exists idx_events_type on public.events(event_type_id);
create index if not exists idx_event_staff_event on public.event_staff(event_id);
create index if not exists idx_event_staff_staff on public.event_staff(staff_id);
create index if not exists idx_staff_active on public.staff(active);
create index if not exists idx_audit_log_created on public.audit_log(created_at desc);
