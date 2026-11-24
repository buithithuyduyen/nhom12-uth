/**
 * lib/types.ts
 *
 * Kiểu dữ liệu dùng chung giữa server và client.
 * File này KHÔNG import module Node nào để có thể dùng ở trình duyệt.
 */

// ---------------------------------------------------------------------------
// Cờ & giá trị trường
// ---------------------------------------------------------------------------

export type FlagKind =
  | "unverified" // không tìm thấy nguyên văn trong text nguồn
  | "corrected" // đã sửa theo text gốc (Levenshtein <= 1)
  | "fromImage" // đọc từ ảnh, cần kiểm tra
  | "lowConfidence" // confidence < 0.8
  | "needsInput" // ô template mà chứng từ không có
  | "needsConfirm" // giá trị cần người dùng xác nhận (vd. mã không có alias)
  | "invalid" // không qua validator
  | "textImageConflict" // text và ảnh mâu thuẫn
  | "missingRows"; // bảng có thể thiếu dòng

export interface Flag {
  kind: FlagKind;
  message: string;
}

export interface SourceRef {
  fileId: string;
  fileName: string;
  page: number;
}

export interface FieldValue {
  /** Giá trị sẽ ghi vào Excel (đã chuẩn hóa). Chuỗi rỗng = trống. */
  value: string;
  /** Giá trị nguyên văn trong chứng từ (trước chuẩn hóa) nếu có. */
  raw?: string;
  confidence?: number;
  source?: SourceRef;
  sourceText?: string;
  flags?: Flag[];
  /** true khi người dùng đã sửa tay -> tổng hợp lại không ghi đè. */
  userEdited?: boolean;
}

export interface TableRow {
  id: string;
  cells: Record<string, FieldValue>;
  userEdited?: boolean;
}

export interface SectionData {
  header: Record<string, FieldValue>;
  tables: Record<string, TableRow[]>;
}

/** Khóa nhóm dữ liệu. "voyage" đổ vào cả Notice ship to port và General Declaration. */
export type SectionKey = "crew" | "voyage" | "goods" | "hbl" | "store" | "security";

export type SheetsData = Record<SectionKey, SectionData>;

// ---------------------------------------------------------------------------
// Chứng từ / trang
// ---------------------------------------------------------------------------

export const DOC_TYPES = [
  "crew_list",
  "bill_of_lading",
  "cargo_manifest",
  "notice_of_arrival",
  "ship_store",
  "crew_effects",
  "port_clearance",
  "voyage_memory",
  "ship_particulars",
  "registry_certificate",
  "health_declaration",
  "security_certificate",
  "other",
  "unknown",
] as const;

export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  crew_list: "Danh sách thuyền viên",
  bill_of_lading: "Vận đơn (B/L)",
  cargo_manifest: "Bản lược khai hàng hóa",
  notice_of_arrival: "Thông báo tàu đến",
  ship_store: "Bản khai dự trữ tàu",
  crew_effects: "Hành lý thuyền viên",
  port_clearance: "Giấy phép rời cảng",
  voyage_memory: "Voyage memory",
  ship_particulars: "Thông số tàu",
  registry_certificate: "GCN đăng ký tàu",
  health_declaration: "Khai báo y tế",
  security_certificate: "Chứng nhận an ninh",
  other: "Khác",
  unknown: "Chưa rõ",
};

export type PageStatus = "pending" | "processing" | "done" | "error";
export type PageKind = "text" | "scanned" | "mixed";

export interface PageInfo {
  page: number;
  kind: PageKind;
  /** Tiêu đề phần (DOCX) nếu có */
  title?: string;
  docType: DocType | null;
  mode: "1-1" | "N-1" | null;
  port: string | null;
  date: string | null;
  voyageNo: string | null;
  rotation: number;
  active: boolean;
  status: PageStatus;
  error?: string;
  confidence?: number;
  /** Có ảnh trang để xem (PDF/ảnh) */
  hasImage: boolean;
  /** Có HTML để xem (DOCX) */
  hasHtml: boolean;
  /** Ghi chú về việc tự động bật/tắt trang */
  activeNote?: string;
  /** true khi người dùng tự bật/tắt -> hệ thống không tự chọn lại */
  activeManual?: boolean;
}

