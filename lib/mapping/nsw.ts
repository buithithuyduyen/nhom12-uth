/**
 * lib/mapping/nsw.ts
 *
 * Khai báo toàn bộ mapping giữa dữ liệu ứng dụng và ô trong TemplateNSW.xlsx.
 *
 * - SECTIONS: định nghĩa trường (nhãn, kiểu, ràng buộc) cho từng nhóm dữ liệu – dùng cho UI, validator, bóc tách.
 * - SHEET_MAPPINGS: mỗi sheet Excel được ghi là MỘT khai báo (tọa độ ô / cột / vùng xóa / ô công thức giữ nguyên).
 *   Thêm sheet mới chỉ cần thêm một khai báo ở đây.
 *
 * File này thuần dữ liệu, dùng được cả ở server và client.
 */

import type { CodeType, SectionKey } from "@/lib/types";

export type FieldType = "text" | "date" | "datetime" | "number" | "integer" | "select" | "code" | "port";

export const SIGNER_OPTIONS = ["Thuyền trưởng/Master", "Đại lý/ShipAgency", "Chủ tàu/ShipOwner"] as const;
export const GENDER_OPTIONS = ["Nam/Man", "Nữ/Woman"] as const;
export const YES_NO_OPTIONS = ["Có/Yes", "Không/No"] as const;
export const DEFAULT_FUNCTION_CODE = "CN01";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  maxLength?: number;
  /** Định dạng hiển thị/ghi: "dd/MM/yyyy" hoặc "dd/MM/yyyy HH:mm" */
  format?: string;
  required?: boolean;
  codeType?: CodeType;
  options?: readonly string[];
  /** Giá trị cố định được phép tự điền (chỉ CN01 theo yêu cầu) */
  defaultValue?: string;
  /** Ô template mà chứng từ thường không có -> tô vàng "cần nhập" khi trống */
  needsInputIfEmpty?: boolean;
  /** Nhiều cảng phân cách bằng ";" */
  multiple?: boolean;
  /** Cột suy ra (không nhập tay), vd. tên hàng từ mã hàng */
  derivedFrom?: { key: string; codeType: CodeType };
  hint?: string;
  /** Độ rộng cột gợi ý trong bảng UI (px) */
  width?: number;
}

export interface TableDef {
  key: string;
  label: string;
  columns: FieldDef[];
  maxRows?: number;
}

export interface SectionDef {
  key: SectionKey;
  label: string;
  header: FieldDef[];
  tables: TableDef[];
}

// ---------------------------------------------------------------------------
// Định nghĩa trường theo nhóm
// ---------------------------------------------------------------------------

const functionField: FieldDef = {
  key: "function",
  label: "Chức năng của chứng từ",
  type: "code",
  codeType: "function",
  required: true,
  defaultValue: DEFAULT_FUNCTION_CODE,
};

const signPlace: FieldDef = { key: "signPlace", label: "Nơi ký", type: "text", maxLength: 50 };
const signDate: FieldDef = { key: "signDate", label: "Ngày ký", type: "date", format: "dd/MM/yyyy" };
const signedBy: FieldDef = {
  key: "signedBy",
  label: "Người ký (vai trò)",
  type: "select",
  options: SIGNER_OPTIONS,
  hint: "Không phải tên người. Chỉ chọn 1 trong 3 vai trò.",
};

export const CREW_SECTION: SectionDef = {
  key: "crew",
  label: "Danh sách thuyền viên",
  header: [functionField, signPlace, signDate, signedBy],
  tables: [
    {
      key: "crew",
      label: "Thuyền viên",
      columns: [
        { key: "familyName", label: "Họ", type: "text", maxLength: 50, required: true, width: 120 },
        { key: "givenName", label: "Tên", type: "text", maxLength: 50, required: true, width: 150 },
        { key: "rank", label: "Chức danh", type: "code", codeType: "rank", required: true, width: 130 },
        { key: "nationality", label: "Quốc tịch", type: "code", codeType: "country", maxLength: 2, required: true, width: 90 },
        { key: "dateOfBirth", label: "Ngày sinh", type: "date", format: "dd/MM/yyyy", required: true, width: 110 },
        { key: "placeOfBirth", label: "Nơi sinh", type: "text", maxLength: 200, required: true, width: 130 },
        { key: "passportType", label: "Loại hộ chiếu", type: "code", codeType: "passportType", required: true, needsInputIfEmpty: true, width: 90 },
        { key: "passportNo", label: "Số hộ chiếu", type: "text", maxLength: 20, required: true, width: 120 },
        { key: "passportExpiry", label: "Ngày hết hạn HC", type: "date", format: "dd/MM/yyyy", width: 110 },
        { key: "gender", label: "Giới tính", type: "select", options: GENDER_OPTIONS, needsInputIfEmpty: true, width: 130 },
        { key: "goAshore", label: "Có đi bờ?", type: "select", options: YES_NO_OPTIONS, needsInputIfEmpty: true, width: 100 },
      ],
    },
  ],
};

