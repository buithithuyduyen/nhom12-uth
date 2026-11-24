/**
 * lib/excel/template-reader.ts
 *
 * Đọc thông tin từ file template NSW (không sửa file):
 *  - giá trị/công thức từng ô của một sheet
 *  - danh mục mã từ sheet "Declaration list"
 *  - ghi chú (comment) từng ô -> ràng buộc (độ dài tối đa, định dạng ngày, số)
 *  - thống kê (số file, data validation, comments, externalLinks) để verify
 *  - kiểm tra template có đủ sheet / ô theo mapping
 */

import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type { CodeEntry, CodeTables, CodeType } from "@/lib/types";
import { CODE_SHEET_NAME, WRITE_MAPPINGS } from "@/lib/mapping/nsw";
import {
  colToNumber,
  extractTextRuns,
  getAttr,
  listSheets,
  numberToCol,
  parseRef,
  parseSharedStrings,
  parseSheet,
  readCellFormula,
  readCellValue,
  readZipText,
  resolveSheetCommentsPath,
  resolveSheetPath,
} from "@/lib/excel/xlsx-xml";

export async function loadXlsx(buffer: Buffer | Uint8Array): Promise<JSZip> {
  return JSZip.loadAsync(buffer);
}

export async function loadSharedStrings(zip: JSZip): Promise<string[]> {
  const f = zip.file("xl/sharedStrings.xml");
  if (!f) return [];
  return parseSharedStrings(await f.async("string"));
}

export interface CellInfo {
  value: string;
  formula: string | null;
}

