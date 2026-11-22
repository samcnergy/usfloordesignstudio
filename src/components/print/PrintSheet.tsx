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
import { ElevationView, elevationPaperSize, type ElevationRefs } from "@/components/drawing/ElevationView";
import { counterRuns } from "@/lib/countertop";
import { PlanView, planBox, type ElevationMark } from "@/components/drawing/PlanView";
import { View3D, DEFAULT_CAMERA } from "@/components/drawing/View3D";
import { roomShape } from "@/lib/geometry";
import { BASE_TOP, COUNTER_STYLES, DROP_DOOR } from "@/lib/plan";
import { needsDemoPlan, newOpeningKeys } from "@/lib/demo";
import { CabinetSection, EdgeDetail, sectionRun } from "@/components/drawing/Details";
import { GROUP_NAME, GROUP_ORDER, MEP_KINDS, TAG_MEANING, mepKey, mepOf, type MepItem, type MepSpec } from "@/lib/mep";
import { MepLegendGlyph } from "@/components/drawing/MepSymbols";
import { FINISH_USES, MATERIAL_NAME, USE_NAME, finishKeys, finishQuantity, finishesOf, hasFinishes, type FinishData, type FinishUse } from "@/lib/finishes";
import { buildSchedule, type ScheduleRow } from "@/lib/schedule";
import {
  FIRM, GENERAL_NOTES, INTERPRETATION, LIABILITY, PAPER, SCALES, copyright, drawingArea, fitScale, initials, roomName, sheetId,
  northAngle, wallDirections, wallsFromNorth, type Paper, type PaperSpec, type Scale,
} from "@/lib/sheets";
import type { Catalog, DesignRecord } from "@/lib/types";
import { liveOpenings } from "@/lib/types";
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

  // ---------- the section and detail references (K&B drawing standards, Chapter 4) ----------
  // The cabinet section (ID-5.02, drawing 1) is cut through a base cabinet; its marker goes on that wall's
  // elevation and its cutting plane on the floor plan. The countertop edge (ID-5.01, drawing 2) is marked
  // on the same elevation, around the counter edge.
  const cut = sectionRun(design);
  const hasCounters = design.items.some((i) => i.mountHeight === 0 && COUNTER_STYLES.has(i.style));
  const ctSheet = sheetId(5, 1);
  const secSheet = sheetId(5, 2);
  const counterThick = (catalog.countertops.find((c) => c.id === design.countertopId) ?? catalog.countertops[0])?.thickness ?? 1.5;
  const refsFor = (run: string): ElevationRefs | undefined => {
    if (!cut || run !== cut.run) return undefined;
    const spans = counterRuns(design, run);
    const first = spans[0];
    return {
      section: { s: cut.base.offset + cut.base.width / 3, n: 1, sheet: secSheet },
      ...(hasCounters && first ? { detail: { x0: first[0] - 1, x1: first[0] + 10, z0: BASE_TOP - 3, z1: BASE_TOP + counterThick + 3, n: 2, sheet: ctSheet } } : {}),
    };
  };

  // ---------- elevations: the north wall first, then clockwise, then islands ----------
  const walls = wallsFromNorth(design, shape.walls).filter(
    (w) => design.items.some((i) => i.run === w.id) || liveOpenings(design).some((o) => o.wall === w.id),
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
    const withRefs = !!refsFor(run);
    const fits = SCALES.map((s) => ({ s, size: elevationPaperSize(design, run, s.k, s.k * 0.13, withRefs) }))
      .find((x) => x.size && x.size.width <= elevSpace.width && x.size.height <= elevSpace.height);
    const pick = fits ?? { s: SCALES[SCALES.length - 1], size: elevationPaperSize(design, run, SCALES[SCALES.length - 1].k, SCALES[SCALES.length - 1].k * 0.13, withRefs) };
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
  // which sheet each elevation is drawn on, for the split bubbles that point to it
  const elevSheet = new Map<string, string>();
  elevationSheets.forEach((rows, si) => rows.flat().forEach((e) => elevSheet.set(e.run, sheetId(2, si + 1))));
  const marks: ElevationMark[] = elevations.filter((e) => shape.walls.some((w) => w.id === e.run)).map((e) => ({ wallId: e.run, n: e.n, sheet: elevSheet.get(e.run) }));
  const refSheet = cut ? elevSheet.get(cut.run) : undefined;

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
            cut={cut ? { run: cut.run, s: cut.base.offset + cut.base.width / 3, n: 1, sheet: secSheet } : undefined}
            room={{ name: room, ceiling: `CLG. HT. ${fmtIn(design.room.ceiling)}` }} />
          <TitleMarker n={1} title={`${room.toUpperCase()} FLOOR PLAN`} scale={planScale.label} />
        </div>
        <aside className="ds-plan-side" style={{ width: `${notesWidth}in` }}>
          <div className="ds-north"><NorthArrow angle={northAngle(design)} /></div>
          <h4>Legend</h4>
          <PlanLegend section={!!cut} soffit={(design.soffits ?? []).length > 0} />
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

  // ---------- the demolition and construction plan, right after the floor plan and its schedule ----------
  if (needsDemoPlan(design)) {
    const keys = newOpeningKeys(design);
    const demoScale =
      SCALES.find((s) => {
        const b = planBox(design, s.k * 0.12, 4);
        return b.width / s.k <= planSpace.width && b.height / s.k <= planSpace.height;
      }) ?? fitScale(box.width, box.height, planSpace);
    const removed = design.room.walls.some((w) => w.status === "removed");
    const closed = design.openings.filter((o) => o.status === "close");
    const built = design.room.walls.some((w) => w.status === "new") || closed.length > 0;
    const fresh = design.openings.filter((o) => keys.has(o.id)).sort((a, b) => (keys.get(a.id) ?? "").localeCompare(keys.get(b.id) ?? "", undefined, { numeric: true }));
    const demoNotes = [
      "Read with the floor plan, the interior elevations and the MEP plan.",
      ...(design.demo?.remove.length ? [`Remove: ${design.demo.remove.map((x) => x.replace(/^Existing /, "existing ").toLowerCase()).join("; ")}. Cap and protect the plumbing, gas and electrical left in place.`] : []),
      ...(design.demo?.notes?.trim() ? [design.demo.notes.trim()] : []),
      ...closed.map((o) => `Close the existing ${o.type === "door" ? "door" : o.type === "window" ? "window" : "opening"} on ${shape.walls.find((w) => w.id === o.wall)?.label ?? "its wall"} (${fmtIn(o.width)} wide, ${fmtIn(o.offset)} from the left end): remove the ${o.type === "door" ? "door, frame and casing" : o.type === "window" ? "window, frame and casing" : "casing"}, frame in to match the wall, and finish flush with the wall around it${o.type === "window" ? "; the outside finished to match the exterior" : ""}.`),
      "Walls, doors and windows not marked stay. Protect them, the floors beyond the work area and anything staying.",
      ...(removed || built ? ["Confirm with a structural engineer before altering any wall that may be load-bearing; the engineer's drawings join this set."] : []),
      "New walls and openings are dimensioned from the finished drywall; new doors and windows by their centerlines from the corner.",
      "Blocking in the wall behind every wall cabinet and the hood, the full run shown, for the cabinet hanging rail and screws.",
      "Report any condition found that was hidden when the room was measured before going on.",
    ];
    const demoId = sheetId(1, 2 + schedulePages.length);
    add({
      id: demoId, title: `${room} Demolition and Construction Plan`, scale: demoScale.label,
      body: (
        <div className="ds-plan">
          <div className="ds-plan-draw">
            <PlanView design={design} catalog={catalog} print={{ scale: demoScale.k }} demo={{ keys }}
              room={{ name: room, ceiling: `CLG. HT. ${fmtIn(design.room.ceiling)}` }} />
            <TitleMarker n={1} title={`${room.toUpperCase()} DEMOLITION AND CONSTRUCTION PLAN`} scale={demoScale.label} />
          </div>
          <aside className="ds-plan-side ds-mep-side" style={{ width: `${notesWidth}in` }}>
            <div className="ds-north"><NorthArrow angle={northAngle(design)} /></div>
            <h4>Wall types</h4>
            <div className="ds-legend">
              <div className="ds-legend-row"><svg width="0.45in" height="0.2in" viewBox="0 0 22 10" aria-hidden="true"><rect x={1} y={2.5} width={20} height={5} fill="#FFF" stroke="#000" strokeWidth={0.6} /></svg><span>Existing wall, stays</span></div>
              {built && <div className="ds-legend-row"><svg width="0.45in" height="0.2in" viewBox="0 0 22 10" aria-hidden="true"><defs><pattern id="lg-new" patternUnits="userSpaceOnUse" width={2} height={2} patternTransform="rotate(45)"><line x1={0} y1={0} x2={0} y2={2} stroke="#000" strokeWidth={0.4} /></pattern></defs><rect x={1} y={2.5} width={20} height={5} fill="url(#lg-new)" stroke="#000" strokeWidth={0.6} /></svg><span>New partition: 2x4 wood studs at 16&quot; o.c., 1/2&quot; gypsum board both sides (2x6 where it carries plumbing)</span></div>}
              {removed && <div className="ds-legend-row"><svg width="0.45in" height="0.2in" viewBox="0 0 22 10" aria-hidden="true"><rect x={1} y={2.5} width={20} height={5} fill="none" stroke="#6D7276" strokeWidth={0.5} strokeDasharray="2 1.4" /></svg><span>Existing wall to be removed</span></div>}
            </div>
            <h4>Legend</h4>
            <div className="ds-legend">
              <div className="ds-legend-row"><svg width="0.45in" height="0.2in" viewBox="0 0 22 10" aria-hidden="true"><defs><pattern id="lg-blk" patternUnits="userSpaceOnUse" width={2} height={2}><path d="M 0 0 L 2 2 M 2 0 L 0 2" stroke="#000" strokeWidth={0.3} /></pattern></defs><rect x={1} y={3.5} width={20} height={3} fill="url(#lg-blk)" stroke="#000" strokeWidth={0.4} /></svg><span>Wall blocking for wall cabinets and the hood</span></div>
              {fresh.length > 0 && <div className="ds-legend-row"><svg width="0.45in" height="0.2in" viewBox="0 0 22 10" aria-hidden="true"><polygon points="7,5 9.5,1 14.5,1 17,5 14.5,9 9.5,9" fill="#FFF" stroke="#000" strokeWidth={0.5} /></svg><span>New door (D) or window (W), see the schedule</span></div>}
              <div className="ds-legend-row"><svg width="0.45in" height="0.2in" viewBox="0 0 22 10" aria-hidden="true"><line x1={1} x2={21} y1={6} y2={6} stroke="#000" strokeWidth={0.4} strokeDasharray="5 1.2 1.2 1.2" /><text x={11} y={4} fontSize={4} textAnchor="middle">{"\u2104"}</text></svg><span>Centerline</span></div>
            </div>
            <h4>Plan notes</h4>
            <ol>{demoNotes.map((n, i) => <li key={i}>{n}</li>)}</ol>
            {fresh.length > 0 && (
              <>
                <h4>Door and window schedule</h4>
                <table className="ds-table ds-table-tight">
                  <thead><tr><th>Key</th><th>Type</th><th>Size (W x H)</th><th>Sill AFF</th><th>Frame / hardware</th></tr></thead>
                  <tbody>{fresh.map((o) => (
                    <tr key={o.id}><td><b>{keys.get(o.id)}</b></td><td>{o.type === "door" ? `Door, hinged ${o.hinge}` : o.type === "window" ? "Window" : "Cased opening"}</td>
                      <td className="tabular">{fmtIn(o.width)} x {fmtIn(o.height)}</td><td className="tabular">{o.type === "window" ? fmtIn(o.sill) : ""}</td><td></td></tr>
                  ))}</tbody>
                </table>
              </>
            )}
          </aside>
        </div>
      ),
    });
  }

  elevationSheets.forEach((rows, si) => add({
    id: sheetId(2, si + 1), title: "Interior Elevations",
    scale: new Set(rows.flat().map((e) => e.scale.label)).size === 1 ? rows[0][0].scale.label : "As noted",
    body: (
      <div className="ds-elev">
        {rows.map((r, ri) => (
          <div className="ds-elev-row" key={ri}>
            {r.map((e) => (
              <div className="ds-elev-cell" key={e.run}>
                <ElevationView design={design} catalog={catalog} run={e.run} print={{ scale: e.scale.k }} refs={refsFor(e.run)} />
                <TitleMarker n={e.n} sheetRef={planId} title={e.title} scale={e.scale.label} />
              </div>
            ))}
          </div>
        ))}
      </div>
    ),
  }));

  // ---------- the electrical, lighting and plumbing plan, and its schedules ----------
  const mep = mepOf(design);
  if (mep.items.length) {
    const mepScale =
      SCALES.find((s) => {
        const b = planBox(design, s.k * 0.12, 3);
        return b.width / s.k <= planSpace.width && b.height / s.k <= planSpace.height;
      }) ?? fitScale(box.width, box.height, planSpace);
    const mepId = sheetId(3, 1);
    const schedId = sheetId(3, 2);
    // the legend stays beside the plan; the notes join it when there is room, otherwise they lead the schedule sheet
    const legendRows = new Set(mep.items.map(mepKey)).size + 1;
    const notesOnPlan = paper === "tabloid" && legendRows <= 18;
    const notes = mepNotes(mep);
    add({
      id: mepId, title: `${room} Electrical, Lighting and Plumbing Plan`, scale: mepScale.label,
      body: (
        <div className="ds-plan">
          <div className="ds-plan-draw">
            <PlanView design={design} catalog={catalog} print={{ scale: mepScale.k }} mep={{ items: mep.items }}
              room={{ name: room, ceiling: `CLG. HT. ${fmtIn(design.room.ceiling)}` }} />
            <TitleMarker n={1} title={`${room.toUpperCase()} MEP PLAN`} scale={mepScale.label} />
          </div>
          <aside className="ds-plan-side ds-mep-side" style={{ width: `${notesWidth}in` }}>
            <div className="ds-north"><NorthArrow angle={northAngle(design)} /></div>
            <h4>MEP legend</h4>
            <MepLegend items={mep.items} />
            {notesOnPlan ? (
              <>
                <h4>Plan notes</h4>
                <ol>{notes.map((n, i) => <li key={i}>{n}</li>)}</ol>
              </>
            ) : <p className="ds-small"><b>Plan notes are on sheet {schedId}.</b></p>}
            <p className="ds-small">Lighting and MEP schedules: sheet {schedId}.</p>
          </aside>
        </div>
      ),
    });
    add({
      id: schedId, title: "Lighting and MEP Schedules", scale: "None",
      body: (
        <>
          {!notesOnPlan && (
            <div className="ds-schedule">
              <h3>MEP plan notes (sheet {mepId})</h3>
              <ol className="ds-notes-cols">{notes.map((n, i) => <li key={i}>{n}</li>)}</ol>
            </div>
          )}
          <MepSchedules items={mep.items} specs={mep.specs} room={room} sheet={mepId} parts={paper === "tabloid" ? ["lighting", "mep"] : ["lighting"]} />
        </>
      ),
    });
    // on Letter the MEP schedule gets its own sheet, right after
    if (paper !== "tabloid") add({
      id: sheetId(3, 3), title: "MEP Schedule", scale: "None",
      body: <MepSchedules items={mep.items} specs={mep.specs} room={room} sheet={mepId} parts={["mep"]} />,
    });
  }

  // ---------- the finish plan and finish schedule ----------
  if (hasFinishes(design)) {
    const fin = finishesOf(design);
    const keys = finishKeys(fin);
    const thick = counter?.thickness ?? 1.5;
    const finScale =
      SCALES.find((s) => {
        const b = planBox(design, s.k * 0.12, 1);
        return b.width / s.k <= planSpace.width && b.height / s.k <= planSpace.height;
      }) ?? fitScale(box.width, box.height, planSpace);
    const finId = sheetId(4, 1);
    const finSched = sheetId(4, 2);
    const notes = finishNotes(fin, counter?.name);
    add({
      id: finId, title: `${room} Finish Plan`, scale: finScale.label,
      body: (
        <div className="ds-plan">
          <div className="ds-plan-draw">
            <PlanView design={design} catalog={catalog} print={{ scale: finScale.k }} finish={{ data: fin, keys, counterThick: thick }}
              room={{ name: room, ceiling: `CLG. HT. ${fmtIn(design.room.ceiling)}` }} />
            <TitleMarker n={1} title={`${room.toUpperCase()} FINISH PLAN`} scale={finScale.label} />
          </div>
          <aside className="ds-plan-side" style={{ width: `${notesWidth}in` }}>
            <div className="ds-north"><NorthArrow angle={northAngle(design)} /></div>
            <h4>Finish symbol</h4>
            <p className="ds-small">The boxes are the wall finishes, each on the side of its wall; the gray circle is the floor; the box above is the ceiling and the box below the base. Tags with a dot mark the backsplash.</p>
            <h4>Finishes</h4>
            <ol className="ds-key-list">{FINISH_USES.filter((u) => fin.uses[u]).map((u) => <li key={u}><b>{keys[u]}</b> {USE_NAME[u]}: {fin.uses[u]!.description || MATERIAL_NAME[fin.uses[u]!.material]}</li>)}</ol>
            <h4>Plan notes</h4>
            <ol>{notes.map((n, i) => <li key={i}>{n}</li>)}</ol>
            <p className="ds-small">Finish schedule: sheet {finSched}.</p>
          </aside>
        </div>
      ),
    });
    add({
      id: finSched, title: "Finish Schedule", scale: "None",
      body: <FinishSchedule design={design} fin={fin} keys={keys} room={room} thick={thick} sheet={finId} directions={directions} />,
    });
  }

  // ---------- the countertop plan, with the edge detail beside it ----------
  if (hasCounters) {
    const fin = finishesOf(design);
    const sink = fin.sink ?? {};
    const ctScale =
      SCALES.find((s) => {
        const b = planBox(design, s.k * 0.12, 3);
        return b.width / s.k <= planSpace.width && b.height / s.k <= planSpace.height;
      }) ?? fitScale(box.width, box.height, planSpace);
    const thick = counter?.thickness ?? 1.5;
    const holes = sink.faucetHoles ?? 0;
    const ctNotes = [
      `Countertop: ${counter?.name ?? "as selected"}, ${fmtIn(thick)} thick, ${fin.counterEdge ?? "edge to be selected"} edge (detail 2). Overhang 1" past the cabinet door faces; 1" all round on an island.`,
      "Counter depth is the cabinet depth plus the overhang, dimensioned at the end of each run. Note any change for inset or lipped doors before template.",
      `Sink: ${sink.model || "model to be selected"}, ${fin.sinkMount ?? "mounting to be selected"}${fin.sinkMount === "undermount" && sink.reveal ? `, ${sink.reveal} reveal` : ""}. ${sink.cutout?.w && sink.cutout?.d ? `Cutout ${fmtIn(sink.cutout.w)} x ${fmtIn(sink.cutout.d)}, centered on the sink base${fin.sinkMount?.startsWith("farmhouse") ? ", through the front edge for the apron" : ", centered front to back"}; cut from the manufacturer's template.` : "Cutout per the sink manufacturer's template."}`,
      holes > 0 ? `Faucet: ${holes} hole${holes > 1 ? "s" : ""}${sink.holeSize ? `, ${fmtIn(sink.holeSize)} diameter` : ", size per the faucet spec sheet"}${holes > 1 && sink.spread ? `, ${fmtIn(sink.spread)} spread center to center` : ""}, on the sink centerline behind the bowl.` : "Faucet holes: none drilled in the counter (deck or wall faucet per the plumbing plan), or as shown at template.",
      "Ranges are not drawn; the clear opening between the counter edges is dimensioned at each one.",
      "Seams placed by the fabricator for the slabs used, kept out of the sink and cooktop areas, and shown to the designer before cutting.",
      "Fabricator templates after the cabinets are set and level; verify all sizes in the field.",
    ];
    add({
      id: ctSheet, title: `${room} Countertop Plan`, scale: ctScale.label,
      body: (
        <div className="ds-plan">
          <div className="ds-plan-draw">
            <PlanView design={design} catalog={catalog} print={{ scale: ctScale.k }} counter={{ spec: fin.sink, mount: fin.sinkMount }}
              room={{ name: room, ceiling: `CLG. HT. ${fmtIn(design.room.ceiling)}` }} />
            <TitleMarker n={1} title={`${room.toUpperCase()} COUNTERTOP PLAN`} scale={ctScale.label} />
          </div>
          <aside className="ds-plan-side ds-mep-side" style={{ width: `${notesWidth}in` }}>
            <div className="ds-north"><NorthArrow angle={northAngle(design)} /></div>
            <h4>Plan notes</h4>
            <ol>{ctNotes.map((n, i) => <li key={i}>{n}</li>)}</ol>
            <h4>Edge detail</h4>
            <EdgeDetail scale={4} thickness={thick} edge={fin.counterEdge ?? null} />
            <TitleMarker n={2} sheetRef={refSheet} title="COUNTERTOP EDGE DETAIL" scale={'3" = 1\'-0"'} />
          </aside>
        </div>
      ),
    });
  }

  // ---------- details: the typical cabinet section ----------
  if (cut) {
    const DETAIL_SCALES: Scale[] = [
      { k: 8, label: '1 1/2" = 1\'-0"' }, { k: 12, label: '1" = 1\'-0"' }, { k: 16, label: '3/4" = 1\'-0"' }, { k: 24, label: '1/2" = 1\'-0"' },
    ];
    const H = design.room.ceiling;
    const secScale = DETAIL_SCALES.find((sc) => (H + sc.k * 0.11 * 7) / sc.k <= area.height - MARKER) ?? DETAIL_SCALES[DETAIL_SCALES.length - 1];
    const fin = finishesOf(design);
    const fkeys = finishKeys(fin);
    const wallName = shape.walls.find((w) => w.id === cut.run)?.label;
    const secTitle = `TYPICAL CABINET SECTION${wallName ? ` AT ${wallName.toUpperCase()}` : ""}`;
    add({
      id: secSheet, title: "Details", scale: secScale.label,
      body: (
        <div className="ds-details">
          <div className="ds-elev-cell">
            <CabinetSection design={design} scale={secScale.k} counter={counter ? { name: counter.name, thickness: counter.thickness ?? 1.5 } : null}
              splash={fin.uses.backsplash ? fkeys.backsplash ?? null : null} floorKey={fin.uses.floor ? fkeys.floor ?? null : null} />
            <TitleMarker n={1} sheetRef={refSheet} title={secTitle} scale={secScale.label} />
          </div>
        </div>
      ),
    });
  }

  // ---------- the soffit plan ----------
  if ((design.soffits ?? []).length) {
    const sos = design.soffits ?? [];
    const soScale =
      SCALES.find((s) => {
        const b = planBox(design, s.k * 0.12, 3);
        return b.width / s.k <= planSpace.width && b.height / s.k <= planSpace.height;
      }) ?? fitScale(box.width, box.height, planSpace);
    // a soffit deeper or shallower than the wall cabinets under it is why this plan is required (K&B drawing standards)
    const differs = sos.some((so) => design.items.some((i) => i.run === so.wall && i.category === "wall" && i.offset < so.s1 && so.s0 < i.offset + i.width && Math.abs(i.depth - so.depth) > 0.01));
    const soNotes = [
      "Read with the floor plan, the interior elevations and the MEP plan.",
      ...sos.map((so, i) => `Soffit ${i + 1}, ${shape.walls.find((w) => w.id === so.wall)?.label ?? ""}: ${fmtIn(so.s1 - so.s0)} long, ${fmtIn(so.depth)} deep, bottom ${fmtIn(so.bottom)} above the finished floor.`),
      ...(differs ? ["The soffit depth differs from the wall cabinets below it; the soffit face is set as dimensioned, not to the cabinet face."] : ["Soffit faces line up with the wall cabinet faces below."]),
      "Confirm ducts, pipes and framing in the soffit area before building; anything found goes to the designer.",
      "Soffits finished to match the walls unless the finish schedule says otherwise.",
    ];
    add({
      id: sheetId(5, 3), title: `${room} Soffit Plan`, scale: soScale.label,
      body: (
        <div className="ds-plan">
          <div className="ds-plan-draw">
            <PlanView design={design} catalog={catalog} print={{ scale: soScale.k }} soffit
              room={{ name: room, ceiling: `CLG. HT. ${fmtIn(design.room.ceiling)}` }} />
            <TitleMarker n={1} title={`${room.toUpperCase()} SOFFIT PLAN`} scale={soScale.label} />
          </div>
          <aside className="ds-plan-side" style={{ width: `${notesWidth}in` }}>
            <div className="ds-north"><NorthArrow angle={northAngle(design)} /></div>
            <h4>Legend</h4>
            <div className="ds-legend">
              <div className="ds-legend-row"><svg width="0.45in" height="0.2in" viewBox="0 0 22 10" aria-hidden="true"><defs><pattern id="lg-so" patternUnits="userSpaceOnUse" width={2} height={2} patternTransform="rotate(45)"><line x1={0} y1={0} x2={0} y2={2} stroke="#888" strokeWidth={0.4} /></pattern></defs><rect x={1} y={2.5} width={20} height={5} fill="url(#lg-so)" stroke="#000" strokeWidth={0.6} /></svg><span>Soffit, below the ceiling</span></div>
              <div className="ds-legend-row"><svg width="0.45in" height="0.2in" viewBox="0 0 22 10" aria-hidden="true"><rect x={1} y={2.5} width={20} height={5} fill="none" stroke="#C4C6C8" strokeWidth={0.5} /></svg><span>Cabinets below, for reference</span></div>
            </div>
            <h4>Plan notes</h4>
            <ol>{soNotes.map((n, i) => <li key={i}>{n}</li>)}</ol>
          </aside>
        </div>
      ),
    });
  }

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

function finishNotes(fin: FinishData, counterName?: string): string[] {
  const tile = FINISH_USES.some((u) => fin.uses[u]?.material === "tile" || fin.uses[u]?.material === "stone");
  return [
    "Read with the floor plan and the interior elevations. Wall tile layout is shown on the elevations.",
    `Countertop: ${counterName ?? "as scheduled"}${fin.counterEdge ? `, ${fin.counterEdge} edge` : ""}. ${fin.sinkMount ? `Sink ${fin.sinkMount}.` : "Sink mounting per the fabricator and the sink chosen."} Fabricator templates after the cabinets are set.`,
    ...(tile ? ["Tile: grout, trims and setting materials as scheduled for each tile. Set out from the center of each wall or the main sightline so cut tiles at the ends are equal."] : []),
    ...(fin.uses.floor ? ["Flooring runs under the appliances and to the cabinet toe kicks; transitions at the doorways flush where the materials allow."] : []),
    ...(fin.uses.walls?.material === "paint" || fin.uses.ceiling?.material === "paint" ? ["Paint: walls and ceiling to a smooth finish ready for paint; sheen as scheduled."] : []),
    "Quantities are measured from the drawings with no allowance for waste; the installer orders the overage.",
  ];
}

/** Finish schedule in the book's column order: key, room, description, maker, product, color, notes, quantity, floor, walls, ceiling, supplied, installed. */
function FinishSchedule({ design, fin, keys, room, thick, sheet, directions }: {
  design: DesignRecord["data"]; fin: FinishData; keys: Partial<Record<FinishUse, string>>; room: string; thick: number; sheet: string; directions: Map<string, string>;
}) {
  // one row per key; a finish used in two places (walls and ceiling paint) shows both
  const rows = new Map<string, FinishUse[]>();
  for (const u of FINISH_USES) if (fin.uses[u] && keys[u]) rows.set(keys[u]!, [...(rows.get(keys[u]!) ?? []), u]);
  const order = ["NORTH", "EAST", "SOUTH", "WEST", "NORTHEAST", "SOUTHEAST", "SOUTHWEST", "NORTHWEST"];
  const wallsText = [...new Set([...directions.values()])].sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((d) => d[0] + (d.length > 5 ? d[5] : "")).join(", ");
  const splashWalls = [...new Set(design.items.filter((i) => i.mountHeight === 0).map((i) => directions.get(i.run)).filter((d): d is string => !!d))]
    .sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((d) => d[0] + (d.length > 5 ? d[5] : "")).join(", ");
  return (
    <div className="ds-schedule">
      <h3>Finish schedule ({room}, sheet {sheet})</h3>
      <table className="ds-table">
        <thead><tr><th>Key</th><th>Room</th><th>Description</th><th>Manufacturer</th><th>Product no.</th><th>Color / finish</th><th>Notes</th><th>Qty</th><th>Floor</th><th>Walls</th><th>Ceiling</th><th>Supplied by</th><th>Installed by</th></tr></thead>
        <tbody>
          {[...rows.entries()].map(([key, uses]) => {
            const e = fin.uses[uses[0]]!;
            return (
              <tr key={key}>
                <td className="tabular"><b>{key}</b></td>
                <td>{room}</td>
                <td>{e.description || MATERIAL_NAME[e.material]} ({uses.join(", ")}){e.size ? `, ${e.size.w}" x ${e.size.l}"` : ""}</td>
                <td>{e.manufacturer ?? ""}</td>
                <td>{e.product ?? ""}</td>
                <td>{e.color ?? ""}</td>
                <td>{e.notes ?? ""}</td>
                <td className="tabular">{uses.map((u) => finishQuantity(design, u, thick)).join(" + ")}</td>
                <td className="ds-dot">{uses.includes("floor") ? "\u25CF" : ""}</td>
                <td>{[uses.includes("walls") ? wallsText : "", uses.includes("backsplash") ? `${splashWalls} (backsplash)` : "", uses.includes("base") ? "Base, where the walls show" : ""].filter(Boolean).join("; ")}</td>
                <td className="ds-dot">{uses.includes("ceiling") ? "\u25CF" : ""}</td>
                <td>{e.suppliedBy ?? ""}</td>
                <td>{e.installedBy ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="ds-small">Walls are listed north, east, south, west. Blank cells are filled in on the Finishes tab of the design, or by hand before the drawings are issued.</p>
    </div>
  );
}

/** The MEP legend: every symbol on the plan, grouped mechanical, electrical, lighting, plumbing (K&B drawing standards). */
function MepLegend({ items }: { items: MepItem[] }) {
  const rows = new Map<string, MepItem>();
  for (const g of GROUP_ORDER) for (const m of items) if (MEP_KINDS[m.kind].group === g && !rows.has(mepKey(m))) rows.set(mepKey(m), m);
  let group = "";
  return (
    <div className="ds-legend">
      {[...rows.values()].map((m) => {
        const info = MEP_KINDS[m.kind];
        const head = info.group !== group ? (group = info.group, <div className="ds-legend-group" key={`g-${info.group}`}>{GROUP_NAME[info.group]}</div>) : null;
        const tag = m.tag ? ` ${m.tag}${TAG_MEANING[m.tag] ? ` (${TAG_MEANING[m.tag]})` : ""}` : "";
        return (
          <div key={mepKey(m)}>
            {head}
            <div className="ds-legend-row">
              <MepLegendGlyph kind={m.kind} tag={m.tag} />
              <span>{info.name}{tag}{m.aff ? `. ${m.aff}` : ""}{m.kind === "exhaust" && m.note ? `. ${m.note}` : ""}</span>
            </div>
          </div>
        );
      })}
      <div className="ds-legend-row">
        <svg width="0.45in" height="0.26in" viewBox="0 0 22 14" aria-hidden="true"><path d="M 1 11 Q 11 2 21 11" fill="none" stroke="#000" strokeWidth={0.9} strokeDasharray="5 1.6 0.6 1.6" /></svg>
        <span>Switching line: the switch and the lights it controls</span>
      </div>
    </div>
  );
}

function mepNotes(mep: ReturnType<typeof mepOf>): string[] {
  const has = (k: string) => mep.items.some((m) => m.kind === k);
  return [
    "Read with the floor plan and the interior elevations. All work to the current electrical, plumbing and mechanical codes; the electrician sizes and circuits everything.",
    "Countertop receptacles are ground fault protected (GFCI), in the backsplash, so that no point along the counter is more than 24\" from a receptacle.",
    "Dishwasher, disposal, refrigerator, microwave and range each on their own circuit as the code and the manufacturer require.",
    ...(mep.rangeFuel === "gas" ? ["Range is gas: gas shut-off valve and a 120V receptacle for the igniter behind the range, within reach once it is pulled out."] : []),
    ...(mep.rangeFuel === "electric" ? ["Range is electric: 240V range receptacle behind the range."] : []),
    ...(mep.rangeFuel === null ? ["Range fuel not chosen yet: confirm gas or electric before rough-in."] : []),
    ...(has("exhaust") ? ["Hood exhaust in rigid metal duct, the size the hood manufacturer calls for, to the exterior. Make-up air where the code requires it."] : []),
    "Locate the vent stack and waste lines in the field before rough-in; keep every clean-out accessible and clear of the cabinets.",
    "Light switches 48\" above the finished floor to the center of the box. Dimmers where shown (DM).",
    "Recessed and pendant lights are located by the dimensions to their centers from the walls shown.",
  ];
}

/** Lighting and switching schedule on top, MEP schedule below (K&B drawing standards, Chapter 11). */
function MepSchedules({ items, specs, room, sheet, parts }: { items: MepItem[]; specs: Record<string, MepSpec>; room: string; sheet: string; parts: ("lighting" | "mep")[] }) {
  const rows = (which: "lighting" | "mep") => {
    const map = new Map<string, { m: MepItem; qty: number; len: number }>();
    for (const g of GROUP_ORDER) for (const m of items) {
      const info = MEP_KINDS[m.kind];
      if (info.group !== g || info.schedule !== which) continue;
      const k = mepKey(m);
      const r = map.get(k) ?? { m, qty: 0, len: 0 };
      r.qty += 1;
      r.len += m.length ?? 0;
      map.set(k, r);
    }
    return [...map.entries()];
  };
  const cell = (v?: string) => v?.trim() || "";
  const lighting = rows("lighting");
  const others = rows("mep");
  return (
    <div className="ds-schedule">
      {parts.includes("lighting") && <>
      <h3>Lighting and switching schedule ({room}, sheet {sheet})</h3>
      <table className="ds-table">
        <thead><tr><th>Key</th><th>Description</th><th>Manufacturer</th><th>Product no.</th><th>Color / finish</th><th>Kelvin / CRI</th><th>Notes</th><th>Qty</th><th>Supplied by</th><th>Installed by</th></tr></thead>
        <tbody>
          {lighting.map(([k, r]) => {
            const sp = specs[k] ?? {};
            return (
              <tr key={k}>
                <td className="tabular"><b>{r.m.tag || (r.m.kind === "switch" ? "S" : "-")}</b></td>
                <td>{cell(sp.description) || MEP_KINDS[r.m.kind].name}{r.m.tag && TAG_MEANING[r.m.tag] ? `, ${TAG_MEANING[r.m.tag]}` : ""}</td>
                <td>{cell(sp.manufacturer)}</td><td>{cell(sp.product)}</td><td>{cell(sp.finish)}</td><td>{cell(sp.kelvin)}</td>
                <td>{cell(sp.notes) || r.m.aff}</td>
                <td className="tabular">{r.qty} ea{r.len ? `, ${fmtIn(r.len)} total` : ""}</td>
                <td>{cell(sp.suppliedBy)}</td><td>{cell(sp.installedBy)}</td>
              </tr>
            );
          })}
          {!lighting.length && <tr><td colSpan={10}>No lights or switches on the plan.</td></tr>}
        </tbody>
      </table>
      </>}
      {parts.includes("mep") && <>
      <h3>MEP schedule ({room}, sheet {sheet})</h3>
      <table className="ds-table">
        <thead><tr><th>Key</th><th>Description</th><th>Manufacturer</th><th>Product no.</th><th>Color / finish</th><th>Notes</th><th>Qty</th><th>Supplied by</th><th>Installed by</th></tr></thead>
        <tbody>
          {others.map(([k, r]) => {
            const sp = specs[k] ?? {};
            return (
              <tr key={k}>
                <td className="tabular"><b>{r.m.tag || "-"}</b></td>
                <td>{cell(sp.description) || MEP_KINDS[r.m.kind].name}{r.m.tag && TAG_MEANING[r.m.tag] ? `, ${TAG_MEANING[r.m.tag]}` : ""}</td>
                <td>{cell(sp.manufacturer)}</td><td>{cell(sp.product)}</td><td>{cell(sp.finish)}</td>
                <td>{cell(sp.notes) || [r.m.aff, r.m.note].filter(Boolean).join(". ")}</td>
                <td className="tabular">{r.qty} ea</td>
                <td>{cell(sp.suppliedBy)}</td><td>{cell(sp.installedBy)}</td>
              </tr>
            );
          })}
          {!others.length && <tr><td colSpan={9}>Nothing on the plan yet.</td></tr>}
        </tbody>
      </table>
      </>}
      <p className="ds-small">Blank cells are filled in on the Electrical tab of the design, or by hand before the drawings are issued.</p>
    </div>
  );
}

/** The plan legend: the line types and symbols used on the plan (K&B drawing standards: a legend on every plan). */
function PlanLegend({ section, soffit }: { section?: boolean; soffit?: boolean }) {
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
      {soffit && row("soffit", <rect x={1} y={2.5} width={28} height={6} fill="none" stroke="#000" strokeWidth={0.6} strokeDasharray="4 1.5" />, "Soffit above (overhead), its bottom height noted")}
      {section && row("cut", <><line x1={1} x2={14} y1={5.5} y2={5.5} stroke="#000" strokeWidth={0.7} strokeDasharray="3 1" /><line x1={1} x2={1} y1={3} y2={8} stroke="#000" strokeWidth={1.4} /><polygon points="27,5.5 21,2.5 21,8.5" fill="#000" /><circle cx={19} cy={5.5} r={4.2} fill="#FFF" stroke="#000" strokeWidth={0.5} /><line x1={14.8} x2={23.2} y1={5.5} y2={5.5} stroke="#000" strokeWidth={0.4} /></>, "Section cut: the arrow points the way the section looks; drawing number over its sheet")}
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
