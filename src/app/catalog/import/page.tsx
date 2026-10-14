import Link from "next/link";
import { AppHeader } from "@/components/app/AppHeader";
import { ImportWizard } from "@/components/app/ImportWizard";
import { loadCatalog } from "@/lib/data";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import products" };

export default async function ImportPage() {
  const sb = await getSupabaseServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const admin = user?.app_metadata?.role === "admin";
  const catalog = admin ? await loadCatalog(sb) : null;
  return (
    <>
      <AppHeader current="catalog" email={user?.email ?? null} />
      <main className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">Import products</h1>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Load a manufacturer&apos;s cabinets and accessories from a price list, a spreadsheet or their website. <Link href="/catalog">Back to the catalog</Link>
            </p>
          </div>
        </div>
        {catalog ? <ImportWizard catalog={catalog} /> : <div className="error-box">Only an admin can import products.</div>}
      </main>
    </>
  );
}
