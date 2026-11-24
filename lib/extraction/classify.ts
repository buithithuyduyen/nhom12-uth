/**
 * Bước A – phân loại một DocumentInstance (text hoặc ảnh).
 * Trả { docType, mode, port, date, voyageNo, rotation, confidence }.
 * rotation: số độ cần xoay ảnh THEO CHIỀU KIM ĐỒNG HỒ để chữ đứng thẳng (0/90/180/270).
 */

import { callJson } from "./llm";
import { classifySchema, DOC_MODE, type ClassifyResult } from "./schemas";
import type { PageKind } from "@/lib/types";

const SYSTEM = `Bạn là bộ phân loại chứng từ hàng hải. Nhiệm vụ: xác định LOẠI chứng từ của MỘT trang/phần tài liệu.
Chỉ trả về MỘT đối tượng JSON, không giải thích.

Các giá trị docType hợp lệ:
- crew_list: Danh sách thuyền viên (Crew list)
- bill_of_lading: Vận đơn (Bill of Lading, B/L, House B/L)
- cargo_manifest: Bản lược khai hàng hóa / Cargo manifest / Cargo declaration liệt kê vận đơn
- notice_of_arrival: Thông báo tàu đến/rời, NOR (Notice of readiness), xác báo tàu đến/di chuyển, công văn xin neo/cập cầu
- ship_store: Bản khai dự trữ của tàu (Ship's stores declaration)
- crew_effects: Bản khai hành lý thuyền viên (Crew's effects declaration)
- port_clearance: Giấy phép rời cảng (Port clearance) của cảng trước
- voyage_memory: Voyage memory / bảng lịch sử các cảng đã ghé
- ship_particulars: Bản thông số tàu (Ship's particulars)
- registry_certificate: Giấy chứng nhận đăng ký tàu / giấy chứng nhận dung tích
- health_declaration: Khai báo y tế hàng hải / giấy chứng nhận vệ sinh / kiểm dịch
- security_certificate: Giấy chứng nhận / khai báo an ninh tàu (ISPS)
- other: chứng từ hàng hải khác (Statement of Facts, công văn, giấy kiểm dịch thực vật...)
- unknown: không đọc được / trang trắng / không phải chứng từ

Quy tắc:
- Chỉ dựa vào nội dung nhìn thấy. Không bịa.
- port: tên cảng chính của chứng từ (cảng đến/rời/làm thủ tục) chép nguyên văn, không có thì null.
- date: ngày chính của chứng từ (ngày đến/rời/ký) chép nguyên văn, không có thì null.
- voyageNo: số chuyến nếu có, nguyên văn, không có thì null.
- rotation: nếu là ẢNH, chữ trong ảnh đang bị xoay thì trả số độ cần xoay ảnh theo chiều kim đồng hồ để chữ đứng thẳng (0, 90, 180 hoặc 270). Văn bản text thì luôn 0.
- confidence: 0..1 mức chắc chắn về docType.
- title: tiêu đề chứng từ nguyên văn nếu có.

Cấu trúc JSON (ví dụ cấu trúc, không phải dữ liệu thật):
{"docType":"<một giá trị ở trên>","mode":"1-1|N-1","port":null,"date":null,"voyageNo":null,"rotation":0,"confidence":0.0,"title":null}`;

export interface ClassifyInput {
  kind: PageKind;
  text: string;
  imageBase64?: string;
}

export async function classifyInstance(input: ClassifyInput): Promise<ClassifyResult> {
  const textPart = input.text.replace(/^=== TRANG \d+ ===\n?/, "").trim();
  const parts: string[] = [];
  if (input.imageBase64 && textPart.length < 50) {
    parts.push("Đây là ẢNH một trang chứng từ (bản scan). Hãy phân loại và cho biết góc xoay nếu chữ bị xoay.");
  } else {
    parts.push("Nội dung text của trang/phần chứng từ (cột ngăn bởi ' | '):");
    parts.push("-----");
    parts.push(textPart.slice(0, 7000));
    parts.push("-----");
    if (input.imageBase64) parts.push("Kèm ảnh của trang để hiểu bố cục.");
  }
  const first = await callJson({ system: SYSTEM, userText: parts.join("\n"), imageBase64: input.imageBase64, maxTokens: 4000 });
  let parsed = classifySchema.safeParse(first.json);
  if (!parsed.success) {
    const retry = await callJson({
      system: SYSTEM,
      userText: parts.join("\n"),
      imageBase64: input.imageBase64,
      maxTokens: 4000,
      followUp: { assistant: first.raw, user: `JSON không hợp lệ: ${parsed.error.message}. Trả lại đúng cấu trúc yêu cầu.` },
    });
    parsed = classifySchema.safeParse(retry.json);
    if (!parsed.success) throw new Error(`Kết quả phân loại không hợp lệ: ${parsed.error.message}`);
  }
  const result = parsed.data;
  return { ...result, mode: DOC_MODE[result.docType], rotation: input.imageBase64 ? result.rotation : 0 };
}
