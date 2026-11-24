/**
 * lib/extraction/schemas/index.ts
 *
 * Đăng ký đặc tả trích xuất cho từng docType + schema phân loại.
 */

import { z } from "zod";
import type { DocType } from "@/lib/types";
import { DOC_TYPES } from "@/lib/types";
import type { DocSpec } from "./common";
import { crewListSpec } from "./crew_list";
import { billOfLadingSpec } from "./bill_of_lading";
import { cargoManifestSpec } from "./cargo_manifest";
import { shipStoreSpec } from "./ship_store";
import {
  crewEffectsSpec,
  healthDeclarationSpec,
  noticeOfArrivalSpec,
  otherSpec,
  portClearanceSpec,
  registryCertificateSpec,
  securityCertificateSpec,
  shipParticularsSpec,
  voyageMemorySpec,
} from "./voyage";

export const DOC_SPECS: Partial<Record<DocType, DocSpec>> = {
  crew_list: crewListSpec,
  bill_of_lading: billOfLadingSpec,
  cargo_manifest: cargoManifestSpec,
  ship_store: shipStoreSpec,
  notice_of_arrival: noticeOfArrivalSpec,
  port_clearance: portClearanceSpec,
  voyage_memory: voyageMemorySpec,
  ship_particulars: shipParticularsSpec,
  registry_certificate: registryCertificateSpec,
  crew_effects: crewEffectsSpec,
  health_declaration: healthDeclarationSpec,
  security_certificate: securityCertificateSpec,
  other: otherSpec,
};

/** 1-1: một chứng từ vào một sheet; N-1: gom vào Notice + General Declaration. */
export const DOC_MODE: Record<DocType, "1-1" | "N-1"> = {
  crew_list: "1-1",
  bill_of_lading: "1-1",
  cargo_manifest: "1-1",
  ship_store: "1-1",
  notice_of_arrival: "N-1",
  port_clearance: "N-1",
  voyage_memory: "N-1",
  ship_particulars: "N-1",
  registry_certificate: "N-1",
  crew_effects: "N-1",
  health_declaration: "N-1",
  security_certificate: "N-1",
  other: "N-1",
  unknown: "N-1",
};

export const classifySchema = z.object({
  docType: z
    .string()
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.enum(DOC_TYPES)),
  mode: z.enum(["1-1", "N-1"]).optional().nullable(),
  port: z.union([z.string(), z.null()]).optional(),
  date: z.union([z.string(), z.null()]).optional(),
  voyageNo: z.union([z.string(), z.number(), z.null()]).optional().transform((v) => (v === undefined || v === null ? null : String(v))),
  rotation: z
    .union([z.number(), z.string()])
    .optional()
    .nullable()
    .transform((v) => {
      const n = typeof v === "string" ? parseInt(v, 10) : v ?? 0;
      const norm = (((Math.round((n ?? 0) / 90) * 90) % 360) + 360) % 360;
      return norm;
    }),
  confidence: z.union([z.number(), z.string()]).optional().nullable().transform((v) => {
    const n = typeof v === "string" ? parseFloat(v) : v ?? 0;
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n as number)) : 0;
  }),
  title: z.union([z.string(), z.null()]).optional(),
});

export type ClassifyResult = z.infer<typeof classifySchema>;

export function getDocSpec(docType: DocType): DocSpec | null {
  return DOC_SPECS[docType] ?? null;
}

export * from "./common";
