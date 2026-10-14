// Copies a vendor photo into our own storage so the catalog does not depend on the
// vendor's website. Admins only; the upload runs under the admin's own session, so
// storage row level security applies exactly as it does in the browser.

import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const MAX_BYTES = 10 * 1024 * 1024;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export async function POST(req: NextRequest) {
  const sb = await getSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (user.app_metadata?.role !== "admin") return NextResponse.json({ error: "Only an admin can copy catalog photos." }, { status: 403 });

  let body: { url?: string; folder?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  let url: URL;
  try {
    url = new URL(body.url ?? "");
  } catch {
    return NextResponse.json({ error: "Not a valid web address." }, { status: 400 });
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return NextResponse.json({ error: "Only web addresses can be copied." }, { status: 400 });
  const folder = (body.folder ?? "catalog").replace(/[^a-z0-9/_-]/gi, "").slice(0, 80) || "catalog";

  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20000), headers: { "User-Agent": "USFloorDesignStudio/1.0 (catalog photo copy)" } });
  } catch {
    return NextResponse.json({ error: "Could not reach that address." }, { status: 502 });
  }
  if (!res.ok) return NextResponse.json({ error: `The vendor site answered ${res.status}.` }, { status: 502 });
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const ext = EXT[type];
  if (!ext) return NextResponse.json({ error: "That address is not a JPEG, PNG, WebP or GIF image." }, { status: 415 });
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return NextResponse.json({ error: "Image is larger than 10 MB." }, { status: 413 });

  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from("ds-images").upload(path, buf, { contentType: type, upsert: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const publicUrl = sb.storage.from("ds-images").getPublicUrl(path).data.publicUrl;
  return NextResponse.json({ url: publicUrl });
}
