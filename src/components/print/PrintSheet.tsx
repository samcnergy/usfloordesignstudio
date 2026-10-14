"use client";

// Printable design package, US Letter landscape:
// page 1 top view + schedule, then front views four to a page, then site photos.

import { Brand } from "@/components/Brand";
import { ElevationView } from "@/components/drawing/ElevationView";
import { PlanView } from "@/components/drawing/PlanView";
import { roomShape } from "@/lib/geometry";
import type { Catalog, DesignRecord } from "@/lib/types";
import { buildSchedule } from "@/lib/schedule";

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

export function PrintSheet({ record, catalog }: { record: DesignRecord; catalog: Catalog }) {
  const design = record.data;
  const schedule = buildSchedule(catalog, design);
  const designLine = catalog.lines.find((l) => l.id === design.lineId);
  const finish =
    catalog.finishes.find((f) => f.id === design.finishId) ?? catalog.finishes.find((f) => f.line_id === design.lineId) ?? catalog.finishes[0];
  const finishLine = catalog.lines.find((l) => l.id === (finish?.line_id ?? designLine?.id));
  const maker = catalog.manufacturers.find((m) => m.id === finishLine?.manufacturer_id);
  const counter = catalog.countertops.find((c) => c.id === design.countertopId) ?? catalog.countertops[0];
  const runs = [
    ...roomShape(design.room)
      .walls.map((w) => w.id)
      .filter((w) => design.items.some((i) => i.run === w) || design.openings.some((o) => o.wall === w)),
    ...design.islands.filter((isl) => design.items.some((i) => i.run === isl.id)).map((i) => i.id),
  ];
  const elevationPages = chunk(runs, 4);
  const photoPages = chunk(design.photos, 6);
  const totalPages = 1 + elevationPages.length + photoPages.length;
  const date = new Date(record.updated_at || Date.now()).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const header = (title: string) => (
    <header className="sheet-header">
      <Brand size={30} />
      <div className="sheet-title">
        <div className="sheet-title-main">{title}</div>
        <div className="sheet-meta">
          {record.name}
          {record.customer_name ? ` · ${record.customer_name}` : ""}
          {` · ${date}`}
        </div>
      </div>
    </header>
  );
  const footer = (page: number) => (
    <footer className="sheet-footer">
      <span>US Floor Design Studio · 30 years in Orange County</span>
      <span>Drawings show design intent. Field-verify all dimensions before ordering.</span>
      <span>
        Page {page} of {totalPages}
      </span>
    </footer>
  );

  return (
    <div className="sheet-root">
      <section className="sheet-page">
        {header("Kitchen Design: Top View")}
        <div className="sheet-body sheet-body-split">
          <div className="sheet-plan">
            <PlanView design={design} catalog={catalog} className="sheet-svg" />
          </div>
          <aside className="sheet-side">
            <dl className="sheet-facts">
              {record.customer_name && (
                <>
                  <dt>Customer</dt>
                  <dd>{record.customer_name}</dd>
                </>
              )}
              {record.customer_phone && (
                <>
                  <dt>Phone</dt>
                  <dd>{record.customer_phone}</dd>
                </>
              )}
              {record.customer_address && (
                <>
                  <dt>Address</dt>
                  <dd>{record.customer_address}</dd>
                </>
              )}
              {record.designer_name && (
                <>
                  <dt>Designer</dt>
                  <dd>{record.designer_name}</dd>
                </>
              )}
            </dl>
            <div className="sheet-swatches">
              {finish && (
                <div className="sheet-swatch">
                  <span className="swatch" style={{ background: finish.image_url ? `center / cover url(${finish.image_url})` : finish.color_hex }} />
                  <span>
                    <b>Cabinets</b>
                    <br />
                    {finish.name}
                    {finishLine && (
                      <>
                        <br />
                        <span className="sheet-small">
                          {maker && maker.name !== "Generic" ? `${maker.name} ` : ""}
                          {finishLine.name}
                        </span>
                      </>
                    )}
                  </span>
                </div>
              )}
              {counter && (
                <div className="sheet-swatch">
                  <span className="swatch" style={{ background: counter.image_url ? `center / cover url(${counter.image_url})` : counter.color_hex }} />
                  <span>
                    <b>Countertop</b>
                    <br />
                    {counter.name}
                  </span>
                </div>
              )}
            </div>
            <table className="sheet-table">
              <thead>
                <tr>
                  <th>Qty</th>
                  <th>Item</th>
                  <th>Description</th>
                  <th>Finish</th>
                </tr>
              </thead>
              <tbody>
                {schedule.map((r) => (
                  <tr key={`${r.label}-${r.line}-${r.finish}-${r.size}-${r.locations}`}>
                    <td className="tabular">{r.qty}</td>
                    <td className="tabular">
                      <b>{r.label}</b>
                    </td>
                    <td>
                      {r.description}
                      <div className="sheet-small">
                        {[r.size, r.line, r.locations].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td>{r.finish}</td>
                  </tr>
                ))}
                {!schedule.length && (
                  <tr>
                    <td colSpan={4}>No cabinets placed yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            {record.notes && (
              <div className="sheet-notes">
                <b>Notes</b>
                <p>{record.notes}</p>
              </div>
            )}
          </aside>
        </div>
        {footer(1)}
      </section>

      {elevationPages.map((group, pi) => (
        <section className="sheet-page" key={`e-${pi}`}>
          {header("Kitchen Design: Front Views")}
          <div className={`sheet-body sheet-grid sheet-grid-${group.length}`}>
            {group.map((run) => (
              <div className="sheet-cell" key={run}>
                <ElevationView design={design} catalog={catalog} run={run} className="sheet-svg" />
              </div>
            ))}
          </div>
          {footer(2 + pi)}
        </section>
      ))}

      {photoPages.map((group, pi) => (
        <section className="sheet-page" key={`p-${pi}`}>
          {header("Site Photos")}
          <div className="sheet-body sheet-photos">
            {group.map((p) => (
              <figure key={p.id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption || "Site photo"} />
                {p.caption && <figcaption>{p.caption}</figcaption>}
              </figure>
            ))}
          </div>
          {footer(2 + elevationPages.length + pi)}
        </section>
      ))}
    </div>
  );
}
