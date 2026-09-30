-- Append-only event history is stored separately from the small profile snapshot.
-- These two opaque slots are public convenience storage, not private accounts.
create table if not exists public.profile_review_events (
  profile_id uuid not null check (profile_id in (
    'f32a6c14-8d1b-4b70-9a2e-61c5d9037f48',
    'a91e5d27-3c84-46f0-bb12-72d8e4065a39'
  )),
  event_id uuid not null,
  reviewed_at timestamptz not null,
  event jsonb not null check (
    jsonb_typeof(event) = 'object'
    and octet_length(event::text) <= 8192
    and event->>'id' = event_id::text
    and jsonb_typeof(event->'conceptId') = 'string'
    and length(event->>'conceptId') between 1 and 200
    and jsonb_typeof(event->'cardId') = 'string'
    and length(event->>'cardId') between 1 and 200
    and (event->>'rating') in ('again', 'hard', 'good', 'easy')
    and (event->>'kind') in ('scheduled-review', 'practice')
    and (event->>'reviewedAt')::timestamptz = reviewed_at
  ),
  primary key (profile_id, event_id)
);
alter table public.profile_review_events enable row level security;
revoke all on public.profile_review_events from public, anon, authenticated;
grant select, insert on public.profile_review_events to anon;
create policy "read fixed profile review events" on public.profile_review_events
  for select to anon using (profile_id in (
    'f32a6c14-8d1b-4b70-9a2e-61c5d9037f48'::uuid,
    'a91e5d27-3c84-46f0-bb12-72d8e4065a39'::uuid
  ));
create policy "append fixed profile review events" on public.profile_review_events
  for insert to anon with check (profile_id in (
    'f32a6c14-8d1b-4b70-9a2e-61c5d9037f48'::uuid,
    'a91e5d27-3c84-46f0-bb12-72d8e4065a39'::uuid
  ));
