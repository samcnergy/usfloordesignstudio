-- Top King Cabinets (topkingcabinets.com): the manufacturer, its two lines and its door colors.
-- Products are loaded through Catalog > Import. Color photos start as links to the vendor's
-- site; Catalog > "Copy vendor photos" stores our own copies.

insert into public.ds_manufacturers (id, name, website, notes, sort)
values ('0d000000-0000-4000-8000-000000000101', 'Top King', 'https://topkingcabinets.com', 'Top King Inc., 15303 Marquardt Ave, Santa Fe Springs, CA 90670. Tel (562) 229-1128.', 10)
on conflict (id) do nothing;

insert into public.ds_product_lines (id, manufacturer_id, name, construction, features, sort) values
  ('0e000000-0000-4000-8000-000000000101', '0d000000-0000-4000-8000-000000000101', 'American Style', 'framed',
   'Solid Chinese maple frame with MDF center panel. Glue or metal clip assembly. Full overlay doors and drawers. Under mount full extension soft close drawer glides. Soft close concealed European style hinges. 1/2" plywood box with stained exterior. UV coated interior matching the face color.', 10),
  ('0e000000-0000-4000-8000-000000000102', '0d000000-0000-4000-8000-000000000101', 'European Style', 'frameless',
   'Frameless European style. Textured wood finish (horizontal). Soft closing tandem box drawers and soft closing doors. High density fiberboard doors with thermofoil lamination. CAM lock construction, easy to assemble. Flap door options. 3/4" plywood box with stained exterior. Grey front edge banding on the box. Resistant to humidity, scratching and germs.', 20)
on conflict (id) do nothing;

insert into public.ds_finishes (id, line_id, name, vendor, color_hex, image_url, source_url, door_style, fill_mode, sort) values
  ('0f000000-0000-4000-8000-000000000101', '0e000000-0000-4000-8000-000000000101', 'White Shaker', 'Top King', '#EDEDED', 'https://topkingcabinets.com/uploads/3/4/2/0/34204042/published/white.jpg', 'https://topkingcabinets.com/white-shaker.html', 'shaker', 'color', 10),
  ('0f000000-0000-4000-8000-000000000102', '0e000000-0000-4000-8000-000000000101', 'Grey Shaker', 'Top King', '#646664', 'https://topkingcabinets.com/uploads/3/4/2/0/34204042/published/2532649.jpg', 'https://topkingcabinets.com/gray-shaker.html', 'shaker', 'color', 20),
  ('0f000000-0000-4000-8000-000000000103', '0e000000-0000-4000-8000-000000000101', 'Espresso Shaker', 'Top King', '#362518', 'https://topkingcabinets.com/uploads/3/4/2/0/34204042/published/espresso.jpg', 'https://topkingcabinets.com/espresso-shaker.html', 'shaker', 'color', 30),
  ('0f000000-0000-4000-8000-000000000104', '0e000000-0000-4000-8000-000000000101', 'Crimson Glaze', 'Top King', '#75412B', 'https://topkingcabinets.com/uploads/3/4/2/0/34204042/published/crimson-copy.jpg', 'https://topkingcabinets.com/crimson-glaze.html', 'raised', 'color', 40),
  ('0f000000-0000-4000-8000-000000000105', '0e000000-0000-4000-8000-000000000101', 'Antique White', 'Top King', '#DADBDA', 'https://topkingcabinets.com/uploads/3/4/2/0/34204042/published/antique-copy.jpg', 'https://topkingcabinets.com/antique-white.html', 'raised', 'color', 50),
  ('0f000000-0000-4000-8000-000000000111', '0e000000-0000-4000-8000-000000000102', 'Torino Grey', 'Top King', '#787570', 'https://topkingcabinets.com/uploads/3/4/2/0/34204042/published/13.jpg', 'https://topkingcabinets.com/torino-grey.html', 'slab', 'photo', 110),
  ('0f000000-0000-4000-8000-000000000112', '0e000000-0000-4000-8000-000000000102', 'Torino Dark', 'Top King', '#524743', 'https://topkingcabinets.com/uploads/3/4/2/0/34204042/published/15.jpg', 'https://topkingcabinets.com/torino-dark.html', 'slab', 'photo', 120),
  ('0f000000-0000-4000-8000-000000000113', '0e000000-0000-4000-8000-000000000102', 'White Pet', 'Top King', '#F9F9F9', 'https://topkingcabinets.com/uploads/3/4/2/0/34204042/published/16.jpg', 'https://topkingcabinets.com/white-pet.html', 'slab', 'color', 130),
  ('0f000000-0000-4000-8000-000000000114', '0e000000-0000-4000-8000-000000000102', 'Matte Black', 'Top King', '#292A2F', 'https://topkingcabinets.com/uploads/3/4/2/0/34204042/published/matte-black.png', 'https://topkingcabinets.com/matte-black.html', 'slab', 'color', 140),
  ('0f000000-0000-4000-8000-000000000115', '0e000000-0000-4000-8000-000000000102', 'White Oak', 'Top King', '#C6A882', 'https://topkingcabinets.com/uploads/3/4/2/0/34204042/published/nautral-oak.jpg', 'https://topkingcabinets.com/natural-oak.html', 'slab', 'photo', 150)
on conflict (id) do nothing;
