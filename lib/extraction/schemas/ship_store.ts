import type { DocSpec } from "./common";

export const shipStoreSpec: DocSpec = {
  docType: "ship_store",
  title: "Bản khai dự trữ của tàu (Ship's stores declaration)",
  instructions: "Trích mọi vật phẩm theo đúng thứ tự, không bỏ dòng. Số lượng giữ nguyên số gốc, đơn vị nguyên văn.",
  header: [
    { key: "vesselName", description: "Tên tàu" },
    { key: "port", description: "Cảng đến/rời" },
    { key: "date", description: "Ngày đến/rời" },
    { key: "voyageNo", description: "Số chuyến" },
    { key: "personsOnBoard", description: "Số người trên tàu" },
    { key: "periodOfStay", description: "Thời gian ở cảng (số ngày)" },
    { key: "signPlace", description: "Nơi ký" },
    { key: "signDate", description: "Ngày ký" },
    { key: "signerRole", description: "'master' | 'agent' | 'owner' | null" },
  ],
  tables: [
    {
      key: "items",
      description: "Vật phẩm dự trữ",
      columns: [
        { key: "name", description: "Tên vật phẩm" },
        { key: "quantity", description: "Số lượng" },
        { key: "unit", description: "Đơn vị nguyên văn" },
        { key: "location", description: "Vị trí trên tàu, nếu có" },
      ],
    },
  ],
};
