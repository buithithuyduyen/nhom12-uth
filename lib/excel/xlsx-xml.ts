/**
 * lib/excel/xlsx-xml.ts
 *
 * Tiện ích thao tác XML của file .xlsx ở mức chuỗi (không load/save qua thư viện Excel),
 * để giữ nguyên 100% các phần không được đụng tới.
 */

import JSZip from "jszip";

// ---------------------------------------------------------------------------
// Tọa độ ô
// ---------------------------------------------------------------------------

export function colToNumber(col: string): number {
  let n = 0;
  for (const ch of col.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function numberToCol(n: number): string {
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function parseRef(ref: string): { col: number; row: number; colLetter: string } {
  const m = /^\$?([A-Z]+)\$?(\d+)$/i.exec(ref.trim());
  if (!m) throw new Error(`Tọa độ ô không hợp lệ: ${ref}`);
  return { col: colToNumber(m[1]), row: parseInt(m[2], 10), colLetter: m[1].toUpperCase() };
}

export function parseRange(range: string): { c1: number; r1: number; c2: number; r2: number } {
  const [a, b] = range.split(":");
  const p1 = parseRef(a);
  const p2 = parseRef(b ?? a);
  return {
    c1: Math.min(p1.col, p2.col),
    r1: Math.min(p1.row, p2.row),
    c2: Math.max(p1.col, p2.col),
    r2: Math.max(p1.row, p2.row),
  };
}

export function inRange(ref: string, range: string): boolean {
  const { col, row } = parseRef(ref);
  const r = parseRange(range);
  return col >= r.c1 && col <= r.c2 && row >= r.r1 && row <= r.r2;
}

// ---------------------------------------------------------------------------
// XML escape / attribute helpers
// ---------------------------------------------------------------------------

export function escapeXml(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

export function getAttr(attrs: string, name: string): string | null {
  const re = new RegExp(`(?:^|\\s)${name.replace(/[:]/g, "\\:")}="([^"]*)"`);
  const m = re.exec(attrs);
  return m ? m[1] : null;
}

export function setAttr(attrs: string, name: string, value: string): string {
  const re = new RegExp(`(\\s)${name.replace(/[:]/g, "\\:")}="[^"]*"`);
  if (re.test(attrs)) return attrs.replace(re, `$1${name}="${value}"`);
  return `${attrs} ${name}="${value}"`;
}

export function removeAttr(attrs: string, name: string): string {
  const re = new RegExp(`\\s${name.replace(/[:]/g, "\\:")}="[^"]*"`, "g");
  return attrs.replace(re, "");
}

// ---------------------------------------------------------------------------
// Workbook: tra file sheet theo tên
// ---------------------------------------------------------------------------

export interface SheetEntry {
  name: string;
  rId: string;
  path: string;
  state: string | null;
}

export async function listSheets(zip: JSZip): Promise<SheetEntry[]> {
  const wb = await readZipText(zip, "xl/workbook.xml");
  const rels = await readZipText(zip, "xl/_rels/workbook.xml.rels");
  const relMap = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = getAttr(m[1], "Id");
    const target = getAttr(m[1], "Target");
    if (id && target) relMap.set(id, target);
  }
  const sheets: SheetEntry[] = [];
  for (const m of wb.matchAll(/<sheet\b([^>]*?)\/>/g)) {
    const name = unescapeXml(getAttr(m[1], "name") ?? "");
    const rId = getAttr(m[1], "r:id") ?? "";
    const target = relMap.get(rId);
    if (!target) continue;
    const p = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
    sheets.push({ name, rId, path: p, state: getAttr(m[1], "state") });
  }
  return sheets;
}

export async function resolveSheetPath(zip: JSZip, sheetName: string): Promise<string | null> {
  const sheets = await listSheets(zip);
  return sheets.find((s) => s.name === sheetName)?.path ?? null;
}

export async function readZipText(zip: JSZip, path: string): Promise<string> {
  const f = zip.file(path);
  if (!f) throw new Error(`Không tìm thấy ${path} trong file xlsx`);
  return f.async("string");
}

/** Đường dẫn file comments của một sheet (qua xl/worksheets/_rels). */
export async function resolveSheetCommentsPath(zip: JSZip, sheetPath: string): Promise<string | null> {
  const dir = sheetPath.substring(0, sheetPath.lastIndexOf("/"));
  const base = sheetPath.substring(sheetPath.lastIndexOf("/") + 1);
  const relPath = `${dir}/_rels/${base}.rels`;
  const f = zip.file(relPath);
  if (!f) return null;
  const xml = await f.async("string");
  for (const m of xml.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const type = getAttr(m[1], "Type") ?? "";
    const target = getAttr(m[1], "Target");
    if (type.endsWith("/comments") && target) {
      return normalizeZipPath(`${dir}/${target}`);
    }
  }
  return null;
}

function normalizeZipPath(p: string): string {
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join("/");
}

// ---------------------------------------------------------------------------
// Shared strings
// ---------------------------------------------------------------------------

export function parseSharedStrings(xml: string): string[] {
  const result: string[] = [];
  for (const m of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    result.push(extractTextRuns(m[1]));
  }
  return result;
}

/** Ghép mọi <t> trong một khối (bỏ qua phiên âm <rPh>). */
export function extractTextRuns(inner: string): string {
  const withoutPhonetic = inner.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let text = "";
  for (const t of withoutPhonetic.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)) {
    text += unescapeXml(t[1] ?? "");
  }
  return text;
}

// ---------------------------------------------------------------------------
// Mô hình sheetData tối giản
// ---------------------------------------------------------------------------

export interface RawCell {
  ref: string;
  col: number;
  attrs: string;
  inner: string | null;
}

export interface RawRow {
  r: number;
  attrs: string;
  cells: RawCell[];
  modified: boolean;
}

export interface ParsedSheet {
  before: string;
  after: string;
  rows: RawRow[];
  /** true nếu sheet dùng <sheetData/> rỗng */
  emptySheetData: boolean;
}

export function parseSheet(xml: string): ParsedSheet {
  const openIdx = xml.search(/<sheetData\b/);
  if (openIdx < 0) throw new Error("Sheet không có sheetData");
  const selfClose = /<sheetData\b[^>]*\/>/.exec(xml.slice(openIdx));
  if (selfClose && selfClose.index === 0) {
    const end = openIdx + selfClose[0].length;
    return { before: xml.slice(0, openIdx) + "<sheetData>", after: "</sheetData>" + xml.slice(end), rows: [], emptySheetData: true };
  }
  const openEnd = xml.indexOf(">", openIdx) + 1;
  const closeIdx = xml.indexOf("</sheetData>", openEnd);
  const inner = xml.slice(openEnd, closeIdx);
  const rows: RawRow[] = [];
  for (const m of inner.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const attrs = m[1];
    const r = parseInt(getAttr(attrs, "r") ?? "0", 10);
    const cells: RawCell[] = [];
    if (m[2]) {
      for (const cm of m[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const cattrs = cm[1];
        const ref = getAttr(cattrs, "r") ?? "";
        cells.push({ ref, col: parseRef(ref).col, attrs: cattrs, inner: cm[2] ?? null });
      }
    }
    rows.push({ r, attrs, cells, modified: false });
  }
  return { before: xml.slice(0, openEnd), after: xml.slice(closeIdx), rows, emptySheetData: false };
}

export function serializeSheet(sheet: ParsedSheet): string {
  const body = sheet.rows
    .map((row) => {
      const attrs = row.modified ? removeAttr(row.attrs, "spans") : row.attrs;
      if (row.cells.length === 0) return `<row${attrs}/>`;
      const cells = row.cells.map((c) => (c.inner === null || c.inner === "" ? `<c${c.attrs}/>` : `<c${c.attrs}>${c.inner}</c>`)).join("");
      return `<row${attrs}>${cells}</row>`;
    })
    .join("");
  return sheet.before + body + sheet.after;
}

export function findRow(sheet: ParsedSheet, r: number): RawRow | undefined {
  return sheet.rows.find((row) => row.r === r);
}

export function findCell(sheet: ParsedSheet, ref: string): RawCell | undefined {
  const { row } = parseRef(ref);
  const target = ref.toUpperCase();
  return findRow(sheet, row)?.cells.find((c) => c.ref.toUpperCase() === target);
}

export function cellHasFormula(cell: RawCell | undefined): boolean {
  return !!cell?.inner && /<f\b/.test(cell.inner);
}

/** Style s= của ô gần nhất phía trên cùng cột (dùng khi dòng vượt vùng mẫu). */
function styleFromAbove(sheet: ParsedSheet, col: number, rowNum: number): string | null {
  const candidates = sheet.rows.filter((r) => r.r < rowNum).sort((a, b) => b.r - a.r);
  for (const row of candidates) {
    const cell = row.cells.find((c) => c.col === col);
    if (cell) return getAttr(cell.attrs, "s");
  }
  return null;
}

function ensureRow(sheet: ParsedSheet, r: number): RawRow {
  let row = findRow(sheet, r);
  if (row) return row;
  const above = sheet.rows.filter((x) => x.r < r).sort((a, b) => b.r - a.r)[0];
  let attrs = ` r="${r}"`;
  if (above) {
    const ht = getAttr(above.attrs, "ht");
    const customHeight = getAttr(above.attrs, "customHeight");
    if (ht) attrs += ` ht="${ht}"`;
    if (customHeight) attrs += ` customHeight="${customHeight}"`;
  }
  row = { r, attrs, cells: [], modified: true };
  const idx = sheet.rows.findIndex((x) => x.r > r);
  if (idx < 0) sheet.rows.push(row);
  else sheet.rows.splice(idx, 0, row);
  return row;
}

function ensureCell(sheet: ParsedSheet, ref: string): RawCell {
  const { row: rowNum, col } = parseRef(ref);
  const row = ensureRow(sheet, rowNum);
  let cell = row.cells.find((c) => c.col === col);
  if (cell) return cell;
  const s = styleFromAbove(sheet, col, rowNum);
  cell = { ref: ref.toUpperCase(), col, attrs: ` r="${ref.toUpperCase()}"${s ? ` s="${s}"` : ""}`, inner: null };
  const idx = row.cells.findIndex((c) => c.col > col);
  if (idx < 0) row.cells.push(cell);
  else row.cells.splice(idx, 0, cell);
  row.modified = true;
  return cell;
}

function stripValueAttrs(attrs: string): string {
  let a = removeAttr(attrs, "t");
  a = removeAttr(a, "cm");
  a = removeAttr(a, "vm");
  return a;
}

/**
 * Ghi chuỗi nội tuyến vào ô; giữ nguyên style s=; bỏ <f>/<v> cũ.
 * Giá trị rỗng => ô trống (chỉ còn style).
 */
export function setCell(sheet: ParsedSheet, ref: string, value: string): void {
  const cell = ensureCell(sheet, ref);
  const row = findRow(sheet, parseRef(ref).row);
  if (row) row.modified = true;
  const clean = value ?? "";
  if (clean === "") {
    cell.attrs = stripValueAttrs(cell.attrs);
    cell.inner = null;
    return;
  }
  cell.attrs = setAttr(stripValueAttrs(cell.attrs), "t", "inlineStr");
  cell.inner = `<is><t xml:space="preserve">${escapeXml(clean)}</t></is>`;
}

/** Xóa giá trị (giữ style). Nếu keepFormula thì bỏ qua ô có công thức. */
export function clearCell(sheet: ParsedSheet, ref: string): void {
  const cell = findCell(sheet, ref);
  if (!cell || cell.inner === null) return;
  cell.attrs = stripValueAttrs(cell.attrs);
  cell.inner = null;
  const row = findRow(sheet, parseRef(ref).row);
  if (row) row.modified = true;
}

export function clearRange(sheet: ParsedSheet, range: string, keep: (ref: string, cell: RawCell) => boolean): void {
  const r = parseRange(range);
  for (const row of sheet.rows) {
    if (row.r < r.r1 || row.r > r.r2) continue;
    for (const cell of row.cells) {
      if (cell.col < r.c1 || cell.col > r.c2) continue;
      if (keep(cell.ref, cell)) continue;
      if (cell.inner !== null) {
        cell.attrs = stripValueAttrs(cell.attrs);
        cell.inner = null;
        row.modified = true;
      }
    }
  }
}

/** Bỏ các công thức shared con mà ô gốc (có ref=) đã bị xóa. */
export function fixOrphanSharedFormulas(sheet: ParsedSheet): void {
  const masters = new Set<string>();
  for (const row of sheet.rows) {
    for (const cell of row.cells) {
      if (!cell.inner) continue;
      const m = /<f\b([^>]*)>/.exec(cell.inner);
      if (m && getAttr(m[1], "t") === "shared" && getAttr(m[1], "ref")) {
        const si = getAttr(m[1], "si");
        if (si) masters.add(si);
      }
    }
  }
  for (const row of sheet.rows) {
    for (const cell of row.cells) {
      if (!cell.inner) continue;
      const m = /<f\b([^>]*?)\/?>/.exec(cell.inner);
      if (!m || getAttr(m[1], "t") !== "shared") continue;
      const si = getAttr(m[1], "si");
      if (si && !masters.has(si)) {
        cell.attrs = stripValueAttrs(cell.attrs);
        cell.inner = null;
        row.modified = true;
      }
    }
  }
}

/** Đọc giá trị hiển thị của ô (shared string, inline, số, công thức -> giá trị cache). */
export function readCellValue(cell: RawCell | undefined, sharedStrings: string[]): string {
  if (!cell || !cell.inner) return "";
  const t = getAttr(cell.attrs, "t");
  if (t === "inlineStr") return extractTextRuns(cell.inner);
  const v = /<v>([\s\S]*?)<\/v>/.exec(cell.inner);
  if (!v) return "";
  if (t === "s") return sharedStrings[parseInt(v[1], 10)] ?? "";
  return unescapeXml(v[1]);
}

export function readCellFormula(cell: RawCell | undefined): string | null {
  if (!cell?.inner) return null;
  const m = /<f\b[^>]*>([\s\S]*?)<\/f>/.exec(cell.inner);
  if (m) return unescapeXml(m[1]);
  if (/<f\b[^>]*\/>/.test(cell.inner)) return "(shared)";
  return null;
}

/** Cập nhật <dimension ref> nếu dữ liệu vượt ra ngoài. */
export function expandDimension(sheet: ParsedSheet): void {
  const m = /<dimension ref="([^"]+)"\s*\/>/.exec(sheet.before);
  if (!m) return;
  const current = parseRange(m[1]);
  let { c1, r1, c2, r2 } = current;
  for (const row of sheet.rows) {
    for (const cell of row.cells) {
      if (cell.inner === null) continue;
      c1 = Math.min(c1, cell.col);
      c2 = Math.max(c2, cell.col);
      r1 = Math.min(r1, row.r);
      r2 = Math.max(r2, row.r);
    }
  }
  if (c1 === current.c1 && r1 === current.r1 && c2 === current.c2 && r2 === current.r2) return;
  const ref = `${numberToCol(c1)}${r1}:${numberToCol(c2)}${r2}`;
  sheet.before = sheet.before.replace(m[0], `<dimension ref="${ref}"/>`);
}
