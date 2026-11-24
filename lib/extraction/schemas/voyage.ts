/**
 * Các loại chứng từ cơ chế N-1 (gom vào Notice ship to port + General Declaration).
 * Mỗi loại có schema riêng chọn từ tập trường chuyến đi chung.
 */

import type { DocSpec, FieldSpec, TableSpec } from "./common";

const F: Record<string, FieldSpec> = {
  vesselName: { key: "vesselName", description: "Tên tàu" },
  imoNo: { key: "imoNo", description: "Số IMO" },
  callSign: { key: "callSign", description: "Hô hiệu" },
  flag: { key: "flag", description: "Quốc tịch tàu" },
  voyageNo: { key: "voyageNo", description: "Số chuyến đi" },
  port: { key: "port", description: "Cảng chính mà chứng từ nói tới (cảng đến/cảng làm thủ tục)" },
  lastPort: { key: "lastPort", description: "Cảng trước / cảng rời cuối cùng (last port of call)" },
  nextPort: { key: "nextPort", description: "Cảng sẽ đến tiếp theo (next port)" },
  dischargePort: { key: "dischargePort", description: "Cảng sẽ dỡ hàng" },
  remainingCargo: { key: "remainingCargo", description: "Hàng còn lại trên tàu / số hàng còn lại" },
  arrivalTime: { key: "arrivalTime", description: "Thời gian tàu đến (ngày + giờ nguyên văn)" },
  departureTime: { key: "departureTime", description: "Thời gian tàu rời (ngày + giờ nguyên văn)" },
  berthingTime: { key: "berthingTime", description: "Thời gian cập cầu/cập cảng (all fast)" },
  anchorTime: { key: "anchorTime", description: "Thời gian thả neo" },
  pilotOnBoardTime: { key: "pilotOnBoardTime", description: "Thời gian hoa tiêu lên tàu (POB)" },
  norTenderedTime: { key: "norTenderedTime", description: "Thời gian trao NOR" },
  draftForward: { key: "draftForward", description: "Mớn nước mũi (F), số mét" },
  draftAft: { key: "draftAft", description: "Mớn nước lái (A), số mét" },
  airDraft: { key: "airDraft", description: "Chiều cao tĩnh không (air draft), số mét" },
  fuelDO: { key: "fuelDO", description: "Lượng dầu DO/MGO trên tàu" },
  fuelFO: { key: "fuelFO", description: "Lượng dầu FO trên tàu" },
  freshWater: { key: "freshWater", description: "Lượng nước ngọt FW trên tàu" },
  berthPosition: { key: "berthPosition", description: "Vị trí tàu tại cảng (cầu/khu neo)" },
  tugboat: { key: "tugboat", description: "Tàu lai" },
  portClearanceNo: { key: "portClearanceNo", description: "Số giấy phép rời cảng" },
  cargoDescription: { key: "cargoDescription", description: "Tên/mô tả hàng hóa trên tàu" },
  cargoQuantity: { key: "cargoQuantity", description: "Khối lượng hàng" },
  cargoUnit: { key: "cargoUnit", description: "Đơn vị khối lượng hàng nguyên văn" },
  crewCount: { key: "crewCount", description: "Số thuyền viên" },
  passengerCount: { key: "passengerCount", description: "Số hành khách" },
  remarks: { key: "remarks", description: "Ghi chú quan trọng" },
  wasteRequest: { key: "wasteRequest", description: "Yêu cầu tiếp nhận chất thải" },
  signPlace: { key: "signPlace", description: "Nơi ký" },
  signDate: { key: "signDate", description: "Ngày ký" },
  signerRole: { key: "signerRole", description: "'master' | 'agent' | 'owner' | null, suy ra từ người ký" },
  issuedBy: { key: "issuedBy", description: "Cơ quan/người cấp chứng từ" },
  purposeOfCall: { key: "purposeOfCall", description: "Mục đích tàu đến cảng (dỡ hàng, xếp hàng, neo chờ, sửa chữa...), nguyên văn" },
  latitude: { key: "latitude", description: "Vĩ độ vị trí tàu, nguyên văn (vd. 10°20.5'N)" },
  longitude: { key: "longitude", description: "Kinh độ vị trí tàu, nguyên văn (vd. 107°05.2'E)" },
  securityLevel: { key: "securityLevel", description: "Cấp độ an ninh của tàu (1, 2 hoặc 3) nếu chứng từ ghi" },
  certificateNo: { key: "certificateNo", description: "Số giấy chứng nhận" },
  issueDate: { key: "issueDate", description: "Ngày cấp giấy chứng nhận" },
  expiryDate: { key: "expiryDate", description: "Ngày hết hạn giấy chứng nhận (valid until)" },
};

const pick = (...keys: string[]): FieldSpec[] => keys.map((k) => F[k]);

const cargoTable: TableSpec = {
  key: "cargo",
  description: "Các lô hàng/loại hàng nếu chứng từ liệt kê",
  columns: [
    { key: "description", description: "Tên/mô tả hàng" },
    { key: "quantity", description: "Khối lượng/số lượng" },
    { key: "unit", description: "Đơn vị nguyên văn" },
    { key: "port", description: "Cảng xếp/dỡ liên quan, nếu có" },
  ],
};

