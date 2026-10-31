// Database reads and writes. Each function takes a Supabase client so the same
// code serves Server Components and the browser.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Catalog, Countertop, DesignData, DesignRecord, Finish, Manufacturer, Product, ProductLine } from "./types";
import { emptyDesign, normalizeRoom } from "./types";

const num = (v: unknown) => (v === null || v === undefined ? null : typeof v === "string" ? parseFloat(v) : (v as number));

function toProduct(r: Record<string, unknown>): Product {
  return {
    id: r.id as string,
    line_id: r.line_id as string,
    sku: r.sku as string,
    name: r.name as string,
    description: (r.description as string) ?? null,
    category: r.category as Product["category"],
    style: r.style as Product["style"],
    width: num(r.width),
    height: num(r.height),
    depth: num(r.depth),
    mount_height: num(r.mount_height),
    doors: (r.doors as number) ?? 0,
    drawers: (r.drawers as number) ?? 0,
    shelves: (r.shelves as number) ?? 0,
    split_height: num(r.split_height),
    placeable: r.placeable as boolean,
    image_url: (r.image_url as string) ?? null,
    source_url: (r.source_url as string) ?? null,
    sort: r.sort as number,
    active: r.active as boolean,
  };
}

function toFinish(r: Record<string, unknown>): Finish {
  return {
    id: r.id as string,
    line_id: (r.line_id as string) ?? null,
    name: r.name as string,
    vendor: (r.vendor as string) ?? null,
    color_hex: r.color_hex as string,
    image_url: (r.image_url as string) ?? null,
    source_url: (r.source_url as string) ?? null,
    door_style: (r.door_style as Finish["door_style"]) ?? "shaker",
    fill_mode: (r.fill_mode as Finish["fill_mode"]) ?? "color",
    sort: r.sort as number,
    active: r.active as boolean,
  };
}

function toCountertop(r: Record<string, unknown>): Countertop {
  return {
    id: r.id as string,
    name: r.name as string,
    color_hex: r.color_hex as string,
    image_url: (r.image_url as string) ?? null,
    thickness: num(r.thickness) ?? 1.5,
    sort: r.sort as number,
    active: r.active as boolean,
  };
}

/** PostgREST returns at most 1000 rows per request, so large tables are read in pages. */
async function selectAll(sb: SupabaseClient, table: string, order: string[]): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    let q = sb.from(table).select("*");
    for (const o of order) q = q.order(o);
    const { data, error } = await q.range(from, from + page - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}

export async function loadCatalog(sb: SupabaseClient): Promise<Catalog> {
  const [m, l, p, f, t] = await Promise.all([
    selectAll(sb, "ds_manufacturers", ["sort", "name"]),
    selectAll(sb, "ds_product_lines", ["sort", "name"]),
    selectAll(sb, "ds_products", ["sort", "sku"]),
    selectAll(sb, "ds_finishes", ["sort", "name"]),
    selectAll(sb, "ds_countertops", ["sort", "name"]),
  ]);
  return {
    manufacturers: m as unknown as Manufacturer[],
    lines: l as unknown as ProductLine[],
    products: p.map(toProduct),
    finishes: f.map(toFinish),
    countertops: t.map(toCountertop),
  };
}

export type DesignSummary = Pick<DesignRecord, "id" | "name" | "customer_name" | "designer_name" | "updated_at" | "created_at">;

export async function listDesigns(sb: SupabaseClient): Promise<DesignSummary[]> {
  const { data, error } = await sb
    .from("ds_designs")
    .select("id, name, customer_name, designer_name, updated_at, created_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

function normalizeData(raw: unknown): DesignData {
  const base = emptyDesign();
  const d = (raw ?? {}) as Partial<DesignData>;
  return {
    ...base,
    ...d,
    room: normalizeRoom(d.room),
    islands: d.islands ?? [],
    openings: d.openings ?? [],
    items: d.items ?? [],
    photos: d.photos ?? [],
    extras: d.extras ?? [],
    lineId: d.lineId ?? null,
    crown: typeof d.crown === "number" ? d.crown : 0,
  };
}

export async function getDesign(sb: SupabaseClient, id: string): Promise<DesignRecord | null> {
  const { data, error } = await sb.from("ds_designs").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...(data as DesignRecord), data: normalizeData(data.data) };
}

export async function createDesign(sb: SupabaseClient, fields: { name: string; customer_name: string | null; designer_name: string | null }): Promise<string> {
  const { data, error } = await sb
    .from("ds_designs")
    .insert({ ...fields, data: emptyDesign() })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function saveDesign(
  sb: SupabaseClient,
  id: string,
  meta: Pick<DesignRecord, "name" | "customer_name" | "customer_phone" | "customer_address" | "designer_name" | "notes">,
  data: DesignData,
): Promise<void> {
  const { error } = await sb
    .from("ds_designs")
    .update({ ...meta, name: meta.name.trim() || "Untitled kitchen", data })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteDesign(sb: SupabaseClient, id: string): Promise<void> {
  const { error } = await sb.from("ds_designs").delete().eq("id", id);
  if (error) throw error;
}

export async function duplicateDesign(sb: SupabaseClient, id: string): Promise<string> {
  const src = await getDesign(sb, id);
  if (!src) throw new Error("Design not found");
  const { data, error } = await sb
    .from("ds_designs")
    .insert({
      name: `${src.name} (copy)`,
      customer_name: src.customer_name,
      customer_phone: src.customer_phone,
      customer_address: src.customer_address,
      designer_name: src.designer_name,
      notes: src.notes,
      data: src.data,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "image/heif": "heif" };

export async function uploadImage(sb: SupabaseClient, folder: string, file: File): Promise<string> {
  const ext = EXT[file.type] ?? file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from("ds-images").upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return sb.storage.from("ds-images").getPublicUrl(path).data.publicUrl;
}

export async function isAdmin(sb: SupabaseClient): Promise<boolean> {
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user?.app_metadata?.role === "admin";
}
