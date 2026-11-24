import type { DocSpec } from "./common";

export const cargoManifestSpec: DocSpec = {
  docType: "cargo_manifest",
  title: "Bản lược khai hàng hóa (Cargo manifest)",
  instructions: "Mỗi vận đơn/lô hàng là một dòng. Giữ đúng thứ tự, không bỏ dòng. Chép số B/L, container, seal đúng từng ký tự.",
  header: [
    { key: "vesselName", description: "Tên tàu" },
    { key: "voyageNo", description: "Số chuyến" },
    { key: "loadingPort", description: "Cảng xếp hàng" },
    { key: "dischargePort", description: "Cảng dỡ hàng" },
    { key: "departureDate", description: "Ngày tàu rời cảng xếp" },
    { key: "totalPackages", description: "Tổng số kiện ghi trên bản khai" },
    { key: "totalGrossWeight", description: "Tổng trọng lượng ghi trên bản khai" },
  ],
  tables: [
    {
      key: "items",
      description: "Các dòng hàng/vận đơn",
      columns: [
        { key: "blNumber", description: "Số vận đơn" },
        { key: "shipper", description: "Người gửi hàng" },
        { key: "consignee", description: "Người nhận hàng" },
        { key: "notifyParty", description: "Người được thông báo" },
        { key: "containerNo", description: "Số container" },
        { key: "sealNo", description: "Số seal" },
        { key: "description", description: "Mô tả hàng hóa" },
        { key: "hsCode", description: "Mã HS" },
        { key: "packages", description: "Số kiện" },
        { key: "packageKind", description: "Loại kiện nguyên văn" },
        { key: "netWeight", description: "Trọng lượng tịnh" },
        { key: "grossWeight", description: "Tổng trọng lượng" },
        { key: "weightUnit", description: "Đơn vị trọng lượng nguyên văn" },
        { key: "measurement", description: "Thể tích" },
        { key: "loadingPort", description: "Cảng xếp" },
        { key: "dischargePort", description: "Cảng dỡ" },
        { key: "finalDestination", description: "Cảng đích" },
      ],
    },
  ],
};
