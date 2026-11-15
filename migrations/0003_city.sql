-- Milestone 6: which city a member lives in, if they choose to say. Only a city id
-- from static/data/cities.json is stored, never a precise location. The hallway uses
-- it to make doors near you glow.

alter table public.profiles
  add column city text check (city ~ '^[a-z0-9][a-z0-9-]{1,39}$');

grant update (city) on public.profiles to authenticated;