export const VOYAGE_SECTION: SectionDef = {
  key: "voyage",
  label: "Thông tin chuyến đi (Notice ship to port + General Declaration)",
  header: [
    functionField,
    { key: "lastPorts", label: "Các cảng trước", type: "port", multiple: true, maxLength: 165, required: true, hint: "Phân cách bằng ';'" },
    { key: "nextPorts", label: "Các cảng sẽ đến", type: "port", multiple: true, maxLength: 165, required: true, hint: "Phân cách bằng ';'" },
    { key: "dischargePorts", label: "Các cảng sẽ dỡ hàng", type: "port", multiple: true, maxLength: 165, required: true, hint: "Phân cách bằng ';'" },
    { key: "remainingCargo", label: "Số hàng còn lại", type: "text", maxLength: 165, required: true },
    { key: "draftForward", label: "Mớn nước F (m)", type: "number", required: true },
    { key: "draftAft", label: "Mớn nước A (m)", type: "number", required: true },
    { key: "airDraft", label: "Chiều cao tĩnh không (m)", type: "number", required: true },
    { key: "remarks", label: "Ghi chú", type: "text", maxLength: 500 },
    { key: "qtyCargoDecl", label: "SL Bản khai hàng hóa", type: "integer", maxLength: 9 },
    { key: "qtyStoresDecl", label: "SL Bản khai dự trữ", type: "integer", maxLength: 9 },
    { key: "qtyCrewList", label: "SL Danh sách thuyền viên", type: "integer", maxLength: 9 },
    { key: "qtyPassengerList", label: "SL Danh sách hành khách", type: "integer", maxLength: 9 },
    { key: "qtyCrewEffects", label: "SL Bản khai hành lý TV", type: "integer", maxLength: 9 },
    { key: "qtyHealthDecl", label: "SL Bản khai kiểm dịch y tế", type: "integer", maxLength: 9 },
    { key: "wasteRequest", label: "Yêu cầu tiếp nhận chất thải", type: "text", maxLength: 500, required: true },
    { key: "berthPosition", label: "Vị trí tàu tại cảng", type: "text", maxLength: 165, required: true },
    { key: "tugboat", label: "Tàu lai", type: "text", maxLength: 250 },
    { key: "portClearanceNo", label: "Mã số giấy phép rời cảng", type: "text", maxLength: 250 },
    { key: "arrivalDeparture", label: "Thời gian đến/rời cảng", type: "datetime", format: "dd/MM/yyyy HH:mm", required: true },
    { key: "berthingTime", label: "Thời gian cập cảng", type: "datetime", format: "dd/MM/yyyy HH:mm" },
    { key: "pilotOnBoard", label: "Thời gian hoa tiêu lên tàu", type: "datetime", format: "dd/MM/yyyy HH:mm" },
    { key: "clearanceLink", label: "Link tra cứu GP rời cảng (chỉ General Declaration)", type: "text", maxLength: 500 },
    { key: "clearanceQr", label: "Mã QR tra cứu GP rời cảng (chỉ General Declaration)", type: "text", maxLength: 500 },
    { key: "fuelDO", label: "Dầu DO", type: "number" },
    { key: "fuelFO", label: "Dầu FO", type: "number" },
    { key: "freshWater", label: "Nước ngọt FW", type: "number" },
    signPlace,
    signDate,
    signedBy,
  ],
  tables: [
    {
      key: "waste",
      label: "Chất thải (tối đa 6 loại)",
      maxRows: 6,
      columns: [
        { key: "wasteType", label: "Loại chất thải", type: "select", options: ["1", "2", "3", "4", "5", "6"], width: 120 },
        { key: "unit", label: "Đơn vị", type: "select", options: ["kg", "m3"], width: 100 },
        { key: "amount", label: "Khối lượng", type: "number", width: 120 },
      ],
    },
    {
      key: "cargo",
      label: "Hàng hóa",
      columns: [
        { key: "cargoGroup", label: "Phân nhóm", type: "code", codeType: "cargoGroup", width: 110 },
        { key: "cargoType", label: "Loại hàng", type: "select", options: ["9", "3", "12"], hint: "9 container, 3 hàng lỏng, 12 hàng khô", width: 90 },
        { key: "goodsCode", label: "Mã tên hàng", type: "code", codeType: "goods", width: 110 },
        { key: "goodsName", label: "Tên hàng (tự tra)", type: "text", derivedFrom: { key: "goodsCode", codeType: "goods" }, width: 160 },
        { key: "quantity", label: "Số lượng", type: "number", width: 110 },
        { key: "unit", label: "Đơn vị", type: "select", options: ["TNE", "OCE", "TEU", "UNC"], width: 90 },
        { key: "description", label: "Mô tả", type: "text", width: 220 },
      ],
    },
  ],
};

