/**
 * lib/excel/patch-xlsx.ts
 *
 * Ghi dữ liệu vào CHÍNH file template bằng cách vá XML trong zip (JSZip).
 * KHÔNG dùng ExcelJS/openpyxl: các thư viện đó làm mất externalLinks, comments/VML,
 * data validation mở rộng (x14), defined names...
 *
 * Quy tắc:
 *  - Tra file sheet theo TÊN qua workbook.xml + workbook.xml.rels.
 *  - Xóa dữ liệu mẫu cũ ở vùng nhập liệu (chỉ giá trị, giữ style), trừ ô công thức cần giữ.
 *  - Ghi chuỗi nội tuyến (inlineStr), giữ style s=.
 *  - Xóa calcChain.xml (+ khai báo), bật fullCalcOnLoad để Excel tính lại VLOOKUP.
 *  - Không đụng externalLinks, comments, drawings, printerSettings, definedNames, extLst.
 */

import JSZip from "jszip";
import type { CodeTables, SheetsData } from "@/lib/types";
import { DEFAULT_FUNCTION_CODE, SECTIONS, WRITE_MAPPINGS, type SheetMapping } from "@/lib/mapping/nsw";
import {
  cellHasFormula,
  clearRange,
  expandDimension,
  findCell,
  fixOrphanSharedFormulas,
  getAttr,
  inRange,
  parseSheet,
  readZipText,
  removeAttr,
  resolveSheetPath,
  serializeSheet,
  setAttr,
  setCell,
  type ParsedSheet,
} from "@/lib/excel/xlsx-xml";

export interface WrittenCell {
  sheet: string;
  cell: string;
  value: string;
}

export interface PatchResult {
  buffer: Buffer;
  written: WrittenCell[];
  /** Ô thuộc vùng nhập liệu đã được xóa (để verify-export kiểm tra dữ liệu mẫu cũ) */
  clearedRanges: Array<{ sheet: string; range: string }>;
  warnings: string[];
}

function lookupName(codes: CodeTables | null, type: keyof CodeTables, code: string): string {
  if (!codes || !code) return "";
  const entry = codes[type].find((e) => e.code.toUpperCase() === code.trim().toUpperCase());
  return entry?.name ?? "";
}

function patchSheet(sheet: ParsedSheet, mapping: SheetMapping, data: SheetsData, codes: CodeTables | null, written: WrittenCell[], warnings: string[]): void {
  const section = data[mapping.section];
  const def = SECTIONS[mapping.section];
  const keep = new Set(mapping.keepFormulaCells.map((r) => r.toUpperCase()));

  // Cột "suy ra" (tên hàng) – nếu template có công thức ở đó thì giữ nguyên.
  const derivedCols = new Map<string, Set<string>>();
  for (const t of mapping.tables) {
    const tdef = def.tables.find((x) => x.key === t.key);
    const cols = new Set<string>();
    for (const c of t.columns) {
      const cdef = tdef?.columns.find((x) => x.key === c.key);
      if (cdef?.derivedFrom) cols.add(c.col);
    }
    derivedCols.set(t.key, cols);
  }
  const isPreservedFormula = (ref: string, hasFormula: boolean): boolean => {
    if (keep.has(ref.toUpperCase())) return true;
    if (!hasFormula) return false;
    const col = ref.replace(/\d+$/, "").toUpperCase();
    for (const t of mapping.tables) {
      if (derivedCols.get(t.key)?.has(col)) return true;
    }
    return false;
  };

  // 1) Xóa dữ liệu mẫu cũ
  for (const range of mapping.clearRanges) {
    clearRange(sheet, range, (ref, cell) => isPreservedFormula(ref, cellHasFormula(cell)));
  }

  const write = (ref: string, value: string) => {
    const existing = findCell(sheet, ref);
    if (isPreservedFormula(ref, cellHasFormula(existing))) {
      if (value) warnings.push(`${mapping.sheetName}!${ref}: ô công thức được giữ nguyên, không ghi "${value}"`);
      return;
    }
    setCell(sheet, ref, value);
    if (value !== "") written.push({ sheet: mapping.sheetName, cell: ref, value });
  };

  // 2) Ô đơn
  const excluded = new Set(mapping.excludeKeys ?? []);
  for (const b of mapping.header) {
    if (excluded.has(b.key)) continue;
    const fdef = def.header.find((f) => f.key === b.key);
    let value = (section.header[b.key]?.value ?? "").trim();
    if (!value && fdef?.defaultValue === DEFAULT_FUNCTION_CODE) value = DEFAULT_FUNCTION_CODE;
    write(b.cell, value);
  }

  // 3) Bảng
  for (const t of mapping.tables) {
    const tdef = def.tables.find((x) => x.key === t.key);
    let rows = section.tables[t.key] ?? [];
    if (t.maxRows && rows.length > t.maxRows) {
      warnings.push(`${mapping.sheetName}: bảng ${t.key} chỉ ghi ${t.maxRows} dòng đầu (có ${rows.length} dòng)`);
      rows = rows.slice(0, t.maxRows);
    }
    rows.forEach((row, idx) => {
      const r = t.startRow + idx;
      for (const c of t.columns) {
        const cdef = tdef?.columns.find((x) => x.key === c.key);
        let value = (row.cells[c.key]?.value ?? "").trim();
        if (cdef?.derivedFrom && !value) {
          const src = (row.cells[cdef.derivedFrom.key]?.value ?? "").trim();
          value = lookupName(codes, cdef.derivedFrom.codeType, src);
        }
        write(`${c.col}${r}`, value);
      }
    });
  }

  fixOrphanSharedFormulas(sheet);
  expandDimension(sheet);
}

