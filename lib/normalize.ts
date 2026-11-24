/**
 * lib/normalize.ts
 *
 * Chuẩn hóa định dạng (THUẦN – dùng được ở client). Không bịa dữ liệu: chỉ đổi định dạng.
 */

import type { NameSplitRule } from "@/lib/types";

// ---------------------------------------------------------------------------
// Chuỗi
// ---------------------------------------------------------------------------

export function stripAccents(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

/** Bỏ dấu, viết hoa, gộp khoảng trắng – dùng để so sánh tên. */
export function canonicalText(s: string): string {
  return stripAccents(s ?? "")
    .toUpperCase()
    .replace(/[\s ]+/g, " ")
    .trim();
}

export function collapseSpaces(s: string): string {
  return (s ?? "").replace(/[\s ]+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Ngày tháng
// ---------------------------------------------------------------------------

export interface SimpleDate {
  y: number;
  m: number;
  d: number;
  hh?: number;
  mm?: number;
}

const MONTHS: Record<string, number> = {
  JAN: 1, JANUARY: 1, FEB: 2, FEBRUARY: 2, MAR: 3, MARCH: 3, APR: 4, APRIL: 4, MAY: 5, JUN: 6, JUNE: 6,
  JUL: 7, JULY: 7, AUG: 8, AUGUST: 8, SEP: 9, SEPT: 9, SEPTEMBER: 9, OCT: 10, OCTOBER: 10, NOV: 11, NOVEMBER: 11,
  DEC: 12, DECEMBER: 12,
};

function validDate(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return false;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d <= dim;
}

function expandYear(y: number): number {
  if (y >= 100) return y;
  return y >= 70 ? 1900 + y : 2000 + y;
}

/** Tách giờ phút nếu có trong chuỗi. */
function extractTime(s: string): { hh: number; mm: number } | null {
  const m = /(\d{1,2})[:hH](\d{2})(?!\d)/.exec(s);
  if (m) {
    const hh = parseInt(m[1], 10);
    const mm = parseInt(m[2], 10);
    if (hh <= 23 && mm <= 59) return { hh, mm };
  }
  const compact = /\b(\d{2})(\d{2})\s*(?:H|HRS|LT|LOCAL)\b/i.exec(s);
  if (compact) {
    const hh = parseInt(compact[1], 10);
    const mm = parseInt(compact[2], 10);
    if (hh <= 23 && mm <= 59) return { hh, mm };
  }
  return null;
}

/**
 * Đọc ngày từ nhiều định dạng: dd/MM/yyyy, dd-MM-yy, yyyy-MM-dd, "26 Thg7 2023",
 * "12 September 2023", "SEP 12, 2023", "ngày 26 tháng 07 năm 2023"...
 * Giả định ngày trước tháng (chứng từ VN/quốc tế dạng dd/MM).
 */
export function parseDate(input: string | null | undefined): SimpleDate | null {
  if (!input) return null;
  const raw = collapseSpaces(String(input));
  if (!raw) return null;
  const s = stripAccents(raw).toUpperCase();
  const time = extractTime(s);
  const withTime = (d: SimpleDate | null): SimpleDate | null => (d && time ? { ...d, hh: time.hh, mm: time.mm } : d);

  // yyyy-MM-dd hoặc yyyy/MM/dd
  let m = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(s);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (validDate(y, mo, d)) return withTime({ y, m: mo, d });
  }
  // dd/MM/yyyy, dd-MM-yyyy, dd.MM.yy
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(s);
  if (m) {
    const d = +m[1], mo = +m[2], y = expandYear(+m[3]);
    if (validDate(y, mo, d)) return withTime({ y, m: mo, d });
  }
  // "NGAY 26 THANG 07 NAM 2023"
  m = /NGAY\s*(\d{1,2})\s*THANG\s*(\d{1,2})\s*NAM\s*(\d{4})/.exec(s);
  if (m) {
    const d = +m[1], mo = +m[2], y = +m[3];
    if (validDate(y, mo, d)) return withTime({ y, m: mo, d });
  }
  // "26 THG7 2023" / "26 THG 7, 2023" / "26 THANG 7 2023"
  m = /\b(\d{1,2})\s*(?:THG|THANG|TH)\s*\.?\s*(\d{1,2})[,\s]+(?:NAM\s*)?(\d{4})\b/.exec(s);
  if (m) {
    const d = +m[1], mo = +m[2], y = +m[3];
    if (validDate(y, mo, d)) return withTime({ y, m: mo, d });
  }
  // "12 SEPTEMBER 2023" / "12-SEP-23" / "12TH SEP 2023"
  m = /\b(\d{1,2})(?:ST|ND|RD|TH)?[\s\-/.]*([A-Z]{3,9})[\s\-/.,]*(\d{2,4})\b/.exec(s);
  if (m && MONTHS[m[2]]) {
    const d = +m[1], mo = MONTHS[m[2]], y = expandYear(+m[3]);
    if (validDate(y, mo, d)) return withTime({ y, m: mo, d });
  }
  // "SEPTEMBER 12, 2023" / "SEP 12 2023"
  m = /\b([A-Z]{3,9})[\s.]*(\d{1,2})(?:ST|ND|RD|TH)?[\s,]+(\d{4})\b/.exec(s);
  if (m && MONTHS[m[1]]) {
    const d = +m[2], mo = MONTHS[m[1]], y = +m[3];
    if (validDate(y, mo, d)) return withTime({ y, m: mo, d });
  }
  // ddMMyyyy dính liền
  m = /^(\d{2})(\d{2})(\d{4})$/.exec(s);
  if (m) {
    const d = +m[1], mo = +m[2], y = +m[3];
    if (validDate(y, mo, d)) return withTime({ y, m: mo, d });
  }
  return null;
}

const p2 = (n: number) => String(n).padStart(2, "0");

export function formatDate(d: SimpleDate): string {
  return `${p2(d.d)}/${p2(d.m)}/${d.y}`;
}

export function formatDateTime(d: SimpleDate): string {
  return `${formatDate(d)} ${p2(d.hh ?? 0)}:${p2(d.mm ?? 0)}`;
}

export function toIsoDate(d: SimpleDate): string {
  return `${d.y}-${p2(d.m)}-${p2(d.d)}`;
}

/** Chuỗi bất kỳ -> dd/MM/yyyy; không đọc được thì trả nguyên (để validator gắn cờ). */
export function normalizeDate(s: string): string {
  const d = parseDate(s);
  return d ? formatDate(d) : collapseSpaces(s ?? "");
}

/** Chuỗi bất kỳ -> dd/MM/yyyy HH:mm; nếu không có giờ thì giữ dd/MM/yyyy (không bịa giờ). */
export function normalizeDateTime(s: string): string {
  const d = parseDate(s);
  if (!d) return collapseSpaces(s ?? "");
  return d.hh !== undefined ? formatDateTime(d) : formatDate(d);
}

/** So sánh ngày: -1, 0, 1 (bỏ qua giờ nếu một bên không có). */
export function compareDates(a: SimpleDate, b: SimpleDate): number {
  const ka = a.y * 10000 + a.m * 100 + a.d;
  const kb = b.y * 10000 + b.m * 100 + b.d;
  if (ka !== kb) return ka < kb ? -1 : 1;
  if (a.hh !== undefined && b.hh !== undefined) {
    const ta = a.hh * 60 + (a.mm ?? 0);
    const tb = b.hh * 60 + (b.mm ?? 0);
    if (ta !== tb) return ta < tb ? -1 : 1;
  }
  return 0;
}

export function ageAt(birth: SimpleDate, at: SimpleDate): number {
  let age = at.y - birth.y;
  if (at.m < birth.m || (at.m === birth.m && at.d < birth.d)) age--;
  return age;
}

// ---------------------------------------------------------------------------
// Số
// ---------------------------------------------------------------------------

/**
 * "6,600.496 MT" -> "6600.496"; "1.234,5" -> "1234.5"; "7,8" -> "7.8".
 * Trả "" nếu không có số. Không làm tròn.
 */
export function normalizeNumber(input: string | null | undefined): string {
  if (input === null || input === undefined) return "";
  const s = String(input).replace(/\s+/g, "");
  const m = /-?[\d.,]+/.exec(s);
  if (!m) return "";
  let num = m[0];
  const lastComma = num.lastIndexOf(",");
  const lastDot = num.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) num = num.replace(/\./g, "").replace(",", ".");
    else num = num.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const parts = num.split(",");
    // "6,600" (nhóm nghìn) vs "7,8" (thập phân)
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3 && parts[0].length <= 3 && parts[0] !== "0")) num = num.replace(/,/g, "");
    else num = num.replace(",", ".");
  } else if ((num.match(/\./g) ?? []).length > 1) {
    num = num.replace(/\./g, "");
  }
  num = num.replace(/^(-?)0+(?=\d)/, "$1");
  if (!/^-?\d+(\.\d+)?$/.test(num)) return "";
  return num;
}

