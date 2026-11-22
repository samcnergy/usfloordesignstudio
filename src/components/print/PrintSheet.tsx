"use client";

// The printed drawing set, laid out to the K&B drawing standards (owner,
// 2026-11-21). Every sheet has a border, the title block down the right side
// (firm, disclaimer, copyright, owner, project, drawn by, date, scale,
// revision, client approval, sheet number) and a sheet number in the standard
// form (ID-1.01). Plans and front views are drawn to a stated scale, 1/2" =
// 1'-0" when they fit, in black and white.
//
// Sheets, in order: ID-0.01 title sheet with the sheet index; ID-1.01 floor
// plan; ID-1.02 on, cabinet schedule; ID-2.01 on, interior elevations (north
// wall first, then clockwise); ID-9.01 presentation 3D view; ID-9.02 on, site
// photos. 11x17 is the standard sheet; Letter is for quick handouts.

import { Brand } from "@/components/Brand";
import { ElevationView, elevationPaperSize } from "@/components/drawing/ElevationView";
import { PlanView, planBox, type ElevationMark } from "@/components/drawing/PlanView";
import { View3D, DEFAULT_CAMERA } from "@/components/drawing/View3D";
import { roomShape } from "@/lib/geometry";
import { DROP_DOOR } from "@/lib/plan";
import { buildSchedule, type ScheduleRow } from "@/lib/schedule";
import {
  FIRM, GENERAL_NOTES, INTERPRETATION, LIABILITY, PAPER, SCALES, copyright, drawingArea, fitScale, initials, roomName, sheetId,
  northAngle, wallDirections, wallsFromNorth, type Paper, type PaperSpec, type Scale,
} from "@/lib/sheets";
import type { Catalog, DesignRecord } from "@/lib/types";
import { fmtIn } from "@/lib/units";

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Height kept under each drawing for its title marker, in paper inches. */
const MARKER = 0.85;
const GAP = 0.3;

type Elevation = { run: string; n: number; title: string; scale: Scale; width: number; height: number };
type Sheet = { id: string; title: string; scale: string; body: React.ReactNode };

/** Drawing title marker: a 5/8" bubble with the drawing number (split with the sheet number for an elevation), the title, and the scale. */
function TitleMarker({ n, sheetRef, title, scale }: { n: number | string; sheetRef?: string; title: string; scale: string }) {
  return (
    <div className="ds-marker">
      <svg width="0.625in" height="0.625in" viewBox="0 0 10 10" aria-hidden="true">
        <circle cx={5} cy={5} r={4.7} fill="#FFFFFF" stroke="#000" strokeWidth={0.45} />
        {sheetRef ? (
          <>
            <line x1={0.3} x2={9.7} y1={5} y2={5} stroke="#000" strokeWidth={0.35} />
            <text x={5} y={4.1} fontSize={3.2} textAnchor="middle" fontWeight={700}>{n}</text>
            <text x={5} y={7.9} fontSize={1.45} textAnchor="middle">{sheetRef}</text>
          </>
        ) : (
          <text x={5} y={6.4} fontSize={4} textAnchor="middle" fontWeight={700}>{n}</text>
        )}
      </svg>
      <div>
        <div className="ds-marker-title">{title}</div>
        <div className="ds-marker-scale">SCALE: {scale}</div>
      </div>
    </div>
  );
}

/** North marker: an arrow at the top right of the plan, 3/4" across, pointing to north. */
function NorthArrow({ angle }: { angle: number }) {
  return (
    <svg width="0.75in" height="0.75in" viewBox="0 0 20 20" aria-label="North">
      <circle cx={10} cy={10} r={9.2} fill="#FFFFFF" stroke="#000" strokeWidth={0.7} />
      <g transform={`rotate(${angle} 10 10)`}>
        <polygon points="10,2.2 13.2,14 10,11.6 6.8,14" fill="#000" />
        <text x={10} y={18.3} fontSize={3.6} textAnchor="middle" fontWeight={700}>N</text>
      </g>
    </svg>
  );
}

