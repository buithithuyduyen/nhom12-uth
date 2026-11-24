/**
 * Chế độ chạy:
 *  - "local" (mặc định khi chạy trên máy): lưu chuyến tàu, file, ảnh trang vào ./data; đọc AI chạy nền trên server.
 *  - "stateless" (tự bật trên Vercel, hoặc đặt APP_MODE=stateless): server không lưu gì lâu dài;
 *    dữ liệu chuyến tàu nằm trong trình duyệt, mỗi bước (đọc file / AI đọc 1 trang / xuất Excel) là một lần gọi ngắn.
 */

export function isStateless(): boolean {
  return process.env.APP_MODE?.trim().toLowerCase() === "stateless" || !!process.env.VERCEL;
}

/** OCR trên máy (tesseract) – tắt ở chế độ stateless vì nặng và phải tải dữ liệu mỗi lần khởi động. */
export function isOcrEnabled(): boolean {
  if (process.env.DISABLE_OCR === "1") return false;
  return !isStateless();
}