export const GOODS_SECTION: SectionDef = {
  key: "goods",
  label: "Bản khai hàng hóa",
  header: [
    functionField,
    { key: "totalPackages", label: "Tổng số kiện", type: "integer", maxLength: 8, required: true },
    { key: "packageKind", label: "Loại kiện", type: "code", codeType: "packageType", required: true, hint: "Hàng rời = NE" },
  ],
  tables: [
    {
      key: "bl",
      label: "Vận đơn / hàng hóa",
      columns: [
        { key: "blNumber", label: "Số vận đơn", type: "text", maxLength: 35, required: true, width: 150 },
        { key: "shipper", label: "Người gửi hàng", type: "text", maxLength: 256, required: true, width: 220 },
        { key: "consignee", label: "Người nhận hàng", type: "text", maxLength: 256, required: true, width: 220 },
        { key: "notifyParty", label: "Người được thông báo", type: "text", maxLength: 500, required: true, width: 220 },
        { key: "notifyParty2", label: "Người được thông báo 2", type: "text", maxLength: 500, width: 200 },
        { key: "containerNo", label: "Số cont", type: "text", maxLength: 35, width: 120 },
        { key: "sealNo", label: "Số seal", type: "text", maxLength: 100, width: 110 },
        { key: "hsCode", label: "Mã HS", type: "text", width: 90 },
        { key: "description", label: "Tên/mô tả hàng", type: "text", maxLength: 4000, required: true, width: 240 },
        { key: "netWeight", label: "Trọng lượng tịnh", type: "number", required: true, width: 110 },
        { key: "grossWeight", label: "Tổng trọng lượng", type: "number", required: true, width: 110 },
        { key: "measurement", label: "Kích thước/thể tích", type: "number", required: true, width: 110 },
        { key: "manifestRef", label: "Số tham chiếu manifest", type: "text", maxLength: 20, width: 120 },
        { key: "adjustmentBasis", label: "Căn cứ hiệu chỉnh", type: "text", maxLength: 20, width: 110 },
        { key: "weightUnit", label: "ĐV trọng lượng", type: "code", codeType: "unit", required: true, width: 90 },
        { key: "dischargePort", label: "Cảng dỡ", type: "port", required: true, width: 110 },
        { key: "destinationPort", label: "Cảng đích", type: "port", width: 110 },
        { key: "loadingPort", label: "Cảng xếp", type: "port", required: true, width: 110 },
        { key: "originalLoadingPort", label: "Cảng xếp gốc", type: "port", width: 110 },
        { key: "transhipmentPort", label: "Cảng trung chuyển", type: "port", width: 110 },
        { key: "finalDestination", label: "Cảng giao hàng/đích", type: "port", required: true, width: 120 },
        { key: "containerType", label: "Loại cont", type: "code", codeType: "containerType", required: true, width: 110 },
        { key: "measurementUnit", label: "ĐV thể tích", type: "code", codeType: "unit", width: 90 },
      ],
    },
  ],
};

export const HBL_SECTION: SectionDef = {
  key: "hbl",
  label: "Vận đơn gom hàng (khối đầu tiên)",
  header: [
    { key: "seq", label: "STT", type: "integer", hint: "Số thứ tự vận đơn (khối 1)" },
    functionField,
    { key: "shipper", label: "Người gửi hàng", type: "text", required: true },
    { key: "consignee", label: "Người nhận hàng", type: "text", required: true },
    { key: "notifyParty", label: "Người được thông báo 1", type: "text" },
    { key: "notifyParty2", label: "Người được thông báo 2", type: "text" },
    { key: "transhipmentPort", label: "Mã cảng chuyển tải/quá cảnh", type: "port" },
    { key: "finalDestination", label: "Mã cảng giao hàng/đích", type: "port" },
    { key: "loadingPort", label: "Mã cảng xếp hàng", type: "port" },
    { key: "dischargePort", label: "Mã cảng dỡ hàng", type: "port" },
    { key: "placeOfDelivery", label: "Địa điểm giao hàng", type: "text", required: true },
    { key: "cargoType", label: "Loại hàng", type: "text", maxLength: 20, required: true },
    { key: "hblNumber", label: "Số vận đơn", type: "text", required: true },
    { key: "hblDate", label: "Ngày phát hành vận đơn", type: "date", format: "dd/MM/yyyy", required: true },
    { key: "masterBlNumber", label: "Số vận đơn gốc", type: "text", required: true },
    { key: "masterBlDate", label: "Ngày phát hành vận đơn gốc", type: "date", format: "dd/MM/yyyy", required: true },
    { key: "departureDate", label: "Ngày khởi hành", type: "date", format: "dd/MM/yyyy", required: true },
    { key: "packages", label: "Tổng số kiện", type: "integer", maxLength: 9 },
    { key: "packageKind", label: "Loại kiện", type: "code", codeType: "packageType" },
    { key: "grossWeight", label: "Tổng trọng lượng", type: "number", required: true },
    { key: "grossWeightUnit", label: "Đơn vị tổng trọng lượng", type: "select", options: ["KGM", "TNE"], required: true },
    { key: "remark", label: "Ghi chú", type: "text" },
  ],
  tables: [
    {
      key: "lines",
      label: "Hàng hóa của vận đơn",
      columns: [
        { key: "hsCode", label: "Mã hàng (HS)", type: "text", width: 100 },
        { key: "description", label: "Mô tả hàng hóa", type: "text", maxLength: 4000, required: true, width: 260 },
        { key: "grossWeight", label: "Tổng trọng lượng", type: "number", required: true, width: 120 },
        { key: "measurement", label: "Kích thước/thể tích", type: "number", required: true, width: 120 },
        { key: "containerNo", label: "Số cont", type: "text", maxLength: 35, width: 120 },
        { key: "sealNo", label: "Số seal", type: "text", maxLength: 100, width: 120 },
      ],
    },
  ],
};

