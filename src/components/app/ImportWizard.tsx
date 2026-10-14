"use client";

// Catalog > Import: load a manufacturer's products from a CSV or Excel file, or from a
// table pasted from a spreadsheet or a vendor website. Each row needs a SKU; everything
// else can come from explicit columns or be read out of the description. Nothing is
// saved until the preview looks right.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { inferProduct, type ParsedProduct } from "@/lib/import/infer";
import { parseDelimited, readFile, tableToRows, templateCsv } from "@/lib/import/parse";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Catalog, Product } from "@/lib/types";
import { fmtIn } from "@/lib/units";
import { CATEGORY_NAME, STYLE_LABEL } from "./CatalogManager";

const NEW = "__new__";
const ownStorage = (url: string | null) => !!url && url.includes("/storage/v1/object/public/ds-images/");

type Status = "new" | "update" | "same";

function sameProduct(p: ParsedProduct, e: Product): boolean {
  const keys: (keyof ParsedProduct & keyof Product)[] = ["name", "description", "category", "style", "width", "height", "depth", "mount_height", "doors", "drawers", "shelves", "split_height", "placeable"];
  return keys.every((k) => (p[k] ?? null) === (e[k] ?? null)) && (p.image_url === null || p.image_url === e.image_url || ownStorage(e.image_url));
}

function size(p: ParsedProduct): string {
  if (p.width === null && p.height === null && p.depth === null) return "";
  return [p.width, p.height, p.depth].map((v) => (v === null ? "?" : fmtIn(v, false))).join(" x ");
}

