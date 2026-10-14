"use client";

// Catalog admin: cabinet lines and sizes, cabinet colors, countertops, each with an optional photo.
// Admins edit; everyone else can look. Row-level security enforces the same rule in the database.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { uploadImage } from "@/lib/data";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Catalog, CatalogCabinet, Category, Countertop, Finish, Style } from "@/lib/types";
import { fmtIn, parseLength } from "@/lib/units";

type Kind = "cabinets" | "finishes" | "countertops";

const STYLE_LABEL: Record<Style, string> = {
  base: "Base: drawer over door(s)",
  drawer_base: "Base: three drawers",
  sink_base: "Base: sink (false front)",
  blind_corner_base: "Base: blind corner",
  wall: "Wall: door(s)",
  wall_blind_corner: "Wall: blind corner",
  tall_pantry: "Tall: pantry",
  tall_oven: "Tall: oven cabinet",
  range: "Appliance: range",
  refrigerator: "Appliance: refrigerator",
  dishwasher: "Appliance: dishwasher",
  hood: "Appliance: range hood",
  filler: "Filler",
  panel: "End panel",
};
const CATEGORIES: Category[] = ["base", "wall", "tall", "appliance", "filler"];

const TABLE: Record<Kind, string> = { cabinets: "ds_cabinets", finishes: "ds_finishes", countertops: "ds_countertops" };