export function PrintSheet({ record, catalog, paper = "tabloid" }: { record: DesignRecord; catalog: Catalog; paper?: Paper }) {
  const design = record.data;
  const spec: PaperSpec = PAPER[paper];
  const area = drawingArea(spec);
  const schedule = buildSchedule(catalog, design);
  const room = roomName(design);
  const plotted = new Date();
  const dateText = plotted.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const shape = roomShape(design.room);
  const directions = wallDirections(design);

  // ---------- the floor plan ----------
  const notesWidth = paper === "tabloid" ? 2.9 : 2.2;
  const box = planBox(design, 1);
  const planSpace = { width: area.width - notesWidth - GAP, height: area.height - MARKER };
  // The lettering grows with the scale, so the frame is checked at each scale in turn.
  const planScale =
    SCALES.find((s) => {
      const b = planBox(design, s.k * 0.12);
      return b.width / s.k <= planSpace.width && b.height / s.k <= planSpace.height;
    }) ?? fitScale(box.width, box.height, planSpace);

  // ---------- elevations: the north wall first, then clockwise, then islands ----------
  const walls = wallsFromNorth(design, shape.walls).filter(
    (w) => design.items.some((i) => i.run === w.id) || design.openings.some((o) => o.wall === w.id),
  );
  const seen = new Map<string, number>();
  for (const w of walls) seen.set(directions.get(w.id) ?? "", (seen.get(directions.get(w.id) ?? "") ?? 0) + 1);
  const elevTitles = new Map<string, string>();
  for (const w of walls) {
    const dir = directions.get(w.id) ?? "";
    const twin = (seen.get(dir) ?? 0) > 1 ? ` (${w.label.toUpperCase()})` : "";
    elevTitles.set(w.id, `${room.toUpperCase()} ${dir} WALL${twin} ELEVATION${w.open ? " (OPEN)" : ""}`);
  }
  for (const isl of design.islands.filter((i) => design.items.some((x) => x.run === i.id))) {
    elevTitles.set(isl.id, `${room.toUpperCase()} ${isl.name.toUpperCase()} ELEVATION`);
  }
  const runs = [...walls.map((w) => w.id), ...design.islands.filter((i) => design.items.some((x) => x.run === i.id)).map((i) => i.id)];
  const elevSpace = { width: area.width, height: area.height - MARKER };
  const elevations: Elevation[] = runs.flatMap((run, i) => {
    const fits = SCALES.map((s) => ({ s, size: elevationPaperSize(design, run, s.k, s.k * 0.13) }))
      .find((x) => x.size && x.size.width <= elevSpace.width && x.size.height <= elevSpace.height);
    const pick = fits ?? { s: SCALES[SCALES.length - 1], size: elevationPaperSize(design, run, SCALES[SCALES.length - 1].k, SCALES[SCALES.length - 1].k * 0.13) };
    if (!pick.size) return [];
    return [{ run, n: i + 1, title: elevTitles.get(run) ?? run, scale: pick.s, width: pick.size.width, height: pick.size.height + MARKER }];
  });
  // Laid out left to right in rows, as many to a sheet as fit.
  const elevationSheets: Elevation[][][] = [];
  {
    let rows: Elevation[][] = [];
    let row: Elevation[] = [];
    let rowW = 0;
    let usedH = 0;
    const rowH = (r: Elevation[]) => Math.max(0, ...r.map((e) => e.height));
    for (const e of elevations) {
      if (row.length && rowW + GAP + e.width > area.width) {
        rows.push(row);
        usedH += rowH(row) + GAP;
        row = [];
        rowW = 0;
      }
      if (usedH + e.height > area.height && rows.length) {
        elevationSheets.push(rows);
        rows = [];
        usedH = 0;
      }
      row.push(e);
      rowW += (row.length > 1 ? GAP : 0) + e.width;
    }
    if (row.length) rows.push(row);
    if (rows.length) elevationSheets.push(rows);
  }
  const marks: ElevationMark[] = elevations.filter((e) => shape.walls.some((w) => w.id === e.run)).map((e) => ({ wallId: e.run, n: e.n }));

  // ---------- the cabinet schedule, as many sheets as it needs ----------
  const perSheet = paper === "tabloid" ? 30 : 18;
  const schedulePages = chunk(schedule, perSheet);
  if (!schedulePages.length) schedulePages.push([]);

  const has3d = design.items.length > 0;
  const photoPages = chunk(design.photos, 6);
  const planId = sheetId(1, 1);

  // ---------- notes on the plan ----------
  const counter = catalog.countertops.find((c) => c.id === design.countertopId) ?? catalog.countertops[0];
  const finish = catalog.finishes.find((f) => f.id === design.finishId) ?? catalog.finishes.find((f) => f.line_id === design.lineId);
  const line = catalog.lines.find((l) => l.id === (finish?.line_id ?? design.lineId));
  const maker = catalog.manufacturers.find((m) => m.id === line?.manufacturer_id);
  const planNotes = [
    line || finish ? `Cabinets: ${[maker && maker.name !== "Generic" ? maker.name : null, line?.name, finish?.name].filter(Boolean).join(", ")}.` : null,
    counter ? `Countertop: ${counter.name}, ${fmtIn(counter.thickness ?? 1.5)} thick.` : null,
    (design.crown ?? 0) > 0 ? `Cabinet crown molding on the wall cabinets, ${fmtIn(design.crown)} high. Wall cabinets stop ${fmtIn(design.crown)} below the ceiling.` : "No cabinet crown molding. Wall cabinets run to the ceiling.",
    "Toe kicks per the cabinet manufacturer, finished to match the cabinets.",
    "The plan is cut at the ceiling. Base cabinets and anything else under the counter are hidden lines; the countertop, wall and tall cabinets are object lines.",
    `Appliance doors are shown fully open. Sizes are typical (dishwasher door ${fmtIn(DROP_DOOR.dishwasher)}, range door ${fmtIn(DROP_DOOR.range)}); confirm with the manufacturer's installation guide.`,
    "Dimensions are from the finished wall surface. Doors and windows are dimensioned to the outside of the casing. Fixtures and appliances are located by centerlines.",
    ...(record.notes ? [record.notes] : []),
  ].filter((n): n is string => !!n);

  // ---------- the sheets ----------
  const sheets: Sheet[] = [];
  const index: { id: string; title: string }[] = [];
  const add = (s: Sheet) => { sheets.push(s); index.push({ id: s.id, title: s.title }); };

  // Title sheet (filled in last, so it can list every sheet).
  const titleSheetId = sheetId(0, 1);
  index.push({ id: titleSheetId, title: "Title Sheet" });

  add({
    id: planId, title: `${room} Floor Plan`, scale: planScale.label,
    body: (
      <div className="ds-plan">
        <div className="ds-plan-draw">
          <PlanView design={design} catalog={catalog} print={{ scale: planScale.k }} marks={marks}
            room={{ name: room, ceiling: `CLG. HT. ${fmtIn(design.room.ceiling)}` }} />
          <TitleMarker n={1} title={`${room.toUpperCase()} FLOOR PLAN`} scale={planScale.label} />
        </div>
        <aside className="ds-plan-side" style={{ width: `${notesWidth}in` }}>
          <div className="ds-north"><NorthArrow angle={northAngle(design)} /></div>
          <h4>Legend</h4>
          <PlanLegend />
          <h4>Plan notes</h4>
          <ol>{planNotes.map((n, i) => <li key={i}>{n}</li>)}</ol>
          <p className="ds-small">Cabinet codes are the manufacturer&apos;s order codes. See the cabinet schedule, {sheetId(1, 2)}.</p>
          <p className="ds-small">Elevation markers point at each wall drawn on sheets {sheetId(2, 1)}{elevationSheets.length > 1 ? ` to ${sheetId(2, elevationSheets.length)}` : ""}.</p>
        </aside>
      </div>
    ),
  });

  schedulePages.forEach((rows, pi) => add({
    id: sheetId(1, 2 + pi), title: schedulePages.length > 1 ? `Cabinet Schedule (${pi + 1} of ${schedulePages.length})` : "Cabinet Schedule", scale: "None",
    body: <ScheduleTable rows={rows} empty={!schedule.length} />,
  }));

  elevationSheets.forEach((rows, si) => add({
    id: sheetId(2, si + 1), title: "Interior Elevations",
    scale: new Set(rows.flat().map((e) => e.scale.label)).size === 1 ? rows[0][0].scale.label : "As noted",
    body: (
      <div className="ds-elev">
        {rows.map((r, ri) => (
          <div className="ds-elev-row" key={ri}>
            {r.map((e) => (
              <div className="ds-elev-cell" key={e.run}>
                <ElevationView design={design} catalog={catalog} run={e.run} print={{ scale: e.scale.k }} />
                <TitleMarker n={e.n} sheetRef={planId} title={e.title} scale={e.scale.label} />
              </div>
            ))}
          </div>
        ))}
      </div>
    ),
  }));

  if (has3d) add({
    id: sheetId(9, 1), title: "Presentation View", scale: "Not to scale",
    body: (
      <div className="ds-3d">
        <View3D design={design} catalog={catalog} cam={{ ...DEFAULT_CAMERA, ...(design.view3d ?? {}) }} className="ds-3d-view" />
        <p className="ds-disclaimer">{INTERPRETATION}</p>
      </div>
    ),
  });

  photoPages.forEach((group, pi) => add({
    id: sheetId(9, 2 + pi), title: photoPages.length > 1 ? `Site Photos (${pi + 1} of ${photoPages.length})` : "Site Photos", scale: "Not to scale",
    body: (
      <div className="ds-photos">
        {group.map((p) => (
          <figure key={p.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.caption || "Site photo"} />
            {p.caption && <figcaption>{p.caption}</figcaption>}
          </figure>
        ))}
      </div>
    ),
  }));

  const project = record.name || `${record.customer_name ?? ""} ${room}`.trim();
  sheets.unshift({
    id: titleSheetId, title: "Title Sheet", scale: "As noted",
    body: (
      <div className="ds-title">
        <div className="ds-title-top">
          <div className="ds-title-name">{project}</div>
          {has3d ? (
            <div className="ds-title-graphic">
              {/* The title sheet's view is a black and white line drawing (K&B drawing standards). */}
              <View3D design={design} catalog={catalog} cam={{ ...DEFAULT_CAMERA, ...(design.view3d ?? {}), look: "line" }} className="ds-3d-view" />
              <p className="ds-disclaimer">{INTERPRETATION}</p>
            </div>
          ) : null}
        </div>
        <div className="ds-title-bottom">
          <table className="ds-index">
            <thead><tr><th colSpan={2}>Sheet index</th></tr></thead>
            <tbody>{index.map((s) => <tr key={s.id}><td className="tabular">{s.id}</td><td>{s.title}</td></tr>)}</tbody>
          </table>
          <div className="ds-title-info">
            <h4>Project</h4>
            <dl>
              <dt>Client</dt><dd>{record.customer_name || "-"}</dd>
              <dt>Location</dt><dd>{record.customer_address || "-"}</dd>
              <dt>Room</dt><dd>{room}</dd>
              <dt>Designer</dt><dd>{record.designer_name || "-"}</dd>
              <dt>Design firm</dt><dd>{FIRM.name}, {FIRM.street}, {FIRM.city}. {FIRM.phone}</dd>
            </dl>
            <h4>General notes</h4>
            <ol>{GENERAL_NOTES.map((n, i) => <li key={i}>{n}</li>)}</ol>
          </div>
        </div>
      </div>
    ),
  });

  return (
    <div className="ds-root">
      <style>{`@media print { @page { size: ${spec.width}in ${spec.height}in; margin: 0; } }`}</style>
      {sheets.map((s) => (
        <section key={s.id} className="ds-sheet" style={{ width: `${spec.width}in`, height: `${spec.height}in`, padding: `${spec.margin}in ${spec.margin}in ${spec.margin}in ${spec.left}in` }}>
          <div className="ds-border">
            <div className="ds-draw">{s.body}</div>
            <TitleBlock spec={spec} record={record} sheet={s} date={dateText} />
          </div>
        </section>
      ))}
    </div>
  );

}