export interface FileRecord {
  fileId: string;
  fileName: string;
  ext: string;
  size: number;
  sha256: string;
  uploadedAt: string;
  /** fileId của bản gốc nếu file này trùng SHA-256 */
  duplicateOf?: string;
  pages: PageInfo[];
}

/** Kết quả bóc tách cho một DocumentInstance (một trang/một phần). */
export interface ExtractedInstance {
  fileId: string;
  fileName: string;
  page: number;
  docType: DocType;
  kind: PageKind;
  header: Record<string, FieldValue>;
  tables: Record<string, Array<Record<string, FieldValue>>>;
  /** Số dòng đếm cơ học được trong text (nếu có) */
  mechanicalRowCount?: number;
  /** Cảnh báo ở mức chứng từ (vd. "có thể thiếu dòng") */
  notes?: string[];
  extractedAt: string;
}

// ---------------------------------------------------------------------------
// Đối chiếu
// ---------------------------------------------------------------------------

export interface DiscrepancySource {
  fileName: string;
  page: number;
  value: string;
}

export interface Discrepancy {
  id: string;
  field: string;
  label: string;
  sheetTarget: string;
  severity: "error" | "warning";
  message: string;
  sources: DiscrepancySource[];
  /** Vị trí ô trong UI để nhảy tới */
  target?: { section: SectionKey; field?: string; table?: string; rowId?: string; column?: string };
  resolvedValue?: string;
}

export interface CrosscheckResult {
  discrepancies: Discrepancy[];
  /** Số cặp/nhóm nguồn đã được so sánh */
  comparedGroups: number;
}

// ---------------------------------------------------------------------------
// Shipment
// ---------------------------------------------------------------------------

export type ShipmentStatus = "draft" | "extracted" | "reviewed" | "exported";

export interface ExportRecord {
  exportId: string;
  fileName: string;
  createdAt: string;
}

export interface ExtractedData {
  instances: ExtractedInstance[];
  sheets: SheetsData;
}

export interface Shipment {
  id: string;
  voyageName: string;
  status: ShipmentStatus;
  createdAt: string;
  updatedAt: string;
  templateId: string;
  files: FileRecord[];
  extractedData: ExtractedData;
  discrepancies: Discrepancy[];
  /** discrepancyId -> giá trị người dùng đã chọn */
  resolvedValues: Record<string, string>;
  exports: ExportRecord[];
}

// ---------------------------------------------------------------------------
// Danh mục mã
// ---------------------------------------------------------------------------

export type CodeType =
  | "country"
  | "goods"
  | "passportType"
  | "unit"
  | "function"
  | "packageType"
  | "rank"
  | "containerType"
  | "portPurpose"
  | "cargoGroup";

export interface CodeEntry {
  code: string;
  name: string;
}

export type CodeTables = Record<CodeType, CodeEntry[]>;

export interface PortEntry {
  code: string;
  name: string;
  aliases?: string[];
}

// ---------------------------------------------------------------------------
// Cài đặt
// ---------------------------------------------------------------------------

export type NameSplitRule = "firstTokenIsFamily" | "lastTokenIsFamily" | "allInGivenName";

export interface AppSettings {
  nameSplitRule: NameSplitRule;
}

export const DEFAULT_SETTINGS: AppSettings = {
  nameSplitRule: "firstTokenIsFamily",
};

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

export interface TemplateInfo {
  id: string;
  name: string;
  uploadedAt: string | null;
  builtin: boolean;
  isDefault: boolean;
}

export function emptySection(): SectionData {
  return { header: {}, tables: {} };
}

export function emptySheets(): SheetsData {
  return {
    crew: emptySection(),
    voyage: emptySection(),
    goods: emptySection(),
    hbl: emptySection(),
    store: emptySection(),
    security: emptySection(),
  };
}
