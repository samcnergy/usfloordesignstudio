"use client";

// Connects the editor to Supabase: autosave and photo uploads.

import { useCallback, useMemo } from "react";
import { saveDesign, uploadImage } from "@/lib/data";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Catalog, DesignData, DesignRecord } from "@/lib/types";
import { Editor } from "./Editor";

export function DesignEditor({ record, catalog }: { record: DesignRecord; catalog: Catalog }) {
  const sb = useMemo(() => getSupabaseBrowserClient(), []);
  const persist = useCallback(
    (meta: Parameters<typeof saveDesign>[2], data: DesignData) => saveDesign(sb, record.id, meta, data),
    [sb, record.id],
  );
  const uploadPhoto = useCallback((file: File) => uploadImage(sb, `designs/${record.id}`, file), [sb, record.id]);
  return <Editor initial={record} catalog={catalog} persist={persist} uploadPhoto={uploadPhoto} backHref="/" />;
}
