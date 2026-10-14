"use client";

// Catalog admin: manufacturers and their product lines, each line's products (one row
// per SKU) and colors, plus countertops. Admins edit; everyone else can look. Row level
// security enforces the same rule in the database.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { uploadImage } from "@/lib/data";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Catalog, Category, Style } from "@/lib/types";
import { CATEGORIES, STYLES } from "@/lib/types";
import { fmtIn, parseLength } from "@/lib/units";

export const STYLE_LABEL: Record<Style, string> = {
  base: "Base: drawer row over doors, or doors only",
  drawer_base: "Base: drawers only",
  sink_base: "Base: sink (false front)",
  blind_corner_base: "Base: blind corner",
  lazy_susan: "Base: lazy susan corner",
  open_shelf: "Open end shelves",
  wall: "Wall: doors",
  wall_blind_corner: "Wall: blind corner",
  wall_diagonal: "Wall: diagonal corner",
  wall_microwave: "Wall: microwave cabinet",
  wine_rack: "Wine rack",
  plate_rack: "Plate rack",
  tall_pantry: "Tall: pantry",
  tall_oven: "Tall: oven cabinet",
  vanity_combo: "Vanity: drawers and doors",
  range: "Appliance: range",
  refrigerator: "Appliance: refrigerator",
  dishwasher: "Appliance: dishwasher",
  hood: "Appliance: range hood",
  filler: "Filler",
  panel: "Panel",
  accessory: "Accessory (not drawn)",
};

export const CATEGORY_NAME: Record<Category, string> = {
  base: "Base",
  wall: "Wall",
  tall: "Tall",
  vanity: "Vanity",
  appliance: "Appliance",
  filler: "Filler",
  panel: "Panel",
  accessory: "Accessory",
};

type Table = "ds_manufacturers" | "ds_product_lines" | "ds_products" | "ds_finishes" | "ds_countertops";

type FieldType = "text" | "textarea" | "length" | "int" | "select" | "bool" | "color" | "image";
interface FieldSpec {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
  wide?: boolean;
}

const PRODUCT_FIELDS: FieldSpec[] = [
  { key: "sku", label: "SKU", type: "text", required: true },
  { key: "name", label: "Name", type: "text", required: true },
  { key: "description", label: "Description", type: "textarea", wide: true },
  { key: "category", label: "Group", type: "select", required: true, options: CATEGORIES.map((c) => ({ value: c, label: CATEGORY_NAME[c] })) },
  { key: "style", label: "Drawn as", type: "select", required: true, options: STYLES.map((s) => ({ value: s, label: STYLE_LABEL[s] })) },
  { key: "width", label: "Width", type: "length" },
  { key: "height", label: "Height", type: "length" },
  { key: "depth", label: "Depth", type: "length" },
  { key: "mount_height", label: "Hung at (floor to bottom)", type: "length", hint: "Blank for pieces that stand on the floor" },
  { key: "doors", label: "Doors", type: "int" },
  { key: "drawers", label: "Drawers", type: "int" },
  { key: "shelves", label: "Shelves", type: "int" },
  { key: "split_height", label: "Lower box height", type: "length", hint: "Tall cabinets built as two boxes" },
  { key: "placeable", label: "Drawn in the plan", type: "bool", hint: "Off for order-only items like molding" },
  { key: "image_url", label: "Photo", type: "image", wide: true },
  { key: "source_url", label: "Vendor page", type: "text", wide: true },
  { key: "sort", label: "List order", type: "int" },
  { key: "active", label: "Show in the designer", type: "bool" },
];

const FINISH_FIELDS: FieldSpec[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "vendor", label: "Vendor", type: "text" },
  { key: "color_hex", label: "Color", type: "color", required: true },
  {
    key: "door_style",
    label: "Door style",
    type: "select",
    required: true,
    options: [
      { value: "shaker", label: "Shaker (flat center panel)" },
      { value: "slab", label: "Slab (flat, frameless look)" },
      { value: "raised", label: "Raised panel" },
    ],
  },
  {
    key: "fill_mode",
    label: "Drawings use",
    type: "select",
    required: true,
    options: [
      { value: "color", label: "The color" },
      { value: "photo", label: "The photo as a texture (wood grains)" },
    ],
  },
  { key: "image_url", label: "Swatch photo", type: "image", wide: true },
  { key: "source_url", label: "Vendor page", type: "text", wide: true },
  { key: "sort", label: "List order", type: "int" },
  { key: "active", label: "Show in the designer", type: "bool" },
];

