import type { DocSpec } from "./common";

export const crewListSpec: DocSpec = {
  docType: "crew_list",
  title: "Danh sách thuyền viên (Crew list)",
  instructions:
    "Trích toàn bộ thuyền viên theo đúng thứ tự trong bảng, không bỏ dòng nào. Họ tên chép nguyên văn như trên chứng từ (không tách họ/tên, không dịch). " +
    "Chức danh chép nguyên văn ký hiệu (vd. CAPT, C/O, 2/E...). Quốc tịch chép nguyên văn. Ngày giữ nguyên định dạng gốc. " +
    "Nếu ô ngày sinh và nơi sinh gộp chung thì tách thành dateOfBirth và placeOfBirth. signerRole chỉ là 'master' | 'agent' | 'owner' | null, suy ra từ dòng ký (Master / Agent / Owner).",
  header: [
    { key: "vesselName", description: "Tên tàu" },
    { key: "imoNo", description: "Số IMO" },
    { key: "callSign", description: "Hô hiệu" },
    { key: "flag", description: "Quốc tịch tàu" },
    { key: "arrivalOrDeparture", description: "'arrival' nếu đánh dấu Đến/Arrival, 'departure' nếu Rời/Departure, null nếu không rõ" },
    { key: "port", description: "Cảng đến/rời (Port of arrival/departure)" },
    { key: "date", description: "Ngày đến/rời (Date of arrival/departure)" },
    { key: "voyageNo", description: "Số chuyến đi (Voyage number)" },
    { key: "lastPort", description: "Cảng rời cuối cùng / cảng trước (Last port of call), nếu có" },
    { key: "nextPort", description: "Cảng tiếp theo (Next port of call), nếu có" },
    { key: "totalCrew", description: "Tổng số thuyền viên ghi trên chứng từ (vd. 'Total 11 crew'), nếu có" },
    { key: "signPlace", description: "Nơi ký" },
    { key: "signDate", description: "Ngày ký" },
    { key: "signerRole", description: "'master' | 'agent' | 'owner' | null" },
    {
      key: "idDocumentType",
      description: "Loại giấy tờ ở tiêu đề cột số giấy tờ: 'passport' nếu ghi Passport/Hộ chiếu, 'seaman_book' nếu ghi Seaman book/Sổ thuyền viên/Seafarer's ID, null nếu không rõ",
    },
  ],
  tables: [
    {
      key: "crew",
      description: "Danh sách thuyền viên",
      columns: [
        { key: "no", description: "Số thứ tự" },
        { key: "fullName", description: "Họ và tên đầy đủ, nguyên văn" },
        { key: "rank", description: "Chức danh, nguyên văn ký hiệu" },
        { key: "nationality", description: "Quốc tịch, nguyên văn" },
        { key: "dateOfBirth", description: "Ngày sinh, nguyên văn" },
        { key: "placeOfBirth", description: "Nơi sinh, nguyên văn" },
        { key: "passportNo", description: "Số hộ chiếu/sổ thuyền viên, chép đúng từng ký tự" },
        { key: "passportExpiry", description: "Ngày hết hạn hộ chiếu, nguyên văn" },
        { key: "gender", description: "Giới tính nếu chứng từ có ghi (M/F/Nam/Nữ), không có thì null" },
      ],
    },
  ],
};