/** The plan legend: the line types and symbols used on the plan (K&B drawing standards: a legend on every plan). */
function PlanLegend() {
  const row = (key: string, sample: React.ReactNode, text: string) => (
    <div className="ds-legend-row" key={key}>
      <svg width="0.55in" height="0.2in" viewBox="0 0 30 11" aria-hidden="true">{sample}</svg>
      <span>{text}</span>
    </div>
  );
  return (
    <div className="ds-legend">
      {row("wall", <rect x={1} y={3} width={28} height={5} fill="#33363A" />, "Wall")}
      {row("object", <line x1={1} x2={29} y1={5.5} y2={5.5} stroke="#000" strokeWidth={0.9} />, "Object line: countertop, wall and tall cabinets, appliances in the open")}
      {row("hidden", <line x1={1} x2={29} y1={5.5} y2={5.5} stroke="#000" strokeWidth={0.7} strokeDasharray="3 2" />, "Hidden line: cabinets and appliances under the counter, appliance doors open")}
      {row("cl", <><line x1={1} x2={29} y1={6.5} y2={6.5} stroke="#000" strokeWidth={0.5} strokeDasharray="7 1.5 1.5 1.5" /><text x={15} y={4} fontSize={5} textAnchor="middle">{"\u2104"}</text></>, "Centerline of a fixture or appliance")}
      {row("dim", <><line x1={3} x2={27} y1={5.5} y2={5.5} stroke="#000" strokeWidth={0.5} /><line x1={1.5} x2={4.5} y1={7} y2={4} stroke="#000" strokeWidth={0.7} /><line x1={25.5} x2={28.5} y1={7} y2={4} stroke="#000" strokeWidth={0.7} /></>, "Dimension, in inches")}
      {row("door", <><line x1={4} x2={4} y1={1} y2={10} stroke="#000" strokeWidth={0.8} /><path d="M 4 1 A 9 9 0 0 1 13 10" fill="none" stroke="#000" strokeWidth={0.5} strokeDasharray="1.5 1" /></>, "Door and its swing")}
      {row("mark", <><polygon points="15,0.5 18,4 12,4" fill="#000" /><circle cx={15} cy={7} r={3.6} fill="#FFF" stroke="#000" strokeWidth={0.6} /><text x={15} y={8.6} fontSize={4.2} textAnchor="middle" fontWeight={700}>1</text></>, "Elevation marker: the arrow points at the wall drawn")}
      {row("code", <text x={15} y={7.5} fontSize={6} textAnchor="middle" fontWeight={700}>B24</text>, "Cabinet code, listed in the cabinet schedule")}
    </div>
  );
}