const COUNTERTOP_FIELDS: FieldSpec[] = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "color_hex", label: "Color", type: "color", required: true },
  { key: "thickness", label: "Thickness", type: "length", required: true },
  { key: "image_url", label: "Photo", type: "image", wide: true },
  { key: "sort", label: "List order", type: "int" },
  { key: "active", label: "Show in the designer", type: "bool" },
];

const LINE_FIELDS: FieldSpec[] = [
  { key: "name", label: "Line name", type: "text", required: true },
  {
    key: "construction",
    label: "Construction",
    type: "select",
    required: true,
    options: [
      { value: "framed", label: "Framed (American)" },
      { value: "frameless", label: "Frameless (European)" },
      { value: "other", label: "Other" },
    ],
  },
  { key: "features", label: "Features", type: "textarea", wide: true },
  { key: "sort", label: "List order", type: "int" },
  { key: "active", label: "Show in the designer", type: "bool" },
];

const MAKER_FIELDS: FieldSpec[] = [
  { key: "name", label: "Manufacturer", type: "text", required: true },
  { key: "website", label: "Website", type: "text" },
  { key: "notes", label: "Notes (contact, terms)", type: "textarea", wide: true },
  { key: "sort", label: "List order", type: "int" },
  { key: "active", label: "Show in the designer", type: "bool" },
];

interface Editing {
  table: Table;
  title: string;
  fields: FieldSpec[];
  row: Record<string, unknown> | null; // null = new
  fixed: Record<string, unknown>; // values set for new rows (line_id, manufacturer_id)
  folder: string;
}

function Thumb({ url, size = 44 }: { url: string | null; size?: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="thumb" style={{ width: size, height: size }} src={url} alt="" loading="lazy" />
  ) : (
    <span className="thumb-empty" style={{ width: size, height: size }}>
      none
    </span>
  );
}

const ownStorage = (url: string | null) => !!url && url.includes("/storage/v1/object/public/ds-images/");

