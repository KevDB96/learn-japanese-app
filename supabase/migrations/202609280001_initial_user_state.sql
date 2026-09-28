create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.lesson_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create table if not exists public.concept_state (
  user_id uuid not null references auth.users(id) on delete cascade,
  concept_id text not null,
  state jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, concept_id)
);

create table if not exists public.review_events (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null,
  concept_id text not null,
  reviewed_at timestamptz not null,
  rating text not null check (rating in ('again', 'hard', 'good', 'easy')),
  primary key (user_id, event_id)
);

create table if not exists public.sync_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null,
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

create table if not exists public.guest_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  guest_id text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.concept_state enable row level security;
alter table public.review_events enable row level security;
alter table public.sync_devices enable row level security;
alter table public.guest_claims enable row level security;

create policy "owners manage profile" on public.profiles for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owners manage settings" on public.user_settings for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owners manage lesson progress" on public.lesson_progress for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owners manage concept state" on public.concept_state for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owners manage review events" on public.review_events for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owners manage sync devices" on public.sync_devices for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "owners manage guest claims" on public.guest_claims for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