export function ImportWizard({ catalog }: { catalog: Catalog }) {
  const router = useRouter();
  const makers = catalog.manufacturers.filter((m) => m.name !== "Generic");
  const [makerId, setMakerId] = useState<string>(makers[0]?.id ?? NEW);
  const [newMaker, setNewMaker] = useState({ name: "", website: "" });
  const makerLines = catalog.lines.filter((l) => l.manufacturer_id === makerId);
  const [lineChoice, setLineChoice] = useState<string>(makerLines[0]?.id ?? NEW);
  const [newLine, setNewLine] = useState({ name: "", construction: "framed" });
  const [pasted, setPasted] = useState("");
  const [table, setTable] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [copyPhotos, setCopyPhotos] = useState(true);
  const [hideMissing, setHideMissing] = useState(false);
  const [onlyWarnings, setOnlyWarnings] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lineIdValid = lineChoice === NEW || makerLines.some((l) => l.id === lineChoice) ? lineChoice : (makerLines[0]?.id ?? NEW);
  const defaultLineName = lineIdValid === NEW ? newLine.name.trim() : (makerLines.find((l) => l.id === lineIdValid)?.name ?? "");

  const parsed = (() => {
    const source = table ?? (pasted.trim() ? parseDelimited(pasted) : null);
    if (!source) return null;
    const { rows, recognized, ignored } = tableToRows(source);
    const products: ParsedProduct[] = [];
    let skipped = 0;
    for (const r of rows) {
      const p = inferProduct(r, { line: defaultLineName || null });
      if (p) products.push(p);
      else skipped++;
    }
    // the last row wins when a SKU repeats within a line
    const byKey = new Map<string, ParsedProduct>();
    for (const p of products) byKey.set(`${p.line ?? ""}|${p.sku.toUpperCase()}`, p);
    const dupes = products.length - byKey.size;
    return { products: [...byKey.values()], recognized, ignored, skipped, dupes };
  })();

  const lineIdByName = (name: string | null) => makerLines.find((l) => l.name.toLowerCase() === (name ?? "").toLowerCase())?.id ?? null;

  const rows = (() => {
    if (!parsed) return [];
    return parsed.products.map((p) => {
      const lineId = lineIdByName(p.line);
      const existing = lineId ? catalog.products.find((e) => e.line_id === lineId && e.sku.toUpperCase() === p.sku.toUpperCase()) : undefined;
      const status: Status = !existing ? "new" : sameProduct(p, existing) ? "same" : "update";
      return { p, existing, status };
    });
  })();

  const counts = {
    total: rows.length,
    new: rows.filter((r) => r.status === "new").length,
    update: rows.filter((r) => r.status === "update").length,
    same: rows.filter((r) => r.status === "same").length,
    warnings: rows.filter((r) => r.p.warnings.length).length,
    orderOnly: rows.filter((r) => !r.p.placeable).length,
    noLine: rows.filter((r) => !r.p.line).length,
  };
  const lineNames = [...new Set(rows.map((r) => r.p.line).filter(Boolean))] as string[];
  const newLineNames = lineNames.filter((n) => !lineIdByName(n));

  const canImport = rows.length > 0 && counts.noLine === 0 && (makerId !== NEW || newMaker.name.trim() !== "") && !running;

  const runImport = async () => {
    if (!parsed) return;
    setError(null);
    setResult(null);
    const sb = getSupabaseBrowserClient();
    try {
      // 1. manufacturer
      let mId = makerId;
      if (mId === NEW) {
        setRunning("Adding the manufacturer...");
        const { data, error: e } = await sb.from("ds_manufacturers").insert({ name: newMaker.name.trim(), website: newMaker.website.trim() || null }).select("id").single();
        if (e) throw e;
        mId = data.id as string;
      }
      // 2. lines
      const lineIds = new Map<string, string>();
      for (const l of catalog.lines.filter((x) => x.manufacturer_id === mId)) lineIds.set(l.name.toLowerCase(), l.id);
      for (const name of lineNames) {
        if (lineIds.has(name.toLowerCase())) continue;
        setRunning(`Adding the line ${name}...`);
        const construction = lineIdValid === NEW && name === newLine.name.trim() ? newLine.construction : /europ|frameless/i.test(name) ? "frameless" : "framed";
        const { data, error: e } = await sb.from("ds_product_lines").insert({ manufacturer_id: mId, name, construction }).select("id").single();
        if (e) throw e;
        lineIds.set(name.toLowerCase(), data.id as string);
      }
      // 3. products, in file order
      const payload = rows.map(({ p, existing }, i) => {
        const keepPhoto = existing && ownStorage(existing.image_url) && (!p.image_url || !ownStorage(p.image_url));
        return {
          line_id: lineIds.get((p.line ?? "").toLowerCase())!,
          sku: existing?.sku ?? p.sku,
          name: p.name,
          description: p.description,
          category: p.category,
          style: p.style,
          width: p.width,
          height: p.height,
          depth: p.depth,
          mount_height: p.mount_height,
          doors: p.doors,
          drawers: p.drawers,
          shelves: p.shelves,
          split_height: p.split_height,
          placeable: p.placeable,
          image_url: keepPhoto ? existing!.image_url : (p.image_url ?? existing?.image_url ?? null),
          source_url: p.source_url ?? existing?.source_url ?? null,
          sort: (i + 1) * 10,
          active: true,
        };
      });
      const saved: { id: string; image_url: string | null; line_id: string }[] = [];
      for (let i = 0; i < payload.length; i += 200) {
        setRunning(`Saving products ${i + 1} to ${Math.min(i + 200, payload.length)} of ${payload.length}...`);
        const { data, error: e } = await sb.from("ds_products").upsert(payload.slice(i, i + 200), { onConflict: "line_id,sku" }).select("id, image_url, line_id");
        if (e) throw e;
        saved.push(...((data ?? []) as typeof saved));
      }
      // 4. optionally hide what the file no longer lists
      let hidden = 0;
      if (hideMissing) {
        for (const name of lineNames) {
          const lid = lineIds.get(name.toLowerCase())!;
          const keep = new Set(payload.filter((x) => x.line_id === lid).map((x) => x.sku.toUpperCase()));
          const stale = catalog.products.filter((e) => e.line_id === lid && e.active && !keep.has(e.sku.toUpperCase())).map((e) => e.id);
          if (stale.length) {
            const { error: e } = await sb.from("ds_products").update({ active: false }).in("id", stale);
            if (e) throw e;
            hidden += stale.length;
          }
        }
      }
      // 5. photos into our storage
      let copied = 0;
      let failed = 0;
      if (copyPhotos) {
        const jobs = saved.filter((s) => s.image_url && !ownStorage(s.image_url));
        const queue = [...jobs];
        const worker = async () => {
          for (let job = queue.shift(); job; job = queue.shift()) {
            setRunning(`Copying photos ${copied + failed + 1} of ${jobs.length}...`);
            try {
              const res = await fetch("/api/copy-image", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: job.image_url, folder: `products/${job.line_id}` }) });
              const out = await res.json();
              if (!res.ok || !out.url) throw new Error(out.error);
              const { error: e } = await sb.from("ds_products").update({ image_url: out.url }).eq("id", job.id);
              if (e) throw e;
              copied++;
            } catch {
              failed++;
            }
          }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
      }
      setRunning(null);
      setResult(
        `Imported ${payload.length} products: ${counts.new} new, ${counts.update} updated, ${counts.same} unchanged.` +
          (hidden ? ` ${hidden} products not in the file are now hidden.` : "") +
          (copyPhotos ? ` Copied ${copied} photos${failed ? `; ${failed} could not be copied and still link to the vendor` : ""}.` : ""),
      );
      router.refresh();
    } catch (e) {
      setRunning(null);
      setError(e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: string }).message) : "Import failed.");
    }
  };

  const shown = onlyWarnings ? rows.filter((r) => r.p.warnings.length) : rows;

  return (
    <div className="imp-steps">
      <section className="card imp-step">
        <h2>1. Manufacturer and line</h2>
        <div className="imp-row">
          <label className="field">
            <span className="field-label">Manufacturer</span>
            <select className="input" value={makerId} onChange={(e) => setMakerId(e.target.value)}>
              {makers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
              <option value={NEW}>+ New manufacturer</option>
            </select>
          </label>
          {makerId === NEW && (
            <>
              <label className="field">
                <span className="field-label">Name</span>
                <input className="input" value={newMaker.name} onChange={(e) => setNewMaker((s) => ({ ...s, name: e.target.value }))} />
              </label>
              <label className="field">
                <span className="field-label">Website</span>
                <input className="input" value={newMaker.website} onChange={(e) => setNewMaker((s) => ({ ...s, website: e.target.value }))} placeholder="https://" />
              </label>
            </>
          )}
          <label className="field">
            <span className="field-label">Line for rows without a line column</span>
            <select className="input" value={lineIdValid} onChange={(e) => setLineChoice(e.target.value)}>
              {makerLines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
              <option value={NEW}>+ New line</option>
            </select>
          </label>
          {lineIdValid === NEW && (
            <>
              <label className="field">
                <span className="field-label">Line name</span>
                <input className="input" value={newLine.name} onChange={(e) => setNewLine((s) => ({ ...s, name: e.target.value }))} placeholder="e.g. American Style" />
              </label>
              <label className="field">
                <span className="field-label">Construction</span>
                <select className="input" value={newLine.construction} onChange={(e) => setNewLine((s) => ({ ...s, construction: e.target.value }))}>
                  <option value="framed">Framed (American)</option>
                  <option value="frameless">Frameless (European)</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </>
          )}
        </div>
      </section>

      <section className="card imp-step">
        <h2>2. Products</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Upload a CSV or Excel file, or paste a table copied from a spreadsheet. The first row must be headers. Only <b>sku</b> is required. Sizes, doors, drawers and
          shelves are read from a <b>description</b> like <i>Base Cabinet- 12&quot;(W) x 34 1/2&quot;(H) x 24&quot;(D) 1 Drawer -1 Door -1 Shelf</i>, and from the SKU
          itself (W3036 is a wall cabinet 30 wide and 36 high). A <b>line</b> column sends rows to different lines in one file.
        </p>
        <div className="imp-row" style={{ alignItems: "center" }}>
          <label className="btn btn-secondary">
            {fileName ? `Replace file (${fileName})` : "Choose CSV or Excel file"}
            <input
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setReadError(null);
                try {
                  setTable(await readFile(f));
                  setFileName(f.name);
                  setPasted("");
                } catch {
                  setReadError("Could not read that file. Save it as CSV or .xlsx and try again.");
                }
              }}
            />
          </label>
          <button
            className="btn btn-ghost"
            onClick={() => {
              const blob = new Blob([templateCsv()], { type: "text/csv" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = "product-import-template.csv";
              a.click();
              URL.revokeObjectURL(a.href);
            }}
          >
            Download template
          </button>
          {fileName && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setTable(null);
                setFileName(null);
              }}
            >
              Clear file
            </button>
          )}
        </div>
        {!fileName && (
          <label className="field" style={{ marginTop: 12 }}>
            <span className="field-label">Or paste here</span>
            <textarea className="input imp-paste" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={"sku\tdescription\tline\nB12\tBase Cabinet- 12\"(W) x 34 1/2\"(H) x 24\"(D) 1 Drawer -1 Door -1 Shelf\tAmerican Style"} />
          </label>
        )}
        {readError && <div className="error-box">{readError}</div>}
        {parsed && (
          <p className="muted" style={{ marginBottom: 0 }}>
            Columns used: {parsed.recognized.join(", ") || "none"}.{parsed.ignored.length ? ` Ignored: ${parsed.ignored.join(", ")}.` : ""}
            {parsed.skipped ? ` ${parsed.skipped} rows without a SKU skipped.` : ""}
            {parsed.dupes ? ` ${parsed.dupes} repeated SKUs merged (last one kept).` : ""}
          </p>
        )}
      </section>

      {parsed && (
        <section className="card imp-step">
          <h2>3. Check and import</h2>
          <div className="imp-summary">
            <span>
              <b>{counts.total}</b> products
            </span>
            <span className="pill pill-new">{counts.new} new</span>
            <span className="pill pill-update">{counts.update} changed</span>
            <span className="pill pill-same">{counts.same} unchanged</span>
            <span className="pill">{counts.orderOnly} order-only</span>
            {counts.warnings > 0 && (
              <button className={`pill pill-warn`} style={{ cursor: "pointer" }} onClick={() => setOnlyWarnings((v) => !v)}>
                {counts.warnings} with notes {onlyWarnings ? "(showing)" : "(show)"}
              </button>
            )}
            {lineNames.length > 0 && <span>Lines: {lineNames.map((n) => (newLineNames.includes(n) ? `${n} (new)` : n)).join(", ")}</span>}
          </div>
          {counts.noLine > 0 && <div className="error-box" style={{ marginTop: 12 }}>{counts.noLine} rows have no line. Pick or name a line in step 1, or add a line column.</div>}
          <div className="imp-table-wrap" style={{ marginTop: 12 }}>
            <table className="table">
              <thead>
                <tr>
                  <th />
                  <th>Line</th>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Group / drawn as</th>
                  <th>W x H x D</th>
                  <th>Hung at</th>
                  <th>Doors / drawers</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {shown.slice(0, 1000).map(({ p, status }) => (
                  <tr key={`${p.line}|${p.sku}`}>
                    <td>
                      <span className={`pill pill-${status}`}>{status === "new" ? "New" : status === "update" ? "Changed" : "Same"}</span>
                    </td>
                    <td>{p.line ?? ""}</td>
                    <td className="tabular">
                      <b>{p.sku}</b>
                    </td>
                    <td>{p.name}</td>
                    <td>
                      {CATEGORY_NAME[p.category]}
                      <div className="muted">{p.placeable ? STYLE_LABEL[p.style] : "Order only"}</div>
                    </td>
                    <td className="tabular">{size(p)}</td>
                    <td className="tabular">{p.mount_height ? fmtIn(p.mount_height) : ""}</td>
                    <td className="tabular">{p.doors || p.drawers ? `${p.doors} / ${p.drawers}` : ""}</td>
                    <td style={{ color: "var(--red)", fontSize: 12 }}>{p.warnings.join(" ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="stack" style={{ marginTop: 16 }}>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={copyPhotos} onChange={(e) => setCopyPhotos(e.target.checked)} /> Copy photos from the vendor into our own storage
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={hideMissing} onChange={(e) => setHideMissing(e.target.checked)} /> Hide products in these lines that this file does not list (discontinued
              items)
            </label>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn btn-primary" disabled={!canImport} onClick={runImport}>
                Import {counts.total} products
              </button>
              {running && <span className="muted">{running}</span>}
            </div>
            {error && <div className="error-box">{error}</div>}
            {result && (
              <div className="card" style={{ borderColor: "#A9CFB2", background: "#F0F8F2" }}>
                {result} <Link href="/catalog">Back to the catalog</Link>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
