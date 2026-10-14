// Reads a pasted table, a CSV file or an Excel workbook into rows keyed by our field names.

import { mapHeaders, type RawRow } from "./infer";

/** RFC 4180 style parser that also handles tab separated text pasted from a spreadsheet. */
export function parseDelimited(text: string): string[][] {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const firstLine = clean.split("\n", 1)[0] ?? "";
  const delim = firstLine.includes("\t") ? "\t" : firstLine.split(";").length > firstLine.split(",").length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && cell === "") quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export interface TableResult {
  rows: RawRow[];
  recognized: string[];
  ignored: string[];
}

export function tableToRows(table: string[][]): TableResult {
  if (!table.length) return { rows: [], recognized: [], ignored: [] };
  const headers = table[0];
  const map = mapHeaders(headers);
  const recognized = Object.values(map);
  const ignored = headers.filter((_, i) => !(i in map) && headers[i].trim() !== "");
  const rows = table.slice(1).map((r) => {
    const o: RawRow = {};
    r.forEach((v, i) => {
      const f = map[i];
      if (f) o[f] = (v ?? "").toString();
    });
    return o;
  });
  return { rows, recognized, ignored };
}

export async function readFile(file: File): Promise<string[][]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, { header: 1, raw: false, defval: "" });
    return data.map((r) => r.map((c) => (c === null || c === undefined ? "" : String(c)))).filter((r) => r.some((c) => c.trim() !== ""));
  }
  return parseDelimited(await file.text());
}

export const TEMPLATE_HEADERS = [
  "line",
  "sku",
  "name",
  "description",
  "heading",
  "category",
  "style",
  "width",
  "height",
  "depth",
  "mount_height",
  "doors",
  "drawers",
  "shelves",
  "split_height",
  "placeable",
  "image_url",
  "source_url",
];

export function templateCsv(): string {
  const rows = [
    TEMPLATE_HEADERS,
    ["American Style", "B12", "", 'Base Cabinet- 12"(W) x 34 1/2"(H) x 24"(D) 1 Drawer -1 Door -1 Shelf', "Base Cabinet", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ["American Style", "W2436", "Wall cabinet", "", "", "wall", "wall", "24", "36", "12", "54", "2", "0", "2", "", "", "", ""],
    ["American Style", "CM4", "Crown molding", "Crown Molding: 4''(W)x 96''(L)", "Accessories", "accessory", "", "", "", "", "", "", "", "", "", "no", "", ""],
  ];
  return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\n") + "\n";
}
