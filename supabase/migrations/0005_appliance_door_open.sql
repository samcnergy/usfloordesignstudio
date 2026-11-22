-- Appliances: the depth with the door fully open, from the manufacturer's spec sheet
-- (owner, 2026-11-22). The plan draws the open door to this size; blank uses a typical size.
alter table public.ds_products add column if not exists door_open numeric check (door_open is null or door_open > 0);