function parseList(s: string): number[] | null {
  const parts = s
    .split(/[,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const out: number[] = [];
  for (const p of parts) {
    const v = parseLength(p);
    if (v === null || v <= 0) return null;
    out.push(v);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

const fmtList = (a: number[]) => a.map((v) => fmtIn(v, false)).join(", ");

function Thumb({ url }: { url: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img className="thumb" src={url} alt="" /> : <span className="thumb-empty">none</span>;
}

export function CatalogManager({ catalog, admin }: { catalog: Catalog; admin: boolean }) {
  const [kind, setKind] = useState<Kind>("cabinets");
  const [editing, setEditing] = useState<{ kind: Kind; row: Record<string, unknown> | null } | null>(null);

  return (
    <>
      {!admin && (
        <div className="error-box" style={{ marginBottom: 16 }}>
          You can view the catalog. Only an admin can change it.
        </div>
      )}
      <div className="cat-admin-tabs">
        {(
          [
            ["cabinets", `Cabinets and appliances (${catalog.cabinets.length})`],
            ["finishes", `Cabinet colors (${catalog.finishes.length})`],
            ["countertops", `Countertops (${catalog.countertops.length})`],
          ] as [Kind, string][]
        ).map(([k, label]) => (
          <button key={k} className={`chip ${kind === k ? "chip-on" : ""}`} onClick={() => setKind(k)}>
            {label}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {admin && (
          <button className="btn btn-primary" onClick={() => setEditing({ kind, row: null })}>
            Add {kind === "cabinets" ? "cabinet" : kind === "finishes" ? "color" : "countertop"}
          </button>
        )}
      </div>

      {kind === "cabinets" && (
        <table className="table">
          <thead>
            <tr>
              <th>Photo</th>
              <th>Code</th>
              <th>Name</th>
              <th>Widths</th>
              <th>Heights</th>
              <th>Depth</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {catalog.cabinets.map((c) => (
              <tr key={c.id} className={c.active ? "" : "inactive"}>
                <td>
                  <Thumb url={c.image_url} />
                </td>
                <td className="tabular">
                  <b>{c.code}</b>
                </td>
                <td>
                  {c.name}
                  <div className="muted">
                    {STYLE_LABEL[c.style]}
                    {c.mount_height ? ` · hung at ${fmtIn(c.mount_height)}` : ""}
                    {c.active ? "" : " · hidden"}
                  </div>
                </td>
                <td className="tabular">{fmtList(c.widths)}</td>
                <td className="tabular">{fmtList(c.heights)}</td>
                <td className="tabular">{fmtIn(c.depth)}</td>
                <td>{admin && <EditButton onClick={() => setEditing({ kind: "cabinets", row: c as unknown as Record<string, unknown> })} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {kind !== "cabinets" && (
        <table className="table">
          <thead>
            <tr>
              <th>Photo</th>
              <th>Color</th>
              <th>Name</th>
              {kind === "finishes" ? <th>Vendor</th> : <th>Thickness</th>}
              <th />
            </tr>
          </thead>
          <tbody>
            {(kind === "finishes" ? catalog.finishes : catalog.countertops).map((f) => (
              <tr key={f.id} className={f.active ? "" : "inactive"}>
                <td>
                  <Thumb url={f.image_url} />
                </td>
                <td>
                  <span className="swatch" style={{ width: 30, height: 30, background: f.color_hex }} />
                </td>
                <td>
                  <b>{f.name}</b>
                  {f.active ? "" : <span className="muted"> · hidden</span>}
                </td>
                <td>{kind === "finishes" ? ((f as Finish).vendor ?? "") : fmtIn((f as Countertop).thickness)}</td>
                <td>{admin && <EditButton onClick={() => setEditing({ kind, row: f as unknown as Record<string, unknown> })} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {editing && <EditModal kind={editing.kind} row={editing.row} onClose={() => setEditing(null)} />}
    </>
  );
}

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="row-actions">
      <button className="btn btn-ghost btn-small" onClick={onClick}>
        Edit
      </button>
    </div>
  );
}

function EditModal({ kind, row, onClose }: { kind: Kind; row: Record<string, unknown> | null; onClose: () => void }) {
  const router = useRouter();
  const sb = getSupabaseBrowserClient();
  const cab = row as unknown as CatalogCabinet | null;
  const fin = row as unknown as (Finish & Countertop) | null;

  const [code, setCode] = useState(cab?.code ?? "");
  const [name, setName] = useState((row?.name as string) ?? "");
  const [category, setCategory] = useState<Category>(cab?.category ?? "base");
  const [style, setStyle] = useState<Style>(cab?.style ?? "base");
  const [widths, setWidths] = useState(cab ? fmtList(cab.widths) : "");
  const [heights, setHeights] = useState(cab ? fmtList(cab.heights) : "");
  const [defaultHeight, setDefaultHeight] = useState(cab ? fmtIn(cab.default_height, false) : "");
  const [depth, setDepth] = useState(cab ? fmtIn(cab.depth, false) : "24");
  const [mount, setMount] = useState(cab?.mount_height ? fmtIn(cab.mount_height, false) : "");
  const [vendor, setVendor] = useState(fin?.vendor ?? "");
  const [color, setColor] = useState(fin?.color_hex ?? "#F3F1EA");
  const [thickness, setThickness] = useState(fin?.thickness ? fmtIn(fin.thickness, false) : "1 1/2");
  const [imageUrl, setImageUrl] = useState<string | null>((row?.image_url as string) ?? null);
  const [sort, setSort] = useState(String((row?.sort as number) ?? 100));
  const [active, setActive] = useState((row?.active as boolean) ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = `${row ? "Edit" : "Add"} ${kind === "cabinets" ? "cabinet" : kind === "finishes" ? "cabinet color" : "countertop"}`;

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    const sortN = parseInt(sort, 10);
    let payload: Record<string, unknown>;
    if (kind === "cabinets") {
      const w = parseList(widths);
      const h = parseList(heights);
      const d = parseLength(depth);
      const dh = parseLength(defaultHeight || (h ? String(h[0]) : ""));
      const m = mount.trim() ? parseLength(mount) : null;
      if (!code.trim()) return setError("Code is required, for example B or W.");
      if (!w) return setError("Widths must be sizes separated by commas, for example 12, 15, 18.");
      if (!h) return setError("Heights must be sizes separated by commas, for example 30, 36, 42.");
      if (!d || d <= 0) return setError("Depth must be a size, for example 24.");
      if (!dh || !h.includes(dh)) return setError("Default height must be one of the heights.");
      if (mount.trim() && (m === null || m < 0)) return setError("Hung at must be a height from the floor, or left blank for floor pieces.");
      payload = { code: code.trim().toUpperCase(), name: name.trim(), category, style, widths: w, heights: h, default_height: dh, depth: d, mount_height: m && m > 0 ? m : null };
    } else {
      if (!/^#[0-9a-f]{6}$/i.test(color)) return setError("Color must be a hex value like #F3F1EA.");
      payload = { name: name.trim(), color_hex: color.toUpperCase() };
      if (kind === "finishes") payload.vendor = vendor.trim() || null;
      else {
        const t = parseLength(thickness);
        if (!t || t <= 0) return setError("Thickness must be a size, for example 1 1/2.");
        payload.thickness = t;
      }
    }
    payload.image_url = imageUrl;
    payload.sort = Number.isFinite(sortN) ? sortN : 100;
    payload.active = active;

    setBusy(true);
    const q = row ? sb.from(TABLE[kind]).update(payload).eq("id", row.id as string) : sb.from(TABLE[kind]).insert(payload);
    const { error: err } = await q;
    setBusy(false);
    if (err) return setError(err.message);
    onClose();
    router.refresh();
  };

  const remove = async () => {
    if (!row) return;
    if (!window.confirm(`Delete "${name}" from the catalog? Saved designs keep their drawings. Use Hide instead if you may need it again.`)) return;
    setBusy(true);
    const { error: err } = await sb.from(TABLE[kind]).delete().eq("id", row.id as string);
    setBusy(false);
    if (err) return setError(err.message);
    onClose();
    router.refresh();
  };

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <h2>{title}</h2>

        {kind === "cabinets" && (
          <div className="grid2">
            <label className="field">
              <span className="field-label">Code</span>
              <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="B, W, SB..." />
            </label>
            <label className="field">
              <span className="field-label">Name</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Group</span>
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c[0].toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Drawn as</span>
              <select className="input" value={style} onChange={(e) => setStyle(e.target.value as Style)}>
                {(Object.keys(STYLE_LABEL) as Style[]).map((s) => (
                  <option key={s} value={s}>
                    {STYLE_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Widths available</span>
              <input className="input tabular" value={widths} onChange={(e) => setWidths(e.target.value)} placeholder="9, 12, 15, 18, 21, 24" />
            </label>
            <label className="field">
              <span className="field-label">Heights available</span>
              <input className="input tabular" value={heights} onChange={(e) => setHeights(e.target.value)} placeholder="30, 36, 42" />
            </label>
            <label className="field">
              <span className="field-label">Default height</span>
              <input className="input tabular" value={defaultHeight} onChange={(e) => setDefaultHeight(e.target.value)} placeholder="30" />
            </label>
            <label className="field">
              <span className="field-label">Depth</span>
              <input className="input tabular" value={depth} onChange={(e) => setDepth(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Hung at (floor to bottom)</span>
              <input className="input tabular" value={mount} onChange={(e) => setMount(e.target.value)} placeholder="Blank for floor pieces, 54 for wall" />
            </label>
          </div>
        )}

        {kind !== "cabinets" && (
          <div className="grid2">
            <label className="field" style={{ gridColumn: "1 / -1" }}>
              <span className="field-label">Name</span>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Color</span>
              <span style={{ display: "flex", gap: 8 }}>
                <input type="color" value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#FFFFFF"} onChange={(e) => setColor(e.target.value.toUpperCase())} style={{ width: 44, height: 38, padding: 0, border: "1px solid var(--line)" }} />
                <input className="input tabular" value={color} onChange={(e) => setColor(e.target.value)} />
              </span>
            </label>
            {kind === "finishes" ? (
              <label className="field">
                <span className="field-label">Vendor / line</span>
                <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} />
              </label>
            ) : (
              <label className="field">
                <span className="field-label">Thickness</span>
                <input className="input tabular" value={thickness} onChange={(e) => setThickness(e.target.value)} />
              </label>
            )}
          </div>
        )}

        <div className="field">
          <span className="field-label">Photo</span>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Thumb url={imageUrl} />
            <label className="btn btn-secondary btn-small">
              {imageUrl ? "Replace photo" : "Upload photo"}
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  setBusy(true);
                  setError(null);
                  try {
                    setImageUrl(await uploadImage(sb, kind, file));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Upload failed.");
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
            {imageUrl && (
              <button className="btn btn-ghost btn-small" onClick={() => setImageUrl(null)}>
                Remove photo
              </button>
            )}
          </div>
          <span className="field-hint">
            {kind === "cabinets"
              ? "Shown in the designer's cabinet list."
              : "A close-up of the material. It fills the cabinets or countertop in the drawings, tiled every " + (kind === "finishes" ? '24".' : '48".')}
          </span>
        </div>

        <div className="grid2">
          <label className="field">
            <span className="field-label">List order</span>
            <input className="input tabular" value={sort} onChange={(e) => setSort(e.target.value)} />
          </label>
          <label className="field" style={{ justifyContent: "flex-end" }}>
            <span style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 38 }}>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Show in the designer
            </span>
          </label>
        </div>

        {error && <div className="error-box">{error}</div>}

        <div className="modal-actions">
          {row && (
            <button className="btn btn-danger" onClick={remove} disabled={busy} style={{ marginRight: "auto" }}>
              Delete
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? "Working..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
