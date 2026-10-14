<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# US Floor Design Studio rules

- All lengths are inches, stored as decimals and shown to the nearest 1/8" with `fmtIn`.
- Never use em dashes in any user-facing text.
- Database tables start with `ds_`. Schema changes go in a new numbered file in `supabase/migrations/`.
- Saved designs keep a snapshot of each cabinet (code, size, style) so catalog edits never change an existing drawing.
- `npm run build`, `npx tsc --noEmit` and `npm run lint` must pass.
