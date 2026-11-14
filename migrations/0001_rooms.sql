-- 0001: profiles, rooms, visitor notes and gifts, and photos.
--
-- Flask is the only client: it runs each query as the signed-in user (role
-- "authenticated" with their JWT claims) or as "anon", so these row-level security
-- policies are enforced for every request, and also protect the tables from the
-- Supabase Data API, which exposes the public schema to anyone with the publishable key.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9][a-z0-9_-]{2,19}$'),
  display_name text not null default '' check (char_length(display_name) <= 40),
  bio text not null default '' check (char_length(bio) <= 280),
  status text not null default '' check (char_length(status) <= 80),
  interests text[] not null default '{}' check (cardinality(interests) <= 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A room is one JSON document: appearance and the objects in it, in the same shape
-- as static/data/rooms/*.json. Demo rooms (Mira, Jun) have no owner.
create table public.rooms (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9_-]{2,19}$'),
  owner_id uuid unique references auth.users (id) on delete cascade,
  is_demo boolean not null default false,
  name text not null check (char_length(name) between 1 and 60),
  description text not null default '' check (char_length(description) <= 200),
  appearance jsonb not null default '{}'::jsonb check (jsonb_typeof(appearance) = 'object'),
  objects jsonb not null default '[]'::jsonb
    check (jsonb_typeof(objects) = 'array' and jsonb_array_length(objects) <= 300),
  demo_owner jsonb,
  updated_at timestamptz not null default now(),
  check (is_demo = (owner_id is null)),
  check (pg_column_size(objects) <= 524288)
);

create table public.notes (
  id bigint generated always as identity primary key,
  room_id text not null references public.rooms (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 40),
  message text not null check (char_length(message) between 1 and 280),
  created_at timestamptz not null default now()
);
create index notes_room_created_idx on public.notes (room_id, created_at desc);
create index notes_author_idx on public.notes (author_id);

create table public.gifts (
  id bigint generated always as identity primary key,
  room_id text not null references public.rooms (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 40),
  gift text not null check (gift in ('flower', 'cookie', 'star', 'tea')),
  created_at timestamptz not null default now()
);
create index gifts_room_created_idx on public.gifts (room_id, created_at desc);
create index gifts_author_idx on public.gifts (author_id);

-- Uploaded photos. The file lives in the "photos" storage bucket at `path`.
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  path text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
  byte_size integer not null check (byte_size between 1 and 2097152),
  name text not null default '' check (char_length(name) <= 80),
  created_at timestamptz not null default now()
);
create index photos_owner_created_idx on public.photos (owner_id, created_at desc);

-- ---- Row-level security ----

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.notes enable row level security;
alter table public.gifts enable row level security;
alter table public.photos enable row level security;

create policy "Profiles are public" on public.profiles
  for select to anon, authenticated using (true);
create policy "People create their own profile" on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));
create policy "People edit their own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "Rooms are public" on public.rooms
  for select to anon, authenticated using (true);
-- A room's id is its owner's username.
create policy "People create their own room" on public.rooms
  for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and not is_demo
    and id = (select p.username from public.profiles p where p.id = (select auth.uid()))
  );
create policy "Owners edit their room" on public.rooms
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "Notes are public" on public.notes
  for select to anon, authenticated using (true);
create policy "Visitors sign their own notes" on public.notes
  for insert to authenticated with check (author_id = (select auth.uid()));
create policy "Authors and room owners remove notes" on public.notes
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or room_id in (select r.id from public.rooms r where r.owner_id = (select auth.uid()))
  );

create policy "Gifts are public" on public.gifts
  for select to anon, authenticated using (true);
create policy "Visitors sign their own gifts" on public.gifts
  for insert to authenticated with check (author_id = (select auth.uid()));
create policy "Authors and room owners remove gifts" on public.gifts
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or room_id in (select r.id from public.rooms r where r.owner_id = (select auth.uid()))
  );

-- Photos are shown to anyone visiting a room that uses them.
create policy "Photos are public" on public.photos
  for select to anon, authenticated using (true);
create policy "People add their own photos" on public.photos
  for insert to authenticated
  with check (owner_id = (select auth.uid()) and path like (select auth.uid())::text || '/%');
create policy "People remove their own photos" on public.photos
  for delete to authenticated using (owner_id = (select auth.uid()));

-- ---- Privileges: only what the policies above need, column by column ----

revoke all on public.profiles, public.rooms, public.notes, public.gifts, public.photos
  from anon, authenticated;
grant select on public.profiles, public.rooms, public.notes, public.gifts, public.photos
  to anon, authenticated;
grant insert (id, username, display_name, bio, status, interests) on public.profiles to authenticated;
grant update (display_name, bio, status, interests, updated_at) on public.profiles to authenticated;
grant insert (id, owner_id, name, description, appearance, objects) on public.rooms to authenticated;
grant update (name, description, appearance, objects, updated_at) on public.rooms to authenticated;
grant insert (room_id, author_id, author_name, message), delete on public.notes to authenticated;
grant insert (room_id, author_id, author_name, gift), delete on public.gifts to authenticated;
grant insert (id, owner_id, path, content_type, byte_size, name), delete on public.photos to authenticated;

-- ---- Storage: a public bucket; only the server (secret key) writes to it ----

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
