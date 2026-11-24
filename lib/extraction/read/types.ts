import type { PageKind } from "@/lib/types";

/** Một "chứng từ con" sau khi tách: một trang PDF / một ảnh / một phần DOCX. */
export interface DocumentInstance {
  fileId: string;
  fileName: string;
  page: number;
  kind: PageKind;
  /** Text cơ học (bảng giả ngăn cột " | "), bắt đầu bằng "=== TRANG n ===" */
  text: string;
  /** Ảnh trang (PNG base64) – chỉ nạp khi cần gửi model */
  imageBase64?: string;
  sha256: string;
  rotation: number;
  title?: string;
  hasImage: boolean;
  hasHtml: boolean;
}

/** Vị trí một đoạn text trên ảnh trang (pixel) – để highlight sourceText. */
export interface TextItemBox {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface UploadedFileInput {
  shipmentId: string;
  fileId: string;
  fileName: string;
  ext: string;
  buffer: Buffer;
  sha256: string;
}

export interface ReadOptions {
  /** Gọi sau mỗi trang để cập nhật tiến độ */
  onProgress?: (done: number, total: number) => void;
}