export const STORE_SECTION: SectionDef = {
  key: "store",
  label: "Bản khai dự trữ tàu",
  header: [
    functionField,
    { key: "personsOnBoard", label: "Số người trên tàu", type: "integer", maxLength: 9 },
    { key: "periodOfStay", label: "Thời gian ở cảng", type: "integer", maxLength: 9, required: true },
    signPlace,
    signDate,
    signedBy,
  ],
  tables: [
    {
      key: "items",
      label: "Vật phẩm dự trữ",
      columns: [
        { key: "name", label: "Tên vật phẩm", type: "text", maxLength: 250, required: true, width: 220 },
        { key: "quantity", label: "Số lượng", type: "number", required: true, width: 110 },
        { key: "unit", label: "Đơn vị", type: "code", codeType: "unit", required: true, width: 100 },
        { key: "location", label: "Vị trí trên tàu", type: "text", maxLength: 250, required: true, width: 180 },
        { key: "inUse", label: "Sử dụng trên tàu", type: "select", options: YES_NO_OPTIONS, needsInputIfEmpty: true, width: 120 },
      ],
    },
  ],
};

const YES_NO_EN = ["Yes", "No"] as const;

export const SECURITY_SECTION: SectionDef = {
  key: "security",
  label: "Bản khai an ninh tàu biển",
  header: [
    functionField,
    { key: "purposeCode", label: "Mục đích đến cảng (mã)", type: "code", codeType: "portPurpose", required: true },
    { key: "purposeDetail", label: "Chi tiết mục đích đến cảng", type: "text", maxLength: 250, required: true },
    { key: "hasIssc", label: "Tàu có GCN quốc tế về an ninh (ISSC)?", type: "select", options: YES_NO_EN, required: true },
    { key: "isscIssuer", label: "Cơ quan cấp ISSC", type: "text", maxLength: 200 },
    { key: "isscIssueDate", label: "Ngày cấp ISSC", type: "date", format: "dd/MM/yyyy", required: true },
    { key: "isscExpiryDate", label: "Ngày ISSC hết hạn", type: "date", format: "dd/MM/yyyy", required: true },
    { key: "securityLevel", label: "Cấp độ an ninh hiện tại", type: "select", options: ["1", "2", "3"], required: true },
    { key: "additionalMeasures", label: "Có áp dụng biện pháp an ninh bổ sung?", type: "select", options: YES_NO_EN, required: true },
    { key: "additionalDetails", label: "Chi tiết biện pháp an ninh", type: "text" },
    { key: "maintainSecurity", label: "Có duy trì biện pháp an ninh thích hợp?", type: "select", options: YES_NO_EN, required: true },
    { key: "maintainDetails", label: "Chi tiết duy trì an ninh", type: "text" },
    { key: "latitude", label: "Vĩ độ", type: "text", maxLength: 50, required: true },
    { key: "longitude", label: "Kinh độ", type: "text", maxLength: 500, required: true },
    { key: "eta", label: "Thời gian dự kiến đến cảng (ETA)", type: "datetime", format: "dd/MM/yyyy HH:mm", required: true },
    signPlace,
    signDate,
    signedBy,
  ],
  tables: [
    {
      key: "portCalls",
      label: "10 cảng ghé gần nhất",
      maxRows: 10,
      columns: [
        { key: "portCode", label: "Mã cảng", type: "port", required: true, width: 110 },
        { key: "portName", label: "Tên cảng", type: "text", width: 200 },
        { key: "arrivalDate", label: "Ngày đến", type: "date", format: "dd/MM/yyyy", required: true, width: 120 },
        { key: "departureDate", label: "Ngày đi", type: "date", format: "dd/MM/yyyy", required: true, width: 120 },
        { key: "securityLevel", label: "Cấp độ an ninh", type: "select", options: ["1", "2", "3"], required: true, width: 110 },
      ],
    },
  ],
};

