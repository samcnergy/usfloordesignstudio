-- Catalog v2: real products by manufacturer and product line, one row per SKU.
-- Replaces the generic ds_cabinets table. Saved designs keep their own snapshot of
-- every placed piece, so dropping ds_cabinets does not change any drawing.

create table if not exists public.ds_manufacturers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  website text,
  notes text,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ds_product_lines (
  id uuid primary key default gen_random_uuid(),
  manufacturer_id uuid not null references public.ds_manufacturers (id) on delete cascade,
  name text not null,
  construction text not null default 'framed' check (construction in ('framed', 'frameless', 'other')),
  features text,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (manufacturer_id, name)
);

create table if not exists public.ds_products (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references public.ds_product_lines (id) on delete cascade,
  sku text not null,
  name text not null,
  description text,
  category text not null check (category in ('base', 'wall', 'tall', 'vanity', 'appliance', 'filler', 'panel', 'accessory')),
  style text not null check (style in (
    'base', 'drawer_base', 'sink_base', 'blind_corner_base', 'lazy_susan', 'open_shelf',
    'wall', 'wall_blind_corner', 'wall_diagonal', 'wall_microwave', 'wine_rack', 'plate_rack',
    'tall_pantry', 'tall_oven', 'vanity_combo',
    'range', 'refrigerator', 'dishwasher', 'hood', 'filler', 'panel', 'accessory'
  )),
  width numeric check (width is null or width > 0),
  height numeric check (height is null or height > 0),
  depth numeric check (depth is null or depth > 0),
  mount_height numeric check (mount_height is null or mount_height >= 0),
  doors integer not null default 0 check (doors >= 0),
  drawers integer not null default 0 check (drawers >= 0),
  shelves integer not null default 0 check (shelves >= 0),
  split_height numeric check (split_height is null or split_height > 0),
  placeable boolean not null default true,
  image_url text,
  source_url text,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (line_id, sku),
  -- anything that is drawn needs real dimensions; order-only accessories may leave them blank
  check (not placeable or (width is not null and height is not null and depth is not null))
);

create index if not exists ds_products_line_idx on public.ds_products (line_id, category, sort);

-- colors belong to a product line and know how their doors look
alter table public.ds_finishes add column if not exists line_id uuid references public.ds_product_lines (id) on delete set null;
alter table public.ds_finishes add column if not exists door_style text not null default 'shaker';
alter table public.ds_finishes add column if not exists fill_mode text not null default 'color';
alter table public.ds_finishes add column if not exists source_url text;
alter table public.ds_finishes drop constraint if exists ds_finishes_door_style_check;
alter table public.ds_finishes add constraint ds_finishes_door_style_check check (door_style in ('shaker', 'slab', 'raised'));
alter table public.ds_finishes drop constraint if exists ds_finishes_fill_mode_check;
alter table public.ds_finishes add constraint ds_finishes_fill_mode_check check (fill_mode in ('color', 'photo'));

-- the generic starter colors are replaced by real manufacturer colors
delete from public.ds_finishes where id::text like '0b000000-0000-4000-8000-%';

drop table if exists public.ds_cabinets;

-- triggers, row level security and grants, same rules as the rest of the catalog
do $$
declare t text;
begin
  foreach t in array array['ds_manufacturers', 'ds_product_lines', 'ds_products'] loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.ds_touch_updated_at()', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s read" on public.%I', t, t);
    execute format('drop policy if exists "%s admin write" on public.%I', t, t);
    execute format('create policy "%s read" on public.%I for select to authenticated using (true)', t, t);
    execute format('create policy "%s admin write" on public.%I for all to authenticated using (public.ds_is_admin()) with check (public.ds_is_admin())', t, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Generic appliances, available with every cabinet line
insert into public.ds_manufacturers (id, name, notes, sort)
values ('0d000000-0000-4000-8000-000000000001', 'Generic', 'Standard appliance sizes for layout. Replace with real models when known.', 999)
on conflict (id) do nothing;

insert into public.ds_product_lines (id, manufacturer_id, name, construction, sort)
values ('0e000000-0000-4000-8000-000000000001', '0d000000-0000-4000-8000-000000000001', 'Appliances', 'other', 999)
on conflict (id) do nothing;

insert into public.ds_products (line_id, sku, name, description, category, style, width, height, depth, mount_height, sort) values
  ('0e000000-0000-4000-8000-000000000001', 'RNG30', 'Range', 'Freestanding range 30" wide', 'appliance', 'range', 30, 36, 26, null, 10),
  ('0e000000-0000-4000-8000-000000000001', 'RNG36', 'Range', 'Freestanding range 36" wide', 'appliance', 'range', 36, 36, 26, null, 20),
  ('0e000000-0000-4000-8000-000000000001', 'RNG48', 'Range', 'Range 48" wide', 'appliance', 'range', 48, 36, 26, null, 30),
  ('0e000000-0000-4000-8000-000000000001', 'REF30', 'Refrigerator', 'Refrigerator 30" wide', 'appliance', 'refrigerator', 30, 70, 30, null, 40),
  ('0e000000-0000-4000-8000-000000000001', 'REF33', 'Refrigerator', 'Refrigerator 33" wide', 'appliance', 'refrigerator', 33, 70, 30, null, 50),
  ('0e000000-0000-4000-8000-000000000001', 'REF36', 'Refrigerator', 'Refrigerator 36" wide', 'appliance', 'refrigerator', 36, 70, 30, null, 60),
  ('0e000000-0000-4000-8000-000000000001', 'REF42', 'Refrigerator', 'Built-in refrigerator 42" wide', 'appliance', 'refrigerator', 42, 84, 24, null, 70),
  ('0e000000-0000-4000-8000-000000000001', 'DW18', 'Dishwasher', 'Dishwasher 18" wide', 'appliance', 'dishwasher', 18, 34.5, 24, null, 80),
  ('0e000000-0000-4000-8000-000000000001', 'DW24', 'Dishwasher', 'Dishwasher 24" wide', 'appliance', 'dishwasher', 24, 34.5, 24, null, 90),
  ('0e000000-0000-4000-8000-000000000001', 'HD30', 'Range hood', 'Chimney range hood 30" wide', 'appliance', 'hood', 30, 30, 20, 66, 100),
  ('0e000000-0000-4000-8000-000000000001', 'HD36', 'Range hood', 'Chimney range hood 36" wide', 'appliance', 'hood', 36, 30, 20, 66, 110),
  ('0e000000-0000-4000-8000-000000000001', 'HD48', 'Range hood', 'Chimney range hood 48" wide', 'appliance', 'hood', 48, 30, 20, 66, 120)
on conflict (line_id, sku) do nothing;
