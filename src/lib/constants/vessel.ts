import { VesselFileStatus } from "@/types/database";

export interface StatusMeta {
  label: string;
  variant: "draft" | "uploaded" | "extracted" | "confirmed" | "exported";
  stepNumber: number;
  description: string;
}

export const VESSEL_STATUS_MAP: Record<VesselFileStatus, StatusMeta> = {
  draft: {
    label: "Nháp",
    variant: "draft",
    stepNumber: 1,
    description: "Đã tạo thông tin hồ sơ tàu, chưa tải chứng từ",
  },
  documents_uploaded: {
    label: "Đã tải chứng từ",
    variant: "uploaded",
    stepNumber: 2,
    description: "Đã tải lên các file chứng từ cần thiết",
  },
  extracted: {
    label: "Đã trích xuất",
    variant: "extracted",
    stepNumber: 3,
    description: "AI đã trích xuất xong dữ liệu từ chứng từ",
  },
  confirmed: {
    label: "Đã xác nhận",
    variant: "confirmed",
    stepNumber: 4,
    description: "Đã đối chiếu và nhân viên xác nhận dữ liệu chính xác",
  },
  excel_exported: {
    label: "Đã xuất Excel",
    variant: "exported",
    stepNumber: 5,
    description: "Đã xuất thành công file Excel mẫu khai báo",
  },
};

export const VIETNAM_SEAPORTS = [
  "Cảng Hải Phòng",
  "Cảng Cái Mép - Thị Vải (Bà Rịa - Vũng Tàu)",
  "Cảng TP. Hồ Chí Minh (Cát Lái / Hiệp Phước)",
  "Cảng Đà Nẵng (Tiên Sa)",
  "Cảng Quy Nhơn (Bình Định)",
  "Cảng Nghi Sơn (Thanh Hóa)",
  "Cảng Dung Quất (Quảng Ngãi)",
  "Cảng Quảng Ninh (Cái Lân)",
  "Cảng Vũng Tàu",
  "Cảng Cần Thơ",
  "Cảng Cam Ranh (Khánh Hòa)",
  "Cảng Chân Mây (Thừa Thiên Huế)",
  "Cảng Vũng Áng (Hà Tĩnh)",
];

/**
 * Kiểm tra tính hợp lệ của số IMO: đúng 7 chữ số.
 */
export function validateImoNumber(imo: string): { isValid: boolean; error?: string } {
  const trimmed = imo.trim();
  if (!trimmed) {
    return { isValid: false, error: "Vui lòng nhập số IMO" };
  }
  if (!/^[0-9]{7}$/.test(trimmed)) {
    return {
      isValid: false,
      error: "Số IMO bắt buộc phải có đúng 7 chữ số (ví dụ: 9321483)",
    };
  }
  return { isValid: true };
}