function ScheduleTable({ rows, empty }: { rows: ScheduleRow[]; empty: boolean }) {
  return (
    <div className="ds-schedule">
      <h3>Cabinet schedule</h3>
      <table className="ds-table">
        <thead>
          <tr><th>No.</th><th>Qty</th><th>Code</th><th>Description</th><th>Size (W x H x D)</th><th>Line</th><th>Finish</th><th>Room</th><th>Location</th><th>Changes</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.no}>
              <td className="tabular">{r.no}</td>
              <td className="tabular">{r.qty}</td>
              <td className="tabular"><b>{r.label}</b></td>
              <td>{r.description}</td>
              <td className="tabular">{r.size}</td>
              <td>{r.line}</td>
              <td>{r.finish}</td>
              <td>{r.room}</td>
              <td>{r.locations}</td>
              <td>{r.notes}</td>
            </tr>
          ))}
          {empty && <tr><td colSpan={10}>No cabinets placed yet.</td></tr>}
        </tbody>
      </table>
      <p className="ds-small">Cabinet codes are the manufacturer&apos;s order codes. Numbered from the top-left corner of the plan, clockwise: base cabinets, then wall, tall, fillers and panels, and appliances. Moldings, toe kicks and other order items are listed last.</p>
    </div>
  );
}