export function normalizeInteger(input: string | null | undefined): string {
  const n = normalizeNumber(input);
  if (!n) return "";
  return /^-?\d+$/.test(n) ? n : n;
}

// ---------------------------------------------------------------------------
// Mã số
// ---------------------------------------------------------------------------

export function normalizeContainer(s: string): string {
  return (s ?? "").replace(/[\s\-.]/g, "").toUpperCase();
}

export function normalizeIdNumber(s: string): string {
  return (s ?? "").replace(/\s+/g, "").toUpperCase();
}

/** "13/2023" / "V.13-2023" / "VOY 13" -> { num: "13", year: "2023" } */
export function normalizeVoyageNo(s: string | null | undefined): { num: string; year: string | null; key: string } | null {
  if (!s) return null;
  const t = stripAccents(String(s)).toUpperCase();
  const year = /\b(19|20)\d{2}\b/.exec(t)?.[0] ?? null;
  const rest = year ? t.replace(year, " ") : t;
  const num = /\d+/.exec(rest)?.[0];
  if (!num) return null;
  const n = String(parseInt(num, 10));
  return { num: n, year, key: year ? `${n}/${year}` : n };
}

// ---------------------------------------------------------------------------
// Họ tên thuyền viên
// ---------------------------------------------------------------------------

export function splitName(full: string, rule: NameSplitRule): { familyName: string; givenName: string } {
  const parts = collapseSpaces(full ?? "").split(" ").filter(Boolean);
  if (parts.length === 0) return { familyName: "", givenName: "" };
  if (rule === "allInGivenName") return { familyName: "", givenName: parts.join(" ") };
  if (parts.length === 1) return { familyName: "", givenName: parts[0] };
  if (rule === "lastTokenIsFamily") return { familyName: parts[parts.length - 1], givenName: parts.slice(0, -1).join(" ") };
  return { familyName: parts[0], givenName: parts.slice(1).join(" ") };
}

export const NAME_RULE_LABELS: Record<NameSplitRule, string> = {
  firstTokenIsFamily: "Họ = từ đầu tiên, Tên = phần còn lại (mặc định, kiểu Việt Nam)",
  lastTokenIsFamily: "Họ = từ cuối cùng, Tên = phần còn lại (kiểu phương Tây)",
  allInGivenName: "Để trống Họ, ghi toàn bộ họ tên vào cột Tên",
};