export function CatalogManager({ catalog, admin }: { catalog: Catalog; admin: boolean }) {
  const router = useRouter();
  const firstLine = catalog.lines.find((l) => catalog.products.some((p) => p.line_id === l.id && p.category !== "appliance")) ?? catalog.lines[0];
  const [lineId, setLineId] = useState<string | "countertops">(firstLine?.id ?? "countertops");
  const [tab, setTab] = useState<"products" | "colors" | "line">("products");
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<Category | "">("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [copying, setCopying] = useState<{ done: number; total: number; failed: number } | null>(null);

  const line = catalog.lines.find((l) => l.id === lineId);
  const maker = catalog.manufacturers.find((m) => m.id === line?.manufacturer_id);
  const products = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.products
      .filter((p) => p.line_id === lineId)
      .filter((p) => !cat || p.category === cat)
      .filter((p) => !q || p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q))
      .sort((a, b) => a.sort - b.sort || a.sku.localeCompare(b.sku, undefined, { numeric: true }));
  }, [catalog.products, lineId, cat, search]);
  const finishes = catalog.finishes.filter((f) => f.line_id === lineId);

  const external = [
    ...catalog.products.filter((p) => p.image_url && !ownStorage(p.image_url)).map((p) => ({ table: "ds_products" as Table, id: p.id, url: p.image_url!, folder: `products/${p.line_id}` })),
    ...catalog.finishes.filter((f) => f.image_url && !ownStorage(f.image_url)).map((f) => ({ table: "ds_finishes" as Table, id: f.id, url: f.image_url!, folder: "finishes" })),
    ...catalog.countertops.filter((c) => c.image_url && !ownStorage(c.image_url)).map((c) => ({ table: "ds_countertops" as Table, id: c.id, url: c.image_url!, folder: "countertops" })),
  ];

  const copyPhotos = async () => {
    const sb = getSupabaseBrowserClient();
    const queue = [...external];
    const total = queue.length;
    let done = 0;
    let failed = 0;
    setCopying({ done, total, failed });
    const worker = async () => {
      for (let job = queue.shift(); job; job = queue.shift()) {
        try {
          const res = await fetch("/api/copy-image", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: job.url, folder: job.folder }) });
          const out = await res.json();
          if (!res.ok || !out.url) throw new Error(out.error ?? "failed");
          const { error } = await sb.from(job.table).update({ image_url: out.url }).eq("id", job.id);
          if (error) throw error;
        } catch {
          failed++;
        }
        done++;
        setCopying({ done, total, failed });
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    router.refresh();
  };

  const makersSorted = [...catalog.manufacturers].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));

  return (
    <>
      {!admin && (
        <div className="error-box" style={{ marginBottom: 16 }}>
          You can view the catalog. Only an admin can change it.
        </div>
      )}
      {admin && (
        <div className="cat-actions">
          <Link className="btn btn-primary" href="/catalog/import">
            Import products
          </Link>
          <button
            className="btn btn-secondary"
            onClick={() => setEditing({ table: "ds_manufacturers", title: "Add manufacturer", fields: MAKER_FIELDS, row: null, fixed: { sort: 100, active: true }, folder: "" })}
          >
            Add manufacturer
          </button>
          {external.length > 0 && (
            <button className="btn btn-secondary" disabled={!!copying && copying.done < copying.total} onClick={copyPhotos}>
              {copying && copying.done < copying.total
                ? `Copying photos ${copying.done} of ${copying.total}...`
                : `Copy ${external.length} vendor photo${external.length === 1 ? "" : "s"} to our storage`}
            </button>
          )}
          {copying && copying.done === copying.total && (
            <span className="muted">
              Copied {copying.total - copying.failed} of {copying.total}.{copying.failed ? ` ${copying.failed} could not be copied and still link to the vendor.` : ""}
            </span>
          )}
        </div>
      )}

      <div className="cat-layout">
        <nav className="cat-nav" aria-label="Manufacturers and lines">
          {makersSorted.map((m) => (
            <div key={m.id} className="cat-nav-group">
              <div className="cat-nav-maker">
                <span>{m.name}</span>
                {admin && (
                  <button className="link-btn" onClick={() => setEditing({ table: "ds_manufacturers", title: `Edit ${m.name}`, fields: MAKER_FIELDS, row: m as unknown as Record<string, unknown>, fixed: {}, folder: "" })}>
                    Edit
                  </button>
                )}
              </div>
              {catalog.lines
                .filter((l) => l.manufacturer_id === m.id)
                .sort((a, b) => a.sort - b.sort)
                .map((l) => (
                  <button key={l.id} className={`cat-nav-line ${lineId === l.id ? "cat-nav-on" : ""}`} onClick={() => setLineId(l.id)}>
                    <span>{l.name}</span>
                    <span className="muted tabular">{catalog.products.filter((p) => p.line_id === l.id).length}</span>
                  </button>
                ))}
              {admin && (
                <button
                  className="link-btn cat-nav-add"
                  onClick={() => setEditing({ table: "ds_product_lines", title: `Add a line to ${m.name}`, fields: LINE_FIELDS, row: null, fixed: { manufacturer_id: m.id, construction: "framed", sort: 100, active: true }, folder: "" })}
                >
                  + Add line
                </button>
              )}
            </div>
          ))}
          <div className="cat-nav-group">
            <button className={`cat-nav-line ${lineId === "countertops" ? "cat-nav-on" : ""}`} onClick={() => setLineId("countertops")}>
              <span>Countertops</span>
              <span className="muted tabular">{catalog.countertops.length}</span>
            </button>
          </div>
        </nav>

        <section className="cat-main">
          {lineId === "countertops" ? (
            <>
              <div className="cat-main-head">
                <h2 className="cat-h2">Countertops</h2>
                {admin && (
                  <button className="btn btn-primary btn-small" onClick={() => setEditing({ table: "ds_countertops", title: "Add countertop", fields: COUNTERTOP_FIELDS, row: null, fixed: { thickness: 1.5, sort: 100, active: true, color_hex: "#EEEEEE" }, folder: "countertops" })}>
                    Add countertop
                  </button>
                )}
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Photo</th>
                    <th>Color</th>
                    <th>Name</th>
                    <th>Thickness</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {catalog.countertops.map((c) => (
                    <tr key={c.id} className={c.active ? "" : "inactive"}>
                      <td>
                        <Thumb url={c.image_url} />
                      </td>
                      <td>
                        <span className="swatch" style={{ width: 30, height: 30, background: c.color_hex }} />
                      </td>
                      <td>
                        <b>{c.name}</b>
                      </td>
                      <td className="tabular">{fmtIn(c.thickness)}</td>
                      <td>
                        {admin && (
                          <EditBtn onClick={() => setEditing({ table: "ds_countertops", title: `Edit ${c.name}`, fields: COUNTERTOP_FIELDS, row: c as unknown as Record<string, unknown>, fixed: {}, folder: "countertops" })} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : line ? (
            <>
              <div className="cat-main-head">
                <div>
                  <h2 className="cat-h2">
                    {maker?.name} {line.name}
                  </h2>
                  <div className="muted">
                    {line.construction === "frameless" ? "Frameless" : line.construction === "framed" ? "Framed" : "Other"}
                    {line.active ? "" : " · hidden from designers"}
                  </div>
                </div>
              </div>
              <div className="cat-admin-tabs">
                <button className={`chip ${tab === "products" ? "chip-on" : ""}`} onClick={() => setTab("products")}>
                  Products ({catalog.products.filter((p) => p.line_id === line.id).length})
                </button>
                <button className={`chip ${tab === "colors" ? "chip-on" : ""}`} onClick={() => setTab("colors")}>
                  Colors ({finishes.length})
                </button>
                <button className={`chip ${tab === "line" ? "chip-on" : ""}`} onClick={() => setTab("line")}>
                  About this line
                </button>
              </div>

              {tab === "products" && (
                <>
                  <div className="cat-filters">
                    <input className="input" type="search" placeholder="Search SKU, name or description" value={search} onChange={(e) => setSearch(e.target.value)} />
                    <select className="input" value={cat} onChange={(e) => setCat(e.target.value as Category | "")} aria-label="Group">
                      <option value="">All groups</option>
                      {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_NAME[c]}
                        </option>
                      ))}
                    </select>
                    {admin && (
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() =>
                          setEditing({
                            table: "ds_products",
                            title: `Add product to ${line.name}`,
                            fields: PRODUCT_FIELDS,
                            row: null,
                            fixed: { line_id: line.id, category: "base", style: "base", doors: 0, drawers: 0, shelves: 0, placeable: true, sort: 1000, active: true },
                            folder: `products/${line.id}`,
                          })
                        }
                      >
                        Add one product
                      </button>
                    )}
                  </div>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Photo</th>
                        <th>SKU</th>
                        <th>Name</th>
                        <th>W x H x D</th>
                        <th>Doors / drawers</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {products.map((p) => (
                        <tr key={p.id} className={p.active ? "" : "inactive"}>
                          <td>
                            <Thumb url={p.image_url} />
                          </td>
                          <td className="tabular">
                            <b>{p.sku}</b>
                          </td>
                          <td>
                            {p.name}
                            <div className="muted">
                              {STYLE_LABEL[p.style]}
                              {p.mount_height ? ` · hung at ${fmtIn(p.mount_height)}` : ""}
                              {p.placeable ? "" : " · order only"}
                              {p.active ? "" : " · hidden"}
                            </div>
                          </td>
                          <td className="tabular">{p.width !== null ? `${fmtIn(p.width, false)} x ${p.height !== null ? fmtIn(p.height, false) : "?"} x ${p.depth !== null ? fmtIn(p.depth, false) : "?"}` : ""}</td>
                          <td className="tabular">{p.doors || p.drawers ? `${p.doors} / ${p.drawers}` : ""}</td>
                          <td>
                            {admin && (
                              <EditBtn
                                onClick={() =>
                                  setEditing({ table: "ds_products", title: `Edit ${p.sku}`, fields: PRODUCT_FIELDS, row: p as unknown as Record<string, unknown>, fixed: {}, folder: `products/${p.line_id}` })
                                }
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                      {!products.length && (
                        <tr>
                          <td colSpan={6} className="muted">
                            {search || cat ? "Nothing matches." : "No products in this line yet. Use Import products to load a price list."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </>
              )}

              {tab === "colors" && (
                <>
                  {admin && (
                    <div className="cat-filters">
                      <button
                        className="btn btn-secondary btn-small"
                        onClick={() =>
                          setEditing({
                            table: "ds_finishes",
                            title: `Add color to ${line.name}`,
                            fields: FINISH_FIELDS,
                            row: null,
                            fixed: { line_id: line.id, vendor: maker?.name ?? null, color_hex: "#EEEEEE", door_style: line.construction === "frameless" ? "slab" : "shaker", fill_mode: "color", sort: 100, active: true },
                            folder: "finishes",
                          })
                        }
                      >
                        Add color
                      </button>
                    </div>
                  )}
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Photo</th>
                        <th>Color</th>
                        <th>Name</th>
                        <th>Door style</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {finishes.map((f) => (
                        <tr key={f.id} className={f.active ? "" : "inactive"}>
                          <td>
                            <Thumb url={f.image_url} />
                          </td>
                          <td>
                            <span className="swatch" style={{ width: 30, height: 30, background: f.color_hex }} />
                          </td>
                          <td>
                            <b>{f.name}</b>
                            {f.fill_mode === "photo" && <div className="muted">Drawn with the photo texture</div>}
                          </td>
                          <td>{f.door_style === "shaker" ? "Shaker" : f.door_style === "slab" ? "Slab" : "Raised panel"}</td>
                          <td>{admin && <EditBtn onClick={() => setEditing({ table: "ds_finishes", title: `Edit ${f.name}`, fields: FINISH_FIELDS, row: f as unknown as Record<string, unknown>, fixed: {}, folder: "finishes" })} />}</td>
                        </tr>
                      ))}
                      {!finishes.length && (
                        <tr>
                          <td colSpan={5} className="muted">
                            No colors for this line yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </>
              )}

              {tab === "line" && (
                <div className="card stack">
                  <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{line.features || <span className="muted">No features written yet.</span>}</p>
                  {maker?.website && (
                    <a href={maker.website} target="_blank" rel="noreferrer">
                      {maker.website}
                    </a>
                  )}
                  {admin && (
                    <div>
                      <button className="btn btn-secondary btn-small" onClick={() => setEditing({ table: "ds_product_lines", title: `Edit ${line.name}`, fields: LINE_FIELDS, row: line as unknown as Record<string, unknown>, fixed: {}, folder: "" })}>
                        Edit line
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="muted">Add a manufacturer to get started.</p>
          )}
        </section>
      </div>

      {editing && <EditModal editing={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function EditBtn({ onClick }: { onClick: () => void }) {
  return (
    <div className="row-actions">
      <button className="btn btn-ghost btn-small" onClick={onClick}>
        Edit
      </button>
    </div>
  );
}

function toText(v: unknown, type: FieldType): string {
  if (v === null || v === undefined) return "";
  if (type === "length") return fmtIn(Number(v), false);
  return String(v);
}

function EditModal({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const router = useRouter();
  const sb = getSupabaseBrowserClient();
  const { table, title, fields, row, fixed, folder } = editing;
  const start = { ...fixed, ...(row ?? {}) };
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, toText(start[f.key], f.type)])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setError(null);
    const payload: Record<string, unknown> = row ? {} : { ...fixed };
    for (const f of fields) {
      const raw = (values[f.key] ?? "").trim();
      if (f.required && raw === "") return setError(`${f.label} is required.`);
      switch (f.type) {
        case "length": {
          if (raw === "") payload[f.key] = null;
          else {
            const v = parseLength(raw);
            if (v === null || v <= 0) return setError(`${f.label} must be a size like 34 1/2.`);
            payload[f.key] = v;
          }
          break;
        }
        case "int": {
          if (raw === "") payload[f.key] = f.key === "sort" ? 100 : 0;
          else {
            const v = parseInt(raw, 10);
            if (!Number.isFinite(v) || v < 0) return setError(`${f.label} must be a whole number.`);
            payload[f.key] = v;
          }
          break;
        }
        case "bool":
          payload[f.key] = raw === "true";
          break;
        case "color":
          if (!/^#[0-9a-f]{6}$/i.test(raw)) return setError("Color must be a hex value like #F3F1EA.");
          payload[f.key] = raw.toUpperCase();
          break;
        default:
          payload[f.key] = raw === "" ? null : raw;
      }
    }
    if (table === "ds_products" && payload.placeable && (payload.width === null || payload.height === null || payload.depth === null)) {
      return setError("A product that is drawn needs a width, height and depth. Fill them in, or turn off Drawn in the plan.");
    }
    setBusy(true);
    const q = row ? sb.from(table).update(payload).eq("id", row.id as string) : sb.from(table).insert(payload);
    const { error: err } = await q;
    setBusy(false);
    if (err) return setError(err.code === "23505" ? "That name or SKU already exists here." : err.message);
    onClose();
    router.refresh();
  };

  const remove = async () => {
    if (!row) return;
    const extra =
      table === "ds_manufacturers"
        ? " This also deletes all of its lines, products and the link from its colors."
        : table === "ds_product_lines"
          ? " This also deletes every product in the line."
          : " Saved designs keep their drawings.";
    if (!window.confirm(`Delete this permanently?${extra} To keep it but stop designers using it, turn off Show in the designer instead.`)) return;
    setBusy(true);
    const { error: err } = await sb.from(table).delete().eq("id", row.id as string);
    setBusy(false);
    if (err) return setError(err.message);
    onClose();
    router.refresh();
  };

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        <div className="grid2">
          {fields.map((f) => (
            <div key={f.key} className="field" style={f.wide || f.type === "textarea" ? { gridColumn: "1 / -1" } : undefined}>
              <span className="field-label">{f.label}</span>
              {f.type === "textarea" ? (
                <textarea className="input" rows={3} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} />
              ) : f.type === "select" ? (
                <select className="input" value={values[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                  {f.options!.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === "bool" ? (
                <label style={{ display: "flex", gap: 8, alignItems: "center", minHeight: 38 }}>
                  <input type="checkbox" checked={values[f.key] === "true"} onChange={(e) => set(f.key, e.target.checked ? "true" : "false")} /> Yes
                </label>
              ) : f.type === "color" ? (
                <span style={{ display: "flex", gap: 8 }}>
                  <input
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(values[f.key]) ? values[f.key] : "#FFFFFF"}
                    onChange={(e) => set(f.key, e.target.value.toUpperCase())}
                    style={{ width: 44, height: 38, padding: 0, border: "1px solid var(--line)" }}
                  />
                  <input className="input tabular" value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} />
                </span>
              ) : f.type === "image" ? (
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <Thumb url={values[f.key] || null} />
                  <label className="btn btn-secondary btn-small">
                    {values[f.key] ? "Replace" : "Upload"}
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
                          set(f.key, await uploadImage(sb, folder || "catalog", file));
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Upload failed.");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    />
                  </label>
                  <input className="input" style={{ flex: 1, minWidth: 180 }} placeholder="or paste an image address" value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} />
                </div>
              ) : (
                <input className={`input ${f.type === "length" || f.type === "int" ? "tabular" : ""}`} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)} />
              )}
              {f.hint && <span className="field-hint">{f.hint}</span>}
            </div>
          ))}
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