export const noticeOfArrivalSpec: DocSpec = {
  docType: "notice_of_arrival",
  title: "Thông báo tàu đến / NOR / công văn xin neo / xác báo",
  instructions: "Đây là chứng từ về việc tàu đến/rời cảng (NOR, xác báo, công văn xin neo, thông báo tàu đến...). Ngày giờ giữ nguyên văn.",
  header: pick(
    "vesselName", "imoNo", "callSign", "flag", "voyageNo", "port", "lastPort", "nextPort", "dischargePort", "remainingCargo",
    "arrivalTime", "departureTime", "berthingTime", "anchorTime", "pilotOnBoardTime", "norTenderedTime",
    "draftForward", "draftAft", "airDraft", "fuelDO", "fuelFO", "freshWater", "berthPosition", "tugboat",
    "cargoDescription", "cargoQuantity", "cargoUnit", "crewCount", "passengerCount", "remarks", "wasteRequest",
    "purposeOfCall", "latitude", "longitude", "securityLevel",
    "signPlace", "signDate", "signerRole",
  ),
  tables: [cargoTable],
};

export const portClearanceSpec: DocSpec = {
  docType: "port_clearance",
  title: "Giấy phép rời cảng (Port clearance)",
  instructions: "Giấy phép rời cảng của cảng trước. 'port' là cảng cấp giấy phép (cảng tàu rời), 'nextPort' là cảng đến tiếp theo. Chép số giấy phép đúng từng ký tự.",
  header: pick(
    "vesselName", "imoNo", "callSign", "flag", "voyageNo", "port", "nextPort", "departureTime", "portClearanceNo",
    "draftForward", "draftAft", "cargoDescription", "cargoQuantity", "cargoUnit", "crewCount", "passengerCount", "issuedBy", "signDate",
  ),
  tables: [],
};

export const voyageMemorySpec: DocSpec = {
  docType: "voyage_memory",
  title: "Voyage memory (lịch sử các cảng đã ghé)",
  instructions: "Trích bảng các cảng đã ghé theo đúng thứ tự, mỗi dòng một cảng. Ngày giữ nguyên văn, kể cả khi trông có vẻ sai năm.",
  header: pick("vesselName", "imoNo", "callSign", "flag", "signDate"),
  tables: [
    {
      key: "portCalls",
      description: "Các cảng đã ghé",
      columns: [
        { key: "no", description: "Số thứ tự" },
        { key: "port", description: "Tên cảng nguyên văn" },
        { key: "arrivalDate", description: "Ngày đến" },
        { key: "departureDate", description: "Ngày rời" },
        { key: "cargo", description: "Tên hàng" },
      ],
    },
  ],
};

export const shipParticularsSpec: DocSpec = {
  docType: "ship_particulars",
  title: "Thông số tàu (Ship's particulars)",
  instructions: "Chỉ trích các trường liên quan tới khai báo cảng.",
  header: pick("vesselName", "imoNo", "callSign", "flag", "airDraft", "crewCount", "signPlace", "signDate"),
  tables: [],
};

export const registryCertificateSpec: DocSpec = {
  docType: "registry_certificate",
  title: "Giấy chứng nhận đăng ký tàu",
  instructions: "Chỉ trích thông tin nhận dạng tàu.",
  header: pick("vesselName", "imoNo", "callSign", "flag", "issuedBy", "signDate"),
  tables: [],
};

export const crewEffectsSpec: DocSpec = {
  docType: "crew_effects",
  title: "Bản khai hành lý thuyền viên",
  instructions: "Chỉ trích thông tin chung của chuyến (tàu, cảng, ngày, người ký, số thuyền viên).",
  header: pick("vesselName", "voyageNo", "port", "arrivalTime", "crewCount", "signPlace", "signDate", "signerRole"),
  tables: [],
};

export const healthDeclarationSpec: DocSpec = {
  docType: "health_declaration",
  title: "Bản khai kiểm dịch y tế (Maritime declaration of health)",
  instructions: "Chỉ trích thông tin chung của chuyến.",
  header: pick("vesselName", "voyageNo", "port", "lastPort", "nextPort", "arrivalTime", "crewCount", "passengerCount", "signPlace", "signDate", "signerRole"),
  tables: [],
};

export const securityCertificateSpec: DocSpec = {
  docType: "security_certificate",
  title: "Giấy chứng nhận quốc tế về an ninh tàu biển (ISSC) / khai báo an ninh tàu",
  instructions:
    "Với ISSC: trích số giấy, cơ quan cấp (issuedBy, vd. Cục Đăng kiểm Việt Nam / VIETNAM REGISTER), ngày cấp (issueDate) và ngày hết hạn (expiryDate) nguyên văn. Với khai báo an ninh: trích cấp độ an ninh, vị trí, ETA.",
  header: pick(
    "vesselName", "imoNo", "callSign", "flag", "certificateNo", "issuedBy", "issueDate", "expiryDate",
    "securityLevel", "port", "lastPort", "arrivalTime", "latitude", "longitude", "signDate",
  ),
  tables: [],
};

export const otherSpec: DocSpec = {
  docType: "other",
  title: "Chứng từ khác (SOF, công văn...)",
  instructions:
    "Chứng từ hàng hải khác (vd. Statement of Facts, công văn). Trích các mốc thời gian (đến, neo, hoa tiêu, cập cầu, rời), mớn nước, nhiên liệu, hàng hóa nếu có.",
  header: pick(
    "vesselName", "voyageNo", "port", "lastPort", "nextPort", "arrivalTime", "departureTime", "berthingTime", "anchorTime",
    "pilotOnBoardTime", "norTenderedTime", "draftForward", "draftAft", "fuelDO", "fuelFO", "freshWater", "berthPosition",
    "tugboat", "cargoDescription", "cargoQuantity", "cargoUnit", "remarks", "signPlace", "signDate", "signerRole",
  ),
  tables: [cargoTable],
};