export const SECTIONS: Record<SectionKey, SectionDef> = {
  crew: CREW_SECTION,
  voyage: VOYAGE_SECTION,
  goods: GOODS_SECTION,
  hbl: HBL_SECTION,
  store: STORE_SECTION,
  security: SECURITY_SECTION,
};

// ---------------------------------------------------------------------------
// Mapping sheet Excel
// ---------------------------------------------------------------------------

export interface CellBinding {
  key: string;
  cell: string;
}

export interface ColumnBinding {
  key: string;
  col: string;
}

export interface TableBinding {
  key: string;
  startRow: number;
  /** Dòng cuối của vùng mẫu (để biết khi nào phải sao chép style dòng trên) */
  templateEndRow: number;
  /** Số dòng tối đa được ghi (vd. chất thải 6 dòng) */
  maxRows?: number;
  columns: ColumnBinding[];
}

/** Khối lặp (List of House bill of lading). Giai đoạn 1 chỉ ghi khối đầu tiên. */
export interface RepeatBlockLayout {
  blockHeaderRow: number;
  dataRow: number;
  formulaRow: number;
  subHeaderRow: number;
  subStartRow: number;
}

export interface SheetMapping {
  sheetName: string;
  /** Mã ngắn để dùng trong UI / URL */
  id: string;
  section: SectionKey;
  /** Vùng xóa dữ liệu mẫu cũ (chỉ giá trị, giữ style) */
  clearRanges: string[];
  /** Ô công thức phải giữ nguyên, không xóa, không ghi */
  keepFormulaCells: string[];
  header: CellBinding[];
  tables: TableBinding[];
  repeatBlock?: RepeatBlockLayout;
  /** Trường của section không ghi vào sheet này */
  excludeKeys?: string[];
}

const CREW_LIST_MAPPING: SheetMapping = {
  sheetName: "Crew list",
  id: "crew-list",
  section: "crew",
  clearRanges: ["B3:B8", "A11:K48"],
  keepFormulaCells: ["C5"],
  header: [
    { key: "function", cell: "B5" },
    { key: "signPlace", cell: "B6" },
    { key: "signDate", cell: "B7" },
    { key: "signedBy", cell: "B8" },
  ],
  tables: [
    {
      key: "crew",
      startRow: 11,
      templateEndRow: 29,
      columns: [
        { key: "familyName", col: "A" },
        { key: "givenName", col: "B" },
        { key: "rank", col: "C" },
        { key: "nationality", col: "D" },
        { key: "dateOfBirth", col: "E" },
        { key: "placeOfBirth", col: "F" },
        { key: "passportType", col: "G" },
        { key: "passportNo", col: "H" },
        { key: "passportExpiry", col: "I" },
        { key: "gender", col: "J" },
        { key: "goAshore", col: "K" },
      ],
    },
  ],
};

const VOYAGE_CARGO_COLUMNS: ColumnBinding[] = [
  { key: "cargoGroup", col: "A" },
  { key: "cargoType", col: "B" },
  { key: "goodsCode", col: "C" },
  { key: "goodsName", col: "D" },
  { key: "quantity", col: "E" },
  { key: "unit", col: "F" },
  { key: "description", col: "G" },
];

const WASTE_COLUMNS: ColumnBinding[] = [
  { key: "wasteType", col: "A" },
  { key: "unit", col: "B" },
  { key: "amount", col: "C" },
];

