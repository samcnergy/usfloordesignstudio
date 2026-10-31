# US Floor Design Studio

Kitchen design tool for US Floor Design Center. Designers lay out a room, add doors and windows, place cabinets and appliances in our own sizes and colors, and print a design package with a top view, a front view of every wall and island, and a cabinet list.

Separate from usfloor-platform. Own Supabase project (`mvwvgzxbgdndfsmhmbfu`, named usfloordesignstudio) and own Render service.

## Stack

Next.js 16 (App Router), React 19, TypeScript strict, Supabase (Postgres, Auth, Storage) through `@supabase/ssr`, Tailwind CSS 4 plus plain CSS in `src/app/globals.css`. Fonts are bundled from npm (`@fontsource`), so builds never call Google Fonts. Node version is pinned in `.nvmrc`.

`AGENTS.md` applies: this Next.js version differs from older ones. Read the guides in `node_modules/next/dist/docs/` before writing code.

## How it is organized

| Path | What it does |
|---|---|
| `src/lib/types.ts` | Design data model. All lengths are inches. |
| `src/lib/geometry.ts` | Walls and islands as "runs", placement, overlap and blocking checks, shop labels (B24, W3030). |
| `src/lib/place.ts` | Moving pieces: sliding along a wall, lifting one onto the open floor, turning a run, and joining a wall again. |
| `src/lib/draw.ts` | Drawing a room with the mouse: snapping, typed lengths and angles, and turning the corners into walls. |
| `src/lib/units.ts` | Inch fractions in and out (`34 1/2"`, `12'-6"`). |
| `src/lib/standard-catalog.ts` | Sample catalog for the development sandbox only. |
| `src/lib/import/` | Product import: reads CSV, Excel or pasted tables and fills sizes, doors, drawers and placement from descriptions and SKUs. |
| `src/lib/data.ts` | Every database read and write. |
| `src/components/drawing/` | Top view (`PlanView`), front views (`ElevationView`, `CabinetFront`), dimension strings, fills. |
| `src/components/editor/Editor.tsx` | The designer screen: panels, dragging, undo, keyboard, autosave. |
| `src/components/editor/RoomPanel.tsx` | Room tab: ceiling, wall thickness, and the walls with their lengths, corners and open sides. |
| `src/components/editor/DrawRoom.tsx` | Draw walls: click each corner in the top view, or type a length (and corner angle) and press Enter. |
| `src/components/print/PrintSheet.tsx` | The printable package, US Letter landscape. |
| `src/components/app/CatalogManager.tsx` | Catalog admin: manufacturers, lines, products (one row per SKU), colors, countertops. |
| `src/components/app/ImportWizard.tsx` | Catalog > Import: preview and load a manufacturer's products. |
| `src/app/api/copy-image/route.ts` | Copies vendor photos into our storage (admins only). |
| `src/proxy.ts` | Session refresh and sign-in redirect (Next 16 name for middleware). |
| `supabase/` | Schema, seed, one-time cleanup, and the admin grant. |

### Coordinates

The top view has x to the right and y down, with the origin at the left end of Wall A. A room is a list of walls walked clockwise, each with a length, the corner angle inside the room at its end (90 normal, 270 the inside corner of an L, 135 a cut corner) and an open flag for a side with no wall. The last wall always closes the shape, so its length and the corners around it are worked out (`roomShape` in `geometry.ts`). Walls keep a stable id and get their letter from their position. A room drawn with the mouse that has no level top wall keeps its angle in `rotation`, the direction of Wall A. Designs saved before this stored only width and depth; `normalizeRoom` turns those into walls A to D.

Each wall or island is a run with an origin at its left end (as seen standing in the room facing it), a direction `u` along the run and a direction `n` into the room. A cabinet's position is its offset along the run, so walls and islands share one placement model, and a front view's x axis is simply that offset.

Wall cabinets hang so their tops are at the top of the room: flush with the ceiling, or `crown` inches below it when the design has crown molding. Adding a crown molding order item sets that height and brings the wall cabinets that were at the top down with it; the crown prints as a band across them in the front views.

A run that is not a wall stands anywhere on the floor at any angle, and a piece dragged a foot clear of its wall gets a floor run of its own, so it can be moved and turned freely. Those floor runs are marked `auto` and disappear once nothing is left on them; a piece brought back against a wall joins that wall again.

## Catalog

Manufacturers have product lines (Top King has American Style and European Style). Each line has its products, one row per SKU with its real size and its door and drawer count, and its colors (with a door style: shaker, slab or raised panel). Products marked not drawn (molding, roll-out trays, toe kick) are added to a design as order items and print in the cabinet list.

To add a manufacturer's products, use Catalog > Import. Paste a table or upload a CSV or Excel file with at least a `sku` column. Anything missing is read from a `description` column in the usual vendor format (`Base Cabinet- 12"(W) x 34 1/2"(H) x 24"(D) 1 Drawer -1 Door -1 Shelf`) and from the SKU (W3036 is a wall cabinet 30 wide and 36 high). The preview shows what is new, changed and unchanged before anything is saved. Download the template from that page for the full list of columns.

The Generic manufacturer holds standard appliance sizes, available with every line.

## Database setup (once)

1. In the Supabase SQL editor for project `mvwvgzxbgdndfsmhmbfu`, run `supabase/setup_all.sql`, then `supabase/migrations/0003_catalog_by_manufacturer.sql` and `0004_topking_lines_and_colors.sql`. Then load products with Catalog > Import.
2. Authentication > Users > Add user, for each designer (tick "Auto Confirm User").
3. Run `supabase/make_admin.sql` (edit the email for other admins). Admins can edit the catalog. Everyone signed in can create and edit designs.

Later schema changes go in new numbered files under `supabase/migrations/`.

## Running it

```bash
nvm use
npm ci
cp .env.example .env.local   # then fill in the URL and publishable key
npm run dev
```

`/sandbox` (development only) opens the designer with the standard catalog and no database. `/sandbox/catalog` does the same for the catalog screen.

`npm run build`, `npx tsc --noEmit` and `npm run lint` must all pass before anything merges.

To change the standard seed, edit `src/lib/standard-catalog.ts` and run `node --experimental-strip-types scripts/generate-seed.mjs`.

## Render

Web Service, Node. Build `npm ci && npm run build`, start `npm start`. Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NODE_VERSION` (matches `.nvmrc`). The `NEXT_PUBLIC_` values are baked in at build time, so redeploy after changing them.
