-- Apple Reminders sync: per-user iCloud credentials
create table if not exists public.reminders_config (
  user_id             uuid        primary key references auth.users(id) on delete cascade,
  icloud_username     text        not null,
  icloud_app_password text        not null,
  list_name           text        not null default 'Taskion',
  enabled             boolean     not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.reminders_config enable row level security;

-- Users can only read/write their own row
create policy "reminders_config: owner select"
  on public.reminders_config for select
  using (auth.uid() = user_id);

create policy "reminders_config: owner insert"
  on public.reminders_config for insert
  with check (auth.uid() = user_id);

create policy "reminders_config: owner update"
  on public.reminders_config for update
  using (auth.uid() = user_id);

create policy "reminders_config: owner delete"
  on public.reminders_config for delete
  using (auth.uid() = user_id);

-- Link each task to its CalDAV VTODO so updates/deletes hit the right reminder
alter table public.tasks
  add column if not exists apple_uid text;

-- Track when Taskion last pushed this task to avoid poll loop
alter table public.tasks
  add column if not exists apple_pushed_at timestamptz;
