/**
 * lib/codes.ts
 *
 * Chuẩn hóa mã theo sheet "Declaration list" (THUẦN – nhận bảng mã làm tham số, dùng được ở client).
 * Bảng mã được đọc từ template lúc khởi động và cache ở server (lib/templates.ts -> getCodeTables).
 *
 * - Chức danh: CHỈ tra exact + bảng alias viết tay. KHÔNG fuzzy.
 * - Quốc tịch / đơn vị / loại kiện: exact + alias, sau đó fuse.js.
 * - Mã hàng: exact; không có -> trả gợi ý (không tự chốt).
 */

import Fuse from "fuse.js";
import type { CodeEntry, CodeTables, CodeType } from "@/lib/types";
import { canonicalText } from "@/lib/normalize";

export type MatchMethod = "exact" | "alias" | "name" | "fuzzy" | "none";

export interface CodeMatch {
  code: string | null;
  method: MatchMethod;
  /** Gợi ý khi không chốt được */
  suggestions: CodeEntry[];
}

/** Alias chức danh (tra exact sau khi chuẩn hóa). Giá trị không có ở đây -> để trống + cần xác nhận. */
export const RANK_ALIASES: Record<string, string> = {
  CAPT: "CAP",
  "CAPT.": "CAP",
  CAPTAIN: "CAP",
  MASTER: "CAP",
  CO: "COF",
  "C/O": "COF",
  "CH/O": "COF",
  "CHIEF OFFICER": "COF",
  "CHIEF MATE": "COF",
  "1/O": "COF",
  "2/O": "2OF",
  "2O": "2OF",
  "2ND OFFICER": "2OF",
  "SECOND OFFICER": "2OF",
  "3/O": "3OF",
  "3O": "3OF",
  "3RD OFFICER": "3OF",
  "THIRD OFFICER": "3OF",
  CE: "CEG",
  "C/E": "CEG",
  "CH/E": "CEG",
  "CHIEF ENGINEER": "CEG",
  "2/E": "2EG",
  "2E": "2EG",
  "2ND ENGINEER": "2EG",
  "SECOND ENGINEER": "2EG",
  "3/E": "3EG",
  "3E": "3EG",
  "3RD ENGINEER": "3EG",
  "THIRD ENGINEER": "3EG",
  COOK: "COK",
  "CH/COOK": "CCK",
  "CH.COOK": "CCK",
  "C/COOK": "CCK",
  "CHIEF COOK": "CCK",
  "4/E": "XEG",
  "4E": "XEG",
  "4TH ENGINEER": "XEG",
  BOSUN: "BSN",
  BSN: "BSN",
  BOATSWAIN: "BSN",
  // Thủy thủ / thợ máy trực ca
  AB: "ABS",
  ABD: "ABS",
  "A/B": "ABS",
  "AB DECK": "ABS",
  "ABLE SEAMAN": "ABS",
  ABE: "ABR",
  "AB ENGINE": "ABR",
  OS: "COL",
  OSD: "COL",
  "O/S": "COL",
  "ORDINARY SEAMAN": "COL",
  OSE: "OLR",
  OILER: "OLR",
  OLR: "OLR",
  WIPER: "OLR",
  FITTER: "FIT",
  "NO.1 OILER": "FIT",
  ETO: "ELE",
  "ELECTRICAL OFFICER": "ELE",
  ELECTRICIAN: "ELR",
  "ELECT": "ELR",
  PUMPMAN: "PUM",
  MESSMAN: "SSD",
  STEWARD: "SSD",
  "DECK CADET": "DOT",
  "ENGINE CADET": "EOT",
};

const COUNTRY_ALIASES: Record<string, string> = {
  VIETNAM: "VN",
  "VIET NAM": "VN",
  "VIETNAMESE": "VN",
  "VIET-NAM": "VN",
  VN: "VN",
  "SOCIALIST REPUBLIC OF VIETNAM": "VN",
  CHINA: "CN",
  CHINESE: "CN",
  PHILIPPINES: "PH",
  FILIPINO: "PH",
  INDONESIA: "ID",
  INDONESIAN: "ID",
  MYANMAR: "MM",
  BURMESE: "MM",
  INDIA: "IN",
  INDIAN: "IN",
  "SOUTH KOREA": "KR",
  KOREA: "KR",
  KOREAN: "KR",
  JAPAN: "JP",
  JAPANESE: "JP",
  THAILAND: "TH",
  THAI: "TH",
  MALAYSIA: "MY",
  MALAYSIAN: "MY",
  SINGAPORE: "SG",
  RUSSIA: "RU",
  RUSSIAN: "RU",
  UKRAINE: "UA",
  UKRAINIAN: "UA",
  BRUNEI: "BN",
  "BRUNEI DARUSSALAM": "BN",
  CAMBODIA: "KH",
  BANGLADESH: "BD",
  "SRI LANKA": "LK",
  PANAMA: "PA",
  LIBERIA: "LR",
  "HONG KONG": "HK",
  TAIWAN: "TW",
};

const UNIT_ALIASES: Record<string, string> = {
  MT: "TNE",
  "M/T": "TNE",
  MTS: "TNE",
  TON: "TNE",
  TONS: "TNE",
  TONNE: "TNE",
  TONNES: "TNE",
  TAN: "TNE",
  KG: "KGM",
  KGS: "KGM",
  KILOGRAM: "KGM",
  KILOGRAMS: "KGM",
  M3: "MTQ",
  CBM: "MTQ",
  "CUBIC METER": "MTQ",
  "CUBIC METRE": "MTQ",
  M2: "MTK",
  LTR: "LTR",
  LTRS: "LTR",
  LIT: "LTR",
  LITRE: "LTR",
  LITER: "LTR",
  LITERS: "LTR",
  PCS: "PCE",
  PC: "PCE",
  PIECE: "PCE",
  PIECES: "PCE",
  SETS: "SET",
  ROLL: "ROL",
  ROLLS: "ROL",
};