const NOTICE_MAPPING: SheetMapping = {
  sheetName: "Notice ship to port",
  id: "notice",
  section: "voyage",
  clearRanges: ["B3:B4", "B5:B32", "A36:C41", "A44:G45"],
  keepFormulaCells: ["C5"],
  excludeKeys: ["clearanceLink", "clearanceQr"],
  header: [
    { key: "function", cell: "B5" },
    { key: "lastPorts", cell: "B6" },
    { key: "nextPorts", cell: "B7" },
    { key: "dischargePorts", cell: "B8" },
    { key: "remainingCargo", cell: "B9" },
    { key: "draftForward", cell: "B10" },
    { key: "draftAft", cell: "B11" },
    { key: "airDraft", cell: "B12" },
    { key: "remarks", cell: "B13" },
    { key: "qtyCargoDecl", cell: "B14" },
    { key: "qtyStoresDecl", cell: "B15" },
    { key: "qtyCrewList", cell: "B16" },
    { key: "qtyPassengerList", cell: "B17" },
    { key: "qtyCrewEffects", cell: "B18" },
    { key: "qtyHealthDecl", cell: "B19" },
    { key: "wasteRequest", cell: "B20" },
    { key: "berthPosition", cell: "B21" },
    { key: "tugboat", cell: "B22" },
    { key: "portClearanceNo", cell: "B23" },
    { key: "arrivalDeparture", cell: "B24" },
    { key: "berthingTime", cell: "B25" },
    { key: "pilotOnBoard", cell: "B26" },
    { key: "fuelDO", cell: "B27" },
    { key: "fuelFO", cell: "B28" },
    { key: "freshWater", cell: "B29" },
    { key: "signPlace", cell: "B30" },
    { key: "signDate", cell: "B31" },
    { key: "signedBy", cell: "B32" },
  ],
  tables: [
    { key: "waste", startRow: 36, templateEndRow: 41, maxRows: 6, columns: WASTE_COLUMNS },
    { key: "cargo", startRow: 44, templateEndRow: 45, columns: VOYAGE_CARGO_COLUMNS },
  ],
};

const GENERAL_DECLARATION_MAPPING: SheetMapping = {
  sheetName: "General Declaration",
  id: "general-declaration",
  section: "voyage",
  clearRanges: ["B3:B4", "B5:B34", "A38:C43", "A46:G47"],
  keepFormulaCells: ["C5"],
  header: [
    { key: "function", cell: "B5" },
    { key: "lastPorts", cell: "B6" },
    { key: "nextPorts", cell: "B7" },
    { key: "dischargePorts", cell: "B8" },
    { key: "remainingCargo", cell: "B9" },
    { key: "draftForward", cell: "B10" },
    { key: "draftAft", cell: "B11" },
    { key: "airDraft", cell: "B12" },
    { key: "remarks", cell: "B13" },
    { key: "qtyCargoDecl", cell: "B14" },
    { key: "qtyStoresDecl", cell: "B15" },
    { key: "qtyCrewList", cell: "B16" },
    { key: "qtyPassengerList", cell: "B17" },
    { key: "qtyCrewEffects", cell: "B18" },
    { key: "qtyHealthDecl", cell: "B19" },
    { key: "wasteRequest", cell: "B20" },
    { key: "berthPosition", cell: "B21" },
    { key: "tugboat", cell: "B22" },
    { key: "portClearanceNo", cell: "B23" },
    { key: "arrivalDeparture", cell: "B24" },
    { key: "berthingTime", cell: "B25" },
    { key: "pilotOnBoard", cell: "B26" },
    { key: "clearanceLink", cell: "B27" },
    { key: "clearanceQr", cell: "B28" },
    { key: "fuelDO", cell: "B29" },
    { key: "fuelFO", cell: "B30" },
    { key: "freshWater", cell: "B31" },
    { key: "signPlace", cell: "B32" },
    { key: "signDate", cell: "B33" },
    { key: "signedBy", cell: "B34" },
  ],
  tables: [
    { key: "waste", startRow: 38, templateEndRow: 43, maxRows: 6, columns: WASTE_COLUMNS },
    { key: "cargo", startRow: 46, templateEndRow: 47, columns: VOYAGE_CARGO_COLUMNS },
  ],
};

const GOODS_DECLARATION_MAPPING: SheetMapping = {
  sheetName: "Goods Declaration",
  id: "goods-declaration",
  section: "goods",
  clearRanges: ["B3:B7", "A10:W14"],
  keepFormulaCells: ["C5", "C7"],
  header: [
    { key: "function", cell: "B5" },
    { key: "totalPackages", cell: "B6" },
    { key: "packageKind", cell: "B7" },
  ],
  tables: [
    {
      key: "bl",
      startRow: 10,
      templateEndRow: 14,
      columns: [
        { key: "blNumber", col: "A" },
        { key: "shipper", col: "B" },
        { key: "consignee", col: "C" },
        { key: "notifyParty", col: "D" },
        { key: "notifyParty2", col: "E" },
        { key: "containerNo", col: "F" },
        { key: "sealNo", col: "G" },
        { key: "hsCode", col: "H" },
        { key: "description", col: "I" },
        { key: "netWeight", col: "J" },
        { key: "grossWeight", col: "K" },
        { key: "measurement", col: "L" },
        { key: "manifestRef", col: "M" },
        { key: "adjustmentBasis", col: "N" },
        { key: "weightUnit", col: "O" },
        { key: "dischargePort", col: "P" },
        { key: "destinationPort", col: "Q" },
        { key: "loadingPort", col: "R" },
        { key: "originalLoadingPort", col: "S" },
        { key: "transhipmentPort", col: "T" },
        { key: "finalDestination", col: "U" },
        { key: "containerType", col: "V" },
        { key: "measurementUnit", col: "W" },
      ],
    },
  ],
};

