-- Run after the user exists (Authentication > Users > Add user).
-- Admins can edit the catalog; everyone signed in can create and edit designs.
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
where email = 'parham@rethinkcnergy.com';
