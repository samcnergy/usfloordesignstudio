// Development only: the catalog screen with the standard catalog and no database.

import { notFound } from "next/navigation";
import { CatalogManager } from "@/components/app/CatalogManager";
import { STANDARD_CATALOG } from "@/lib/standard-catalog";

export default function SandboxCatalogPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="page">
      <h1 className="page-title" style={{ marginBottom: 24 }}>
        Catalog (sandbox)
      </h1>
      <CatalogManager catalog={STANDARD_CATALOG} admin />
    </main>
  );
}