/** The title block, down the right side of every sheet. */
function TitleBlock({ spec, record, sheet, date }: { spec: PaperSpec; record: DesignRecord; sheet: Sheet; date: string }) {
  return (
    <aside className="ds-tb" style={{ width: `${spec.titleBlock}in` }}>
      <div className="ds-tb-firm">
        <Brand size={spec.titleBlock > 2 ? 26 : 20} />
        <div><b>{FIRM.name}</b></div>
        <div>{FIRM.dba}</div>
        <div>{FIRM.street}</div>
        <div>{FIRM.city}</div>
        <div>{FIRM.phone} · {FIRM.email}</div>
      </div>
      <div className="ds-tb-legal">
        <p>{LIABILITY}</p>
        <p>{copyright()}</p>
      </div>
      <dl className="ds-tb-fields">
        <dt>Owner</dt>
        <dd>
          {record.customer_name || "-"}
          {record.customer_address ? <><br />{record.customer_address}</> : null}
          {record.customer_phone ? <><br />{record.customer_phone}</> : null}
        </dd>
        <dt>Project</dt><dd>{record.name || "-"}</dd>
        <dt>Job no.</dt><dd className="tabular">{record.id.slice(0, 8).toUpperCase()}</dd>
        <dt>Drawn by</dt><dd>{initials(record.designer_name) || "-"}</dd>
        <dt>Checked by</dt><dd className="ds-blank">&nbsp;</dd>
        <dt>Date</dt><dd>{date}</dd>
        <dt>Revision</dt><dd>0</dd>
        <dt>Scale</dt><dd>{sheet.scale}</dd>
      </dl>
      <div className="ds-tb-approve">
        <div>Client approval</div>
        <div className="ds-blank">&nbsp;</div>
        <div>Date</div>
        <div className="ds-blank">&nbsp;</div>
      </div>
      <div className="ds-tb-sheet">
        <div className="ds-tb-sheet-title">{sheet.title}</div>
        <div className="ds-tb-sheet-id">{sheet.id}</div>
      </div>
    </aside>
  );
}