const HOUSE_BL_MAPPING: SheetMapping = {
  sheetName: "List of House bill of lading",
  id: "house-bl",
  section: "hbl",
  clearRanges: ["A4:C4", "E4:X4", "A7:G30"],
  keepFormulaCells: ["D5", "U5"],
  repeatBlock: { blockHeaderRow: 3, dataRow: 4, formulaRow: 5, subHeaderRow: 6, subStartRow: 7 },
  header: [
    { key: "seq", cell: "A4" },
    { key: "function", cell: "D4" },
    { key: "shipper", cell: "E4" },
    { key: "consignee", cell: "F4" },
    { key: "notifyParty", cell: "G4" },
    { key: "notifyParty2", cell: "H4" },
    { key: "transhipmentPort", cell: "I4" },
    { key: "finalDestination", cell: "J4" },
    { key: "loadingPort", cell: "K4" },
    { key: "dischargePort", cell: "L4" },
    { key: "placeOfDelivery", cell: "M4" },
    { key: "cargoType", cell: "N4" },
    { key: "hblNumber", cell: "O4" },
    { key: "hblDate", cell: "P4" },
    { key: "masterBlNumber", cell: "Q4" },
    { key: "masterBlDate", cell: "R4" },
    { key: "departureDate", cell: "S4" },
    { key: "packages", cell: "T4" },
    { key: "packageKind", cell: "U4" },
    { key: "grossWeight", cell: "V4" },
    { key: "grossWeightUnit", cell: "W4" },
    { key: "remark", cell: "X4" },
  ],
  tables: [
    {
      key: "lines",
      startRow: 7,
      templateEndRow: 7,
      columns: [
        { key: "hsCode", col: "B" },
        { key: "description", col: "C" },
        { key: "grossWeight", col: "D" },
        { key: "measurement", col: "E" },
        { key: "containerNo", col: "F" },
        { key: "sealNo", col: "G" },
      ],
    },
  ],
};

const SHIP_STORE_MAPPING: SheetMapping = {
  sheetName: "Ship's store declaration",
  id: "ship-store",
  section: "store",
  clearRanges: ["B3:B10", "A13:E85"],
  keepFormulaCells: ["C5"],
  header: [
    { key: "function", cell: "B5" },
    { key: "personsOnBoard", cell: "B6" },
    { key: "periodOfStay", cell: "B7" },
    { key: "signPlace", cell: "B8" },
    { key: "signDate", cell: "B9" },
    { key: "signedBy", cell: "B10" },
  ],
  tables: [
    {
      key: "items",
      startRow: 13,
      templateEndRow: 85,
      columns: [
        { key: "name", col: "A" },
        { key: "quantity", col: "B" },
        { key: "unit", col: "C" },
        { key: "location", col: "D" },
        { key: "inUse", col: "E" },
      ],
    },
  ],
};

const SHIP_SECURITY_MAPPING: SheetMapping = {
  sheetName: "Declaration For Ship Security",
  id: "ship-security",
  section: "security",
  // C25:D34 hiện là công thức TEXT(C36...) trỏ vào vùng ngày mẫu C36:D45 -> xóa cả hai, ghi giá trị thật
  clearRanges: ["B3:B22", "A25:E34", "C36:D45"],
  keepFormulaCells: ["C5", "C6", "C12"],
  header: [
    { key: "function", cell: "B5" },
    { key: "purposeCode", cell: "B6" },
    { key: "purposeDetail", cell: "B7" },
    { key: "hasIssc", cell: "B8" },
    { key: "isscIssuer", cell: "B9" },
    { key: "isscIssueDate", cell: "B10" },
    { key: "isscExpiryDate", cell: "B11" },
    { key: "securityLevel", cell: "B12" },
    { key: "additionalMeasures", cell: "B13" },
    { key: "additionalDetails", cell: "B14" },
    { key: "maintainSecurity", cell: "B15" },
    { key: "maintainDetails", cell: "B16" },
    { key: "latitude", cell: "B17" },
    { key: "longitude", cell: "B18" },
    { key: "eta", cell: "B19" },
    { key: "signPlace", cell: "B20" },
    { key: "signDate", cell: "B21" },
    { key: "signedBy", cell: "B22" },
  ],
  tables: [
    {
      key: "portCalls",
      startRow: 25,
      templateEndRow: 34,
      maxRows: 10,
      columns: [
        { key: "portCode", col: "A" },
        { key: "portName", col: "B" },
        { key: "arrivalDate", col: "C" },
        { key: "departureDate", col: "D" },
        { key: "securityLevel", col: "E" },
      ],
    },
  ],
};