async function removeCalcChain(zip: JSZip): Promise<void> {
  if (zip.file("xl/calcChain.xml")) zip.remove("xl/calcChain.xml");
  const ctPath = "[Content_Types].xml";
  const ct = await readZipText(zip, ctPath);
  const ctNew = ct.replace(/<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/g, "");
  if (ctNew !== ct) zip.file(ctPath, ctNew);
  const relsPath = "xl/_rels/workbook.xml.rels";
  const rels = await readZipText(zip, relsPath);
  const relsNew = rels.replace(/<Relationship\b[^>]*Target="(?:\/xl\/)?calcChain\.xml"[^>]*\/>/g, "");
  if (relsNew !== rels) zip.file(relsPath, relsNew);
}

async function enableFullCalcOnLoad(zip: JSZip): Promise<void> {
  const path = "xl/workbook.xml";
  const wb = await readZipText(zip, path);
  let next: string;
  const m = /<calcPr\b([^>]*?)\/>/.exec(wb);
  if (m) {
    const attrs = setAttr(m[1], "fullCalcOnLoad", "1");
    next = wb.replace(m[0], `<calcPr${attrs}/>`);
  } else {
    // calcPr nằm sau definedNames theo schema
    const anchor = wb.indexOf("</definedNames>");
    if (anchor >= 0) {
      const pos = anchor + "</definedNames>".length;
      next = wb.slice(0, pos) + '<calcPr fullCalcOnLoad="1"/>' + wb.slice(pos);
    } else {
      next = wb.replace("</sheets>", '</sheets><calcPr fullCalcOnLoad="1"/>');
    }
  }
  zip.file(path, next);
}

/**
 * Vá template với dữ liệu của chuyến tàu.
 * @param templateBuffer bytes của template đang chọn
 * @param data dữ liệu các section (đã sửa)
 * @param codes bảng mã để tra tên hàng cho cột suy ra (nếu ô template không có công thức)
 */
export async function patchWorkbook(templateBuffer: Buffer | Uint8Array, data: SheetsData, codes: CodeTables | null): Promise<PatchResult> {
  const zip = await JSZip.loadAsync(templateBuffer);
  const written: WrittenCell[] = [];
  const warnings: string[] = [];
  const clearedRanges: Array<{ sheet: string; range: string }> = [];

  for (const mapping of WRITE_MAPPINGS) {
    const sheetPath = await resolveSheetPath(zip, mapping.sheetName);
    if (!sheetPath) {
      warnings.push(`Template không có sheet "${mapping.sheetName}" – bỏ qua`);
      continue;
    }
    const xml = await readZipText(zip, sheetPath);
    const sheet = parseSheet(xml);
    patchSheet(sheet, mapping, data, codes, written, warnings);
    zip.file(sheetPath, serializeSheet(sheet));
    for (const range of mapping.clearRanges) clearedRanges.push({ sheet: mapping.sheetName, range });
  }

  await removeCalcChain(zip);
  await enableFullCalcOnLoad(zip);

  const out = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  return { buffer: out, written, clearedRanges, warnings };
}

/** Ô có nằm trong vùng đã xóa của sheet không (dùng cho verify). */
export function isInClearedRange(sheet: string, ref: string, cleared: Array<{ sheet: string; range: string }>): boolean {
  return cleared.some((c) => c.sheet === sheet && inRange(ref, c.range));
}

export { getAttr, removeAttr };
