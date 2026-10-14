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