/** Các sheet được điền và hiển thị trên giao diện (theo yêu cầu người dùng). */
export const SHEET_MAPPINGS: SheetMapping[] = [CREW_LIST_MAPPING, GENERAL_DECLARATION_MAPPING, SHIP_SECURITY_MAPPING];

/**
 * Sheet không hiển thị trên giao diện nhưng vẫn ghi khi xuất Excel:
 * Notice ship to port dùng CHUNG bộ dữ liệu với General Declaration.
 */
export const EXTRA_WRITE_MAPPINGS: SheetMapping[] = [NOTICE_MAPPING];

/** Tất cả sheet được ghi khi xuất Excel. */
export const WRITE_MAPPINGS: SheetMapping[] = [...SHEET_MAPPINGS, ...EXTRA_WRITE_MAPPINGS];

/**
 * Các sheet KHÔNG cần điền (theo yêu cầu người dùng): giữ nguyên như template, không ghi, không xóa.
 * Muốn điền lại House B/L thì đưa HOUSE_BL_MAPPING trở lại SHEET_MAPPINGS.
 */
export const NOT_FILLED_SHEETS = [
  "List of House bill of lading",
  "Crew's Effects Declaration",
  "Passenger list",
  "Dangerous goods manifest",
  "Declaration For Animal",
  "Declaration For Plant",
  "Empty Container",
  "Arms And Explosive Materials",
  "Declaration of Stowaway",
  "Add User",
] as const;

/** Mapping House B/L giữ lại để dùng sau (hiện không điền). */
export const UNUSED_MAPPINGS: SheetMapping[] = [HOUSE_BL_MAPPING, GOODS_DECLARATION_MAPPING, SHIP_STORE_MAPPING];

/** Toàn bộ sheet của template thật (đúng chuỗi, phân biệt hoa thường). */
export const TEMPLATE_SHEET_NAMES = [
  "Declaration list",
  "Notice ship to port",
  "ConfirmationOfArrival",
  "Goods Declaration",
  "List of House bill of lading",
  "General Declaration",
  "Crew list",
  "Crew's Effects Declaration",
  "Ship's store declaration",
  "Cargo manifest",
  "Passenger list",
  "Dangerous goods manifest",
  "Declaration For Ship Security",
  "Declaration For Plant",
  "Declaration For Animal",
  "Declaration For Health",
  "Empty Container",
  "Arms And Explosive Materials",
  "Declaration of Stowaway",
  "Add User",
  "InlandAttachmentList",
] as const;

export const CODE_SHEET_NAME = "Declaration list";

export function getSheetMapping(sheetName: string): SheetMapping | undefined {
  return SHEET_MAPPINGS.find((m) => m.sheetName === sheetName);
}

export function getSheetMappingById(id: string): SheetMapping | undefined {
  return SHEET_MAPPINGS.find((m) => m.id === id);
}

export function findFieldDef(section: SectionKey, key: string): FieldDef | undefined {
  return SECTIONS[section].header.find((f) => f.key === key);
}

export function findColumnDef(section: SectionKey, tableKey: string, key: string): FieldDef | undefined {
  const table = SECTIONS[section].tables.find((t) => t.key === tableKey);
  return table?.columns.find((c) => c.key === key);
}

/** Danh sách trường bắt buộc còn trống (dùng để hỏi xác nhận khi tải Excel). */
export function listMissingRequired(sheets: import("@/lib/types").SheetsData): string[] {
  const missing: string[] = [];
  for (const mapping of SHEET_MAPPINGS) {
    const section = sheets[mapping.section];
    const def = SECTIONS[mapping.section];
    const hasAnyData =
      Object.values(section.header).some((f) => f.value && f.value.trim() !== "" && f.value !== DEFAULT_FUNCTION_CODE) ||
      Object.values(section.tables).some((rows) => rows.length > 0);
    if (!hasAnyData) continue;
    for (const binding of mapping.header) {
      const field = def.header.find((f) => f.key === binding.key);
      if (field?.required && !(section.header[binding.key]?.value ?? "").trim()) {
        missing.push(`${mapping.sheetName} › ${field.label} (${binding.cell})`);
      }
    }
    for (const tb of mapping.tables) {
      const tdef = def.tables.find((t) => t.key === tb.key);
      const rows = section.tables[tb.key] ?? [];
      rows.forEach((row, idx) => {
        for (const col of tdef?.columns ?? []) {
          if (col.required && !col.derivedFrom && !(row.cells[col.key]?.value ?? "").trim()) {
            missing.push(`${mapping.sheetName} › dòng ${idx + 1} › ${col.label}`);
          }
        }
      });
    }
  }
  return missing;
}
