"use client";

import { Editor } from "@/components/editor/Editor";
import { STANDARD_CATALOG } from "@/lib/standard-catalog";
import { emptyDesign, type DesignRecord } from "@/lib/types";

const record: DesignRecord = {
  id: "sandbox",
  name: "Sandbox kitchen",
  customer_name: null,
  customer_phone: null,
  customer_address: null,
  designer_name: null,
  notes: null,
  data: emptyDesign(),
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};

export function SandboxEditor() {
  return <Editor initial={record} catalog={STANDARD_CATALOG} backHref="/sandbox" />;
}
