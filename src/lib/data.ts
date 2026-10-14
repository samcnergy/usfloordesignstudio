// Database reads and writes. Each function takes a Supabase client so the same
// code serves Server Components and the browser.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Catalog, CatalogCabinet, Countertop, DesignData, DesignRecord, Finish } from "./types";
import { emptyDesign } from "./types";

const num = (v: unknown) => (typeof v === "string" ? parseFloat(v) : (v as number));
const nums = (v: unknown) => ((v as unknown[]) ?? []).map(num);

function toCabinet(r: Record<string, unknown>): CatalogCabinet {
  return {
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    category: r.category as CatalogCabinet["category"],
    style: r.style as CatalogCabinet["style"],
    widths: nums(r.widths),
    heights: nums(r.heights),
    default_height: num(r.default_height),
    depth: num(r.depth),
    mount_height: r.mount_height === null ? null : num(r.mount_height),
    image_url: (r.image_url as string) ?? null,
    sort: r.sort as number,
    active: r.active as boolean,
  };
}

function toFinish(r: Record<string, unknown>): Finish {
  return {
    id: r.id as string,
    name: r.name as string,
    vendor: (r.vendor as string) ?? null,
    color_hex: r.color_hex as string,
    image_url: (r.image_url as string) ?? null,
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
    thickness: num(r.thickness),
    sort: r.sort as number,
    active: r.active as boolean,
  };
}

export async function loadCatalog(sb: SupabaseClient): Promise<Catalog> {
  const [c, f, t] = await Promise.all([
    sb.from("ds_cabinets").select("*").order("sort").order("code"),
    sb.from("ds_finishes").select("*").order("sort").order("name"),
    sb.from("ds_countertops").select("*").order("sort").order("name"),
  ]);
  if (c.error) throw c.error;
  if (f.error) throw f.error;
  if (t.error) throw t.error;
  return {
    cabinets: (c.data ?? []).map(toCabinet),
    finishes: (f.data ?? []).map(toFinish),
    countertops: (t.data ?? []).map(toCountertop),
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
    room: { ...base.room, ...(d.room ?? {}) },
    islands: d.islands ?? [],
    openings: d.openings ?? [],
    items: d.items ?? [],
    photos: d.photos ?? [],
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
