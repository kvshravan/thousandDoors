-- Milestone 6: how many different people have visited each room.
--
-- Visits are recorded in a private schema that Supabase's Data API doesn't expose,
-- through one function the Flask server calls, so nobody can inflate a count from
-- outside. Owners can't edit the count either: their update grant on rooms is
-- column by column (see 0001) and doesn't include it.

alter table public.rooms
  add column visits integer not null default 0 check (visits >= 0);

create schema if not exists private;
revoke all on schema private from public;

create table private.room_visits (
  room_id text not null references public.rooms (id) on delete cascade,
  -- "u:<user id>" for members; "a:<hash>" for a browser that isn't signed in.
  visitor text not null check (char_length(visitor) between 3 and 80),
  first_seen timestamptz not null default now(),
  primary key (room_id, visitor)
);
revoke all on private.room_visits from public, anon, authenticated;

-- Counts a visitor once per room (never the owner) and returns the room's total.
create function private.record_visit(p_room text, p_visitor text)
  returns integer
  language plpgsql
  security definer
  set search_path = ''
as $$
declare
  added integer;
begin
  insert into private.room_visits (room_id, visitor)
  select r.id, p_visitor
  from public.rooms r
  where r.id = p_room
    and (r.owner_id is null or p_visitor <> 'u:' || r.owner_id::text)
  on conflict do nothing;
  get diagnostics added = row_count;
  if added > 0 then
    update public.rooms set visits = visits + 1 where id = p_room;
  end if;
  return (select visits from public.rooms where id = p_room);
end;
$$;

revoke all on function private.record_visit(text, text) from public;
grant usage on schema private to anon, authenticated;
grant execute on function private.record_visit(text, text) to anon, authenticated;
