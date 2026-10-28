-- KNG Staff Portal: application tables for tasks, FAQs, Discord slots and audit history.
-- Run this AFTER the core KNG account/team/access-key SQL already created in Supabase.

create table if not exists public.tasks (
    id uuid primary key default gen_random_uuid(),
    team_name text not null references public.teams(name) on update cascade,
    title text not null,
    description text,
    active boolean not null default true,
    created_by uuid references auth.users(id),
    created_at timestamptz not null default now()
);

create table if not exists public.task_logs (
    id uuid primary key default gen_random_uuid(),
    task_id uuid not null references public.tasks(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    team_name text not null references public.teams(name) on update cascade,
    task_title text not null,
    completed_at timestamptz not null default now()
);

create table if not exists public.faqs (
    id uuid primary key default gen_random_uuid(),
    team_name text not null references public.teams(name) on update cascade,
    title text not null,
    body text not null,
    active boolean not null default true,
    created_by uuid references auth.users(id),
    created_at timestamptz not null default now()
);

create table if not exists public.discord_slots (
    id uuid primary key default gen_random_uuid(),
    slot_date date not null,
    start_time time not null,
    end_time time not null,
    user_id uuid references auth.users(id) on delete set null,
    booked_at timestamptz,
    created_at timestamptz not null default now(),
    unique (slot_date, start_time)
);

create table if not exists public.staff_audit_log (
    id uuid primary key default gen_random_uuid(),
    actor_user_id uuid references auth.users(id) on delete set null,
    target_user_id uuid references auth.users(id) on delete set null,
    action text not null,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create index if not exists idx_tasks_team_active on public.tasks(team_name, active);
create index if not exists idx_task_logs_team_completed on public.task_logs(team_name, completed_at desc);
create index if not exists idx_task_logs_user_completed on public.task_logs(user_id, completed_at desc);
create index if not exists idx_faqs_team_active on public.faqs(team_name, active);
create index if not exists idx_discord_slots_date on public.discord_slots(slot_date, start_time);

alter table public.tasks enable row level security;
alter table public.task_logs enable row level security;
alter table public.faqs enable row level security;
alter table public.discord_slots enable row level security;
alter table public.staff_audit_log enable row level security;

-- TASKS
create policy "Active team members can view team tasks"
on public.tasks for select to authenticated
using (
    active = true
    and exists (
        select 1 from public.team_memberships tm
        where tm.user_id = auth.uid()
          and tm.status = 'active'
          and tm.rank is not null
          and tm.team_id = (select id from public.teams where name = tasks.team_name limit 1)
    )
);

create policy "Team managers can manage tasks"
on public.tasks for all to authenticated
using (public.can_manage_team(team_name))
with check (public.can_manage_team(team_name));

-- TASK LOGS
create policy "Users can view own task logs"
on public.task_logs for select to authenticated
using (user_id = auth.uid());

create policy "Team managers can view team task logs"
on public.task_logs for select to authenticated
using (public.can_manage_team(team_name));

create policy "Users can insert own task logs"
on public.task_logs for insert to authenticated
with check (
    user_id = auth.uid()
    and exists (
        select 1 from public.team_memberships tm
        join public.teams t on t.id = tm.team_id
        where tm.user_id = auth.uid()
          and tm.status = 'active'
          and t.name = task_logs.team_name
          and t.active = true
    )
);

create policy "Users can delete own task logs"
on public.task_logs for delete to authenticated
using (user_id = auth.uid());

-- FAQS
create policy "Team members can view active FAQs"
on public.faqs for select to authenticated
using (
    active = true
    and exists (
        select 1 from public.team_memberships tm
        join public.teams t on t.id = tm.team_id
        where tm.user_id = auth.uid()
          and tm.status = 'active'
          and t.name = faqs.team_name
          and t.active = true
    )
);

create policy "Team managers can manage FAQs"
on public.faqs for all to authenticated
using (public.can_manage_team(team_name))
with check (public.can_manage_team(team_name));

-- DISCORD SLOTS
create policy "Discord members can view slots"
on public.discord_slots for select to authenticated
using (
    exists (
        select 1 from public.team_memberships tm
        join public.teams t on t.id = tm.team_id
        where tm.user_id = auth.uid()
          and tm.status = 'active'
          and t.name = 'Discord'
          and t.active = true
    )
);

create policy "Discord members can book free slots"
on public.discord_slots for update to authenticated
using (
    user_id is null
    and exists (
        select 1 from public.team_memberships tm
        join public.teams t on t.id = tm.team_id
        where tm.user_id = auth.uid()
          and tm.status = 'active'
          and t.name = 'Discord'
          and t.active = true
    )
)
with check (user_id = auth.uid());

create policy "Discord members can cancel own slots"
on public.discord_slots for update to authenticated
using (user_id = auth.uid())
with check (user_id is null or user_id = auth.uid());

create policy "Discord managers can manage slots"
on public.discord_slots for all to authenticated
using (public.can_manage_team('Discord'))
with check (public.can_manage_team('Discord'));

-- AUDIT LOG
create policy "Admins can view audit log"
on public.staff_audit_log for select to authenticated
using (public.is_admin());

create policy "Admins can write audit log"
on public.staff_audit_log for insert to authenticated
with check (public.is_admin());

-- Seed basic tasks/FAQs for the three KNG teams.
insert into public.tasks (team_name,title,description)
select x.team_name, x.title, x.description
from (values
    ('Administration & Staff Operations','Complete daily staff review','Review current staff activity and outstanding administration items.'),
    ('Administration & Staff Operations','Review pending accounts','Check new account applications awaiting approval.'),
    ('Knowledge','Complete daily team check','Complete the daily Knowledge team review.'),
    ('Knowledge','Review assigned reports','Review assigned Knowledge work and record completion.'),
    ('Knowledge','Update team tracker','Keep current Knowledge activity and work records up to date.'),
    ('Discord','Complete shift handover','Review the previous Discord team handover.'),
    ('Discord','Check Discord queue','Review the current Discord workload and outstanding actions.'),
    ('Discord','Complete hourly activity check','Complete the hourly Discord team activity check.')
) as x(team_name,title,description)
where exists (select 1 from public.teams t where t.name=x.team_name)
  and not exists (select 1 from public.tasks t where t.team_name=x.team_name and t.title=x.title);

insert into public.faqs (team_name,title,body)
select x.team_name,x.title,x.body
from (values
    ('Administration & Staff Operations','What is this portal for?','The portal manages KNG staff accounts, team memberships, tasks, FAQs and staff monitoring.'),
    ('Administration & Staff Operations','Who can approve accounts?','Administration & Staff Operations ADM members can approve or reject new staff applications.'),
    ('Knowledge','What counts as a completed task?','A task is complete when the required work has actually been carried out and recorded in the portal.'),
    ('Knowledge','Where do I see my assignments?','Open My tasks to see the tasks configured for your active Knowledge membership.'),
    ('Discord','How do Discord shifts work?','Discord team members can book available hourly slots in the Discord team workspace.'),
    ('Discord','Can I book multiple slots?','A member can book an available slot. Additional booking rules can be tightened by Discord management later.')
) as x(team_name,title,body)
where exists (select 1 from public.teams t where t.name=x.team_name)
  and not exists (select 1 from public.faqs f where f.team_name=x.team_name and f.title=x.title);
