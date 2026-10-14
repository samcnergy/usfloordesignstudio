-- US Floor Design Studio: complete database setup in one paste.
-- Run once in the Supabase SQL editor of project mvwvgzxbgdndfsmhmbfu (usfloordesignstudio).
-- Part 1 clears the old staging tables. Part 2 creates Design Studio. Part 3 loads the standard catalog.

-- ===== Part 1 =====
-- ONE TIME ONLY, on project mvwvgzxbgdndfsmhmbfu (formerly usfloor-staging).
-- Removes every table, view, function and type the old platform staging copy
-- left in the public schema, then restores Supabase's standard grants.
-- Never run this on the production project (qgmkggpnifusdvoljezs).

drop schema if exists public cascade;
create schema public;

grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all functions in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;

-- ===== Part 2 =====
-- US Floor Design Studio schema.
-- Every table starts with ds_ so Design Studio never collides with another app's tables.
-- Lengths are inches.

create table if not exists public.ds_cabinets (
  id uuid primary key default gen_random_uuid(),
  code text not null check (length(code) between 1 and 12),
  name text not null,
  category text not null check (category in ('base', 'wall', 'tall', 'appliance', 'filler')),
  style text not null check (style in (
    'base', 'drawer_base', 'sink_base', 'blind_corner_base', 'wall', 'wall_blind_corner',
    'tall_pantry', 'tall_oven', 'range', 'refrigerator', 'dishwasher', 'hood', 'filler', 'panel'
  )),
  widths numeric[] not null check (cardinality(widths) > 0),
  heights numeric[] not null check (cardinality(heights) > 0),
  default_height numeric not null check (default_height > 0),
  depth numeric not null check (depth > 0),
  mount_height numeric check (mount_height is null or mount_height >= 0),
  image_url text,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ds_finishes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  vendor text,
  color_hex text not null check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  image_url text,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ds_countertops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color_hex text not null check (color_hex ~ '^#[0-9A-Fa-f]{6}$'),
  image_url text,
  thickness numeric not null default 1.5 check (thickness > 0),
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ds_designs (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Untitled kitchen',
  customer_name text,
  customer_phone text,
  customer_address text,
  designer_name text,
  notes text,
  data jsonb not null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ds_designs_updated_idx on public.ds_designs (updated_at desc);

-- keep updated_at current
create or replace function public.ds_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['ds_cabinets', 'ds_finishes', 'ds_countertops', 'ds_designs'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.ds_touch_updated_at()', t, t);
  end loop;
end $$;

-- Admins manage the catalog. Set with:
--   update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where email = 'someone@example.com';
create or replace function public.ds_is_admin() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

alter table public.ds_cabinets enable row level security;
alter table public.ds_finishes enable row level security;
alter table public.ds_countertops enable row level security;
alter table public.ds_designs enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ds_cabinets', 'ds_finishes', 'ds_countertops'] loop
    execute format('drop policy if exists "%s read" on public.%I', t, t);
    execute format('drop policy if exists "%s admin write" on public.%I', t, t);
    execute format('create policy "%s read" on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy "%s admin write" on public.%I for all to authenticated using (public.ds_is_admin()) with check (public.ds_is_admin())', t, t);
  end loop;
end $$;

-- every signed-in designer can open and edit every design
drop policy if exists "ds_designs team" on public.ds_designs;
create policy "ds_designs team" on public.ds_designs for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.ds_cabinets, public.ds_finishes, public.ds_countertops, public.ds_designs to authenticated;

-- images: catalog photos and site photos, publicly readable by URL
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ds-images', 'ds-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "ds-images read" on storage.objects;
drop policy if exists "ds-images upload" on storage.objects;
drop policy if exists "ds-images change" on storage.objects;
drop policy if exists "ds-images remove" on storage.objects;
create policy "ds-images read" on storage.objects for select using (bucket_id = 'ds-images');
create policy "ds-images upload" on storage.objects for insert to authenticated with check (bucket_id = 'ds-images');
create policy "ds-images change" on storage.objects for update to authenticated using (bucket_id = 'ds-images');
create policy "ds-images remove" on storage.objects for delete to authenticated using (bucket_id = 'ds-images');

-- ===== Part 3 =====
-- Standard starting catalog. Generated by scripts/generate-seed.mjs; do not edit by hand.
-- Safe to run more than once: existing rows with the same id are left alone.

insert into public.ds_cabinets (id, code, name, category, style, widths, heights, default_height, depth, mount_height, sort, active) values
  ('0a000000-0000-4000-8000-000000000001', 'B', 'Base cabinet', 'base', 'base', array[9,12,15,18,21,24,27,30,33,36,42,48]::numeric[], array[34.5]::numeric[], 34.5, 24, null, 10, true),
  ('0a000000-0000-4000-8000-000000000002', 'DB', 'Drawer base, 3 drawers', 'base', 'drawer_base', array[12,15,18,21,24,30,36]::numeric[], array[34.5]::numeric[], 34.5, 24, null, 20, true),
  ('0a000000-0000-4000-8000-000000000003', 'SB', 'Sink base', 'base', 'sink_base', array[24,27,30,33,36,42]::numeric[], array[34.5]::numeric[], 34.5, 24, null, 30, true),
  ('0a000000-0000-4000-8000-000000000004', 'BBC', 'Blind corner base', 'base', 'blind_corner_base', array[36,39,42,45,48]::numeric[], array[34.5]::numeric[], 34.5, 24, null, 40, true),
  ('0a000000-0000-4000-8000-000000000011', 'W', 'Wall cabinet', 'wall', 'wall', array[9,12,15,18,21,24,27,30,33,36,42]::numeric[], array[12,15,18,24,30,36,42]::numeric[], 30, 12, 54, 50, true),
  ('0a000000-0000-4000-8000-000000000012', 'WBC', 'Wall blind corner', 'wall', 'wall_blind_corner', array[24,27,30,36]::numeric[], array[30,36,42]::numeric[], 30, 12, 54, 60, true),
  ('0a000000-0000-4000-8000-000000000021', 'P', 'Pantry cabinet', 'tall', 'tall_pantry', array[18,24,30,36]::numeric[], array[84,90,96]::numeric[], 84, 24, null, 70, true),
  ('0a000000-0000-4000-8000-000000000022', 'OV', 'Oven cabinet', 'tall', 'tall_oven', array[30,33]::numeric[], array[84,90,96]::numeric[], 84, 24, null, 80, true),
  ('0a000000-0000-4000-8000-000000000031', 'RNG', 'Range', 'appliance', 'range', array[30,36,48]::numeric[], array[36]::numeric[], 36, 26, null, 90, true),
  ('0a000000-0000-4000-8000-000000000032', 'REF', 'Refrigerator', 'appliance', 'refrigerator', array[30,33,36,42]::numeric[], array[70,72,84]::numeric[], 70, 30, null, 100, true),
  ('0a000000-0000-4000-8000-000000000033', 'DW', 'Dishwasher', 'appliance', 'dishwasher', array[18,24]::numeric[], array[34.5]::numeric[], 34.5, 24, null, 110, true),
  ('0a000000-0000-4000-8000-000000000034', 'HD', 'Range hood', 'appliance', 'hood', array[30,36,48]::numeric[], array[24,30,36]::numeric[], 30, 20, 66, 120, true),
  ('0a000000-0000-4000-8000-000000000041', 'BF', 'Base filler', 'filler', 'filler', array[1.5,3,6]::numeric[], array[34.5]::numeric[], 34.5, 24, null, 130, true),
  ('0a000000-0000-4000-8000-000000000042', 'WF', 'Wall filler', 'filler', 'filler', array[1.5,3,6]::numeric[], array[30,36,42]::numeric[], 30, 12, 54, 140, true),
  ('0a000000-0000-4000-8000-000000000043', 'PNL', 'End panel', 'filler', 'panel', array[0.75]::numeric[], array[34.5,84,90,96]::numeric[], 34.5, 24, null, 150, true)
on conflict (id) do nothing;

insert into public.ds_finishes (id, name, vendor, color_hex, sort, active) values
  ('0b000000-0000-4000-8000-000000000001', 'White Shaker', null, '#F3F1EA', 10, true),
  ('0b000000-0000-4000-8000-000000000002', 'Dove Gray', null, '#B9B6AE', 20, true),
  ('0b000000-0000-4000-8000-000000000003', 'Navy', null, '#2D3B52', 30, true),
  ('0b000000-0000-4000-8000-000000000004', 'Sage Green', null, '#8C9A7E', 40, true),
  ('0b000000-0000-4000-8000-000000000005', 'Natural Oak', null, '#C59D6E', 50, true),
  ('0b000000-0000-4000-8000-000000000006', 'Espresso', null, '#3C2B22', 60, true)
on conflict (id) do nothing;

insert into public.ds_countertops (id, name, color_hex, thickness, sort, active) values
  ('0c000000-0000-4000-8000-000000000001', 'White Quartz', '#EFEEEA', 1.5, 10, true),
  ('0c000000-0000-4000-8000-000000000002', 'Calacatta Quartz', '#F4F2EE', 1.5, 20, true),
  ('0c000000-0000-4000-8000-000000000003', 'Gray Quartz', '#9C9B98', 1.5, 30, true),
  ('0c000000-0000-4000-8000-000000000004', 'Absolute Black Granite', '#1F1F1F', 1.5, 40, true),
  ('0c000000-0000-4000-8000-000000000005', 'Butcher Block', '#B5824F', 1.5, 50, true)
on conflict (id) do nothing;