export async function readSheetCells(zip: JSZip, sheetName: string, sharedStrings?: string[]): Promise<Map<string, CellInfo>> {
  const sheetPath = await resolveSheetPath(zip, sheetName);
  if (!sheetPath) throw new Error(`Template không có sheet "${sheetName}"`);
  const ss = sharedStrings ?? (await loadSharedStrings(zip));
  const parsed = parseSheet(await readZipText(zip, sheetPath));
  const map = new Map<string, CellInfo>();
  for (const row of parsed.rows) {
    for (const cell of row.cells) {
      const value = readCellValue(cell, ss);
      const formula = readCellFormula(cell);
      if (value !== "" || formula) map.set(cell.ref.toUpperCase(), { value, formula });
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Danh mục mã
// ---------------------------------------------------------------------------

const CODE_COLUMNS: Array<{ type: CodeType; code: string; name: string | null; fallback?: { code: string; name: string } }> = [
  { type: "country", code: "E", name: "F" },
  { type: "goods", code: "G", name: "H" },
  { type: "passportType", code: "I", name: "J" },
  { type: "unit", code: "K", name: "L" },
  { type: "function", code: "M", name: "N" },
  { type: "packageType", code: "O", name: "P" },
  { type: "rank", code: "R", name: "S" },
  { type: "containerType", code: "T", name: null },
  { type: "portPurpose", code: "U", name: "V" },
  // Theo đặc tả là AG/AH; template thật đặt phân loại hàng hóa ở C/D -> tự dùng C/D khi AG trống.
  { type: "cargoGroup", code: "AG", name: "AH", fallback: { code: "C", name: "D" } },
];

function isPlaceholder(value: string): boolean {
  const v = value.trim();
  return v === "" || (v.startsWith("(") && v.endsWith(")"));
}

export async function readCodeTables(zip: JSZip): Promise<CodeTables> {
  const cells = await readSheetCells(zip, CODE_SHEET_NAME);
  let maxRow = 0;
  for (const ref of cells.keys()) maxRow = Math.max(maxRow, parseRef(ref).row);

  const readColumn = (codeCol: string, nameCol: string | null): CodeEntry[] => {
    const entries: CodeEntry[] = [];
    const seen = new Set<string>();
    for (let r = 3; r <= maxRow; r++) {
      const code = (cells.get(`${codeCol}${r}`)?.value ?? "").trim();
      if (isPlaceholder(code)) continue;
      const name = nameCol ? (cells.get(`${nameCol}${r}`)?.value ?? "").trim() : code;
      const key = code.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({ code, name: isPlaceholder(name) ? "" : name });
    }
    return entries;
  };

  const result = {} as CodeTables;
  for (const def of CODE_COLUMNS) {
    let entries = readColumn(def.code, def.name);
    if (entries.length === 0 && def.fallback) entries = readColumn(def.fallback.code, def.fallback.name);
    result[def.type] = entries;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Comments -> ràng buộc ô
// ---------------------------------------------------------------------------

export interface CellRule {
  comment: string;
  maxLength?: number;
  format?: "dd/MM/yyyy" | "dd/MM/yyyy HH:mm";
  numeric?: "integer" | "decimal";
}

/** sheetName -> ref -> rule */
export type CellRules = Record<string, Record<string, CellRule>>;

export function parseRuleFromComment(comment: string): CellRule {
  const rule: CellRule = { comment };
  const len = /Độ dài tối đa\s*:?\s*(\d+)/i.exec(comment);
  if (len) rule.maxLength = parseInt(len[1], 10);
  if (/dd\/MM\/yyyy\s+HH:mm/i.test(comment)) rule.format = "dd/MM/yyyy HH:mm";
  else if (/dd\/mm\/yyyy/i.test(comment)) rule.format = "dd/MM/yyyy";
  if (/Số nguyên/i.test(comment)) rule.numeric = "integer";
  else if (/Số thực|Số thập phân/i.test(comment)) rule.numeric = "decimal";
  return rule;
}

const commentParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", isArray: (name) => name === "comment" || name === "r" });

interface CommentNode {
  "@_ref": string;
  text?: { t?: unknown; r?: Array<{ t?: unknown }> };
}

function nodeText(t: unknown): string {
  if (t === undefined || t === null) return "";
  if (typeof t === "string" || typeof t === "number") return String(t);
  if (typeof t === "object" && "#text" in (t as Record<string, unknown>)) return String((t as Record<string, unknown>)["#text"]);
  return "";
}

export async function readSheetComments(zip: JSZip, sheetName: string): Promise<Record<string, string>> {
  const sheetPath = await resolveSheetPath(zip, sheetName);
  if (!sheetPath) return {};
  const commentsPath = await resolveSheetCommentsPath(zip, sheetPath);
  if (!commentsPath || !zip.file(commentsPath)) return {};
  const xml = await readZipText(zip, commentsPath);
  const parsed = commentParser.parse(xml) as { comments?: { commentList?: { comment?: CommentNode[] } } };
  const out: Record<string, string> = {};
  for (const c of parsed.comments?.commentList?.comment ?? []) {
    let text = "";
    if (c.text?.r) text = c.text.r.map((r) => nodeText(r.t)).join("");
    else text = nodeText(c.text?.t);
    out[c["@_ref"].toUpperCase()] = text.replace(/\s+\n/g, "\n").trim();
  }
  return out;
}

/**
 * Sinh ràng buộc cho mọi ô trong mapping.
 * - Ô đơn: dùng comment của chính ô đó.
 * - Cột bảng: dùng comment ở dòng tiêu đề (startRow - 1) hoặc ô dữ liệu đầu tiên.
 * Kết quả key: "<sheet>!<ref>" cho ô và "<sheet>!<col>*" cho cột bảng.
 */
export async function readMappingRules(zip: JSZip): Promise<Record<string, CellRule>> {
  const out: Record<string, CellRule> = {};
  for (const mapping of WRITE_MAPPINGS) {
    const comments = await readSheetComments(zip, mapping.sheetName);
    for (const b of mapping.header) {
      const text = comments[b.cell.toUpperCase()];
      if (text) out[`${mapping.sheetName}!${b.cell.toUpperCase()}`] = parseRuleFromComment(text);
    }
    for (const t of mapping.tables) {
      const headerRow = mapping.repeatBlock && t.startRow === mapping.repeatBlock.subStartRow ? mapping.repeatBlock.subHeaderRow : t.startRow - 1;
      for (const c of t.columns) {
        const text = comments[`${c.col}${headerRow}`] ?? comments[`${c.col}${t.startRow}`];
        if (text) out[`${mapping.sheetName}!${c.col}*`] = parseRuleFromComment(text);
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Thống kê & kiểm tra
// ---------------------------------------------------------------------------

export interface XlsxStats {
  fileCount: number;
  fileNames: string[];
  x14DataValidations: number;
  dataValidations: number;
  comments: number;
  commentFiles: number;
  externalLinks: number;
  definedNames: number;
  sheetNames: string[];
}

export async function readStats(zip: JSZip): Promise<XlsxStats> {
  const fileNames = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  let x14 = 0;
  let dv = 0;
  let comments = 0;
  let commentFiles = 0;
  for (const name of fileNames) {
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
      const xml = await zip.file(name)!.async("string");
      x14 += (xml.match(/<x14:dataValidation\b/g) ?? []).length;
      dv += (xml.match(/<dataValidation\b/g) ?? []).length;
    } else if (/^xl\/comments\d+\.xml$/.test(name)) {
      commentFiles++;
      const xml = await zip.file(name)!.async("string");
      comments += (xml.match(/<comment\b/g) ?? []).length;
    }
  }
  const wb = await readZipText(zip, "xl/workbook.xml");
  const sheets = await listSheets(zip);
  return {
    fileCount: fileNames.length,
    fileNames,
    x14DataValidations: x14,
    dataValidations: dv,
    comments,
    commentFiles,
    externalLinks: fileNames.filter((n) => /^xl\/externalLinks\/externalLink\d+\.xml$/.test(n)).length,
    definedNames: (wb.match(/<definedName\b/g) ?? []).length,
    sheetNames: sheets.map((s) => s.name),
  };
}

export interface TemplateCheckItem {
  label: string;
  ok: boolean;
  detail: string;
}

export async function checkTemplate(zip: JSZip): Promise<TemplateCheckItem[]> {
  const items: TemplateCheckItem[] = [];
  const sheets = await listSheets(zip);
  const names = new Set(sheets.map((s) => s.name));

  items.push({
    label: `Sheet bảng mã "${CODE_SHEET_NAME}"`,
    ok: names.has(CODE_SHEET_NAME),
    detail: names.has(CODE_SHEET_NAME) ? "Có" : "Thiếu",
  });

  const ss = await loadSharedStrings(zip);
  for (const mapping of WRITE_MAPPINGS) {
    if (!names.has(mapping.sheetName)) {
      items.push({ label: `Sheet "${mapping.sheetName}"`, ok: false, detail: "Không tìm thấy sheet" });
      continue;
    }
    const cells = await readSheetCells(zip, mapping.sheetName, ss);
    // Ô nhãn ở cột A cạnh ô nhập (header) phải tồn tại
    const missingLabels: string[] = [];
    for (const b of mapping.header) {
      const { row, col } = parseRef(b.cell);
      if (col === 2) {
        const label = cells.get(`A${row}`);
        if (!label || !label.value.trim()) missingLabels.push(b.cell);
      }
    }
    const missingFormulas = mapping.keepFormulaCells.filter((ref) => !cells.get(ref)?.formula);
    const missingTableHeaders: string[] = [];
    for (const t of mapping.tables) {
      const headerRow = mapping.repeatBlock && t.startRow === mapping.repeatBlock.subStartRow ? mapping.repeatBlock.subHeaderRow : t.startRow - 1;
      const anyHeader = t.columns.some((c) => (cells.get(`${c.col}${headerRow}`)?.value ?? "").trim() !== "");
      if (!anyHeader) missingTableHeaders.push(`${t.key} (dòng ${headerRow})`);
    }
    const ok = missingLabels.length === 0 && missingTableHeaders.length === 0;
    const parts: string[] = [];
    parts.push(`${mapping.header.length} ô đơn, ${mapping.tables.length} bảng`);
    if (missingLabels.length) parts.push(`thiếu nhãn cho: ${missingLabels.join(", ")}`);
    if (missingTableHeaders.length) parts.push(`thiếu tiêu đề bảng: ${missingTableHeaders.join(", ")}`);
    if (missingFormulas.length) parts.push(`ô công thức không còn công thức (sẽ để nguyên): ${missingFormulas.join(", ")}`);
    items.push({ label: `Sheet "${mapping.sheetName}"`, ok, detail: parts.join("; ") });
  }

  const codes = await readCodeTables(zip).catch(() => null);
  if (codes) {
    const summary = (Object.keys(codes) as CodeType[]).map((k) => `${k}: ${codes[k].length}`).join(", ");
    const ok = codes.country.length > 0 && codes.rank.length > 0 && codes.goods.length > 0;
    items.push({ label: "Danh mục mã", ok, detail: summary });
  }
  return items;
}

/** Bảng chữ cái cột (tiện cho UI). */
export function columnRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let i = colToNumber(from); i <= colToNumber(to); i++) out.push(numberToCol(i));
  return out;
}

export { getAttr, extractTextRuns };