const PACKAGE_ALIASES: Record<string, string> = {
  "IN BULK": "NE",
  BULK: "NE",
  "BULK CARGO": "NE",
  "HANG ROI": "NE",
  UNPACKED: "NE",
  BAG: "BG",
  BAGS: "BG",
  JUMBO: "JB",
  "JUMBO BAG": "JB",
  "JUMBO BAGS": "JB",
  CONTAINER: "CN",
  CONTAINERS: "CN",
  PALLET: "PX",
  PALLETS: "PX",
  CARTON: "CT",
  CARTONS: "CT",
  DRUM: "DR",
  DRUMS: "DR",
  COIL: "CL",
  COILS: "CL",
  BUNDLE: "BE",
  BUNDLES: "BE",
  CASE: "CS",
  CASES: "CS",
  PACKAGE: "PK",
  PACKAGES: "PK",
};

const ALIASES: Partial<Record<CodeType, Record<string, string>>> = {
  rank: RANK_ALIASES,
  country: COUNTRY_ALIASES,
  unit: UNIT_ALIASES,
  packageType: PACKAGE_ALIASES,
};

const FUZZY_TYPES = new Set<CodeType>(["country", "unit", "packageType", "containerType", "portPurpose", "cargoGroup"]);

function cleanKey(s: string): string {
  return canonicalText(s).replace(/\s*\/\s*/g, "/").replace(/[.,;]+$/g, "");
}

const fuseCache = new WeakMap<CodeEntry[], Fuse<CodeEntry>>();
function getFuse(entries: CodeEntry[]): Fuse<CodeEntry> {
  let f = fuseCache.get(entries);
  if (!f) {
    f = new Fuse(entries, { keys: [{ name: "name", weight: 2 }, { name: "code", weight: 1 }], threshold: 0.3, includeScore: true, ignoreLocation: true });
    fuseCache.set(entries, f);
  }
  return f;
}

export function findEntry(tables: CodeTables | null, type: CodeType, code: string): CodeEntry | undefined {
  if (!tables || !code) return undefined;
  const key = code.trim().toUpperCase();
  return tables[type].find((e) => e.code.toUpperCase() === key);
}

export function codeName(tables: CodeTables | null, type: CodeType, code: string): string {
  return findEntry(tables, type, code)?.name ?? "";
}

export function matchCode(tables: CodeTables | null, type: CodeType, raw: string | null | undefined): CodeMatch {
  const none: CodeMatch = { code: null, method: "none", suggestions: [] };
  if (!tables || !raw || !String(raw).trim()) return none;
  const entries = tables[type];
  const key = cleanKey(String(raw));

  const exact = entries.find((e) => e.code.toUpperCase() === key);
  if (exact) return { code: exact.code, method: "exact", suggestions: [] };

  const aliasTarget = ALIASES[type]?.[key];
  if (aliasTarget) {
    const hit = entries.find((e) => e.code.toUpperCase() === aliasTarget.toUpperCase());
    if (hit) return { code: hit.code, method: "alias", suggestions: [] };
  }

  if (type === "rank") {
    // KHÔNG fuzzy cho chức danh – để trống, người dùng chọn.
    return { code: null, method: "none", suggestions: [] };
  }

  const byName = entries.find((e) => e.name && cleanKey(e.name) === key);
  if (byName) return { code: byName.code, method: "name", suggestions: [] };

  if (type === "goods") {
    const suggestions = getFuse(entries)
      .search(String(raw))
      .slice(0, 5)
      .map((r) => r.item);
    const other = entries.find((e) => /HANG KHO KHAC/.test(canonicalText(e.name)));
    if (other && !suggestions.includes(other)) suggestions.push(other);
    return { code: null, method: "none", suggestions };
  }

  if (FUZZY_TYPES.has(type)) {
    const results = getFuse(entries).search(String(raw));
    if (results.length > 0 && (results[0].score ?? 1) <= 0.15) {
      return { code: results[0].item.code, method: "fuzzy", suggestions: results.slice(1, 4).map((r) => r.item) };
    }
    return { code: null, method: "none", suggestions: results.slice(0, 5).map((r) => r.item) };
  }
  return none;
}

export function searchCodes(tables: CodeTables | null, type: CodeType, query: string, limit = 50): CodeEntry[] {
  if (!tables) return [];
  const entries = tables[type];
  const q = query.trim();
  if (!q) return entries.slice(0, limit);
  const key = canonicalText(q);
  const starts = entries.filter((e) => e.code.toUpperCase().startsWith(key) || canonicalText(e.name).includes(key));
  if (starts.length >= 3) return starts.slice(0, limit);
  const fuzzy = getFuse(entries)
    .search(q)
    .map((r) => r.item);
  const merged = [...starts, ...fuzzy.filter((e) => !starts.includes(e))];
  return merged.slice(0, limit);
}

export const CODE_TYPE_LABELS: Record<CodeType, string> = {
  country: "Quốc gia",
  goods: "Hàng hóa",
  passportType: "Loại hộ chiếu",
  unit: "Đơn vị tính",
  function: "Chức năng chứng từ",
  packageType: "Loại kiện",
  rank: "Chức danh",
  containerType: "Loại container",
  portPurpose: "Mục đích đến cảng",
  cargoGroup: "Phân nhóm hàng hóa",
};
