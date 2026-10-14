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
| `src/lib/units.ts` | Inch fractions in and out (`34 1/2"`, `12'-6"`). |
| `src/lib/standard-catalog.ts` | Standard starting sizes, colors and countertops. Source for the seed SQL. |
| `src/lib/data.ts` | Every database read and write. |
| `src/components/drawing/` | Top view (`PlanView`), front views (`ElevationView`, `CabinetFront`), dimension strings, fills. |
| `src/components/editor/Editor.tsx` | The designer screen: panels, dragging, undo, keyboard, autosave. |
| `src/components/print/PrintSheet.tsx` | The printable package, US Letter landscape. |
| `src/components/app/CatalogManager.tsx` | Catalog admin with photo uploads. |
| `src/proxy.ts` | Session refresh and sign-in redirect (Next 16 name for middleware). |
| `supabase/` | Schema, seed, one-time cleanup, and the admin grant. |

### Coordinates

The top view has x to the right and y down, with the origin at the inside corner of Wall A (top) and Wall D (left). Walls are lettered clockwise. Each wall or island is a run with an origin at its left end (as seen standing in the room facing it), a direction `u` along the run and a direction `n` into the room. A cabinet's position is its offset along the run, so walls and islands share one placement model, and a front view's x axis is simply that offset.

## Database setup (once)

1. In the Supabase SQL editor for project `mvwvgzxbgdndfsmhmbfu`, run `supabase/setup_all.sql`. It clears the old staging tables, creates the `ds_` tables, policies and the `ds-images` storage bucket, and loads the standard catalog.
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
