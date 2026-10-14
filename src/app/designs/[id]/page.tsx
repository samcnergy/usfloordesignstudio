import { notFound } from "next/navigation";
import { DesignEditor } from "@/components/editor/DesignEditor";
import { getDesign, loadCatalog } from "@/lib/data";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DesignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = await getSupabaseServerClient();
  const [record, catalog] = await Promise.all([getDesign(sb, id), loadCatalog(sb)]);
  if (!record) notFound();
  return <DesignEditor record={record} catalog={catalog} />;
}
