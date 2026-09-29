-- Anonymous convenience saves are public to anyone who knows the project URL/key.
-- Opaque slot IDs reduce casual discovery; they are not authentication or privacy.
create table if not exists public.profile_saves (
  profile_id uuid primary key check (profile_id in (
    'f32a6c14-8d1b-4b70-9a2e-61c5d9037f48',
    'a91e5d27-3c84-46f0-bb12-72d8e4065a39'
  )),
  revision bigint not null check (revision > 0),
  schema_version integer not null check (schema_version > 0),
  updated_at timestamptz not null,
  state jsonb not null
);
alter table public.profile_saves enable row level security;
create policy "read fixed profile saves" on public.profile_saves for select to anon using (true);
revoke all on public.profile_saves from public, anon, authenticated;
grant select on public.profile_saves to anon;

create or replace function public.write_profile_save(
  p_profile_id uuid, p_expected_revision bigint, p_schema_version integer,
  p_updated_at timestamptz, p_state jsonb
) returns setof public.profile_saves
language plpgsql security definer set search_path = '' as $$
begin
  if p_profile_id not in ('f32a6c14-8d1b-4b70-9a2e-61c5d9037f48'::uuid, 'a91e5d27-3c84-46f0-bb12-72d8e4065a39'::uuid)
     or p_schema_version <> 1 or jsonb_typeof(p_state) <> 'object' then
    raise exception 'Invalid profile save';
  end if;
  return query
    insert into public.profile_saves as current_save (profile_id, revision, schema_version, updated_at, state)
    values (p_profile_id, 1, p_schema_version, p_updated_at, p_state)
    on conflict (profile_id) do update set
      revision = current_save.revision + 1,
      schema_version = excluded.schema_version,
      updated_at = excluded.updated_at,
      state = excluded.state
    where current_save.revision = p_expected_revision
    returning current_save.*;
end;
$$;
revoke all on function public.write_profile_save(uuid, bigint, integer, timestamptz, jsonb) from public, authenticated;
grant execute on function public.write_profile_save(uuid, bigint, integer, timestamptz, jsonb) to anon;
