/**
 * OCR chạy trên máy (tesseract.js, tiếng Anh + tiếng Việt) cho trang scan.
 * Kết quả chữ được gửi kèm ảnh cho AI: AI chép ký tự từ chữ OCR, dùng ảnh để hiểu bố cục,
 * và code đối chiếu lại giá trị AI trả về với chữ OCR (verify.ts).
 * Lần chạy đầu cần Internet để tải dữ liệu ngôn ngữ (lưu vào ./data/ocr-cache).
 */

import path from "path";
import sharp from "sharp";
import { createWorker, type Worker } from "tesseract.js";

const g = globalThis as typeof globalThis & { __marinedocOcr?: Promise<Worker> | null; __marinedocOcrQueue?: Promise<unknown> };

function getWorker(): Promise<Worker> {
  if (!g.__marinedocOcr) {
    g.__marinedocOcr = createWorker(["eng", "vie"], 1, { cachePath: path.join(process.cwd(), "data", "ocr-cache") }).catch((err) => {
      g.__marinedocOcr = null;
      throw err;
    });
  }
  return g.__marinedocOcr;
}

/** Nhận dạng chữ trong ảnh trang (PNG). Chạy tuần tự (một worker) để không chiếm hết CPU. */
export async function ocrImage(png: Buffer): Promise<{ text: string; confidence: number }> {
  const prepared = await sharp(png, { failOn: "none" })
    .resize({ width: 4600, height: 4600, fit: "inside", withoutEnlargement: false })
    .grayscale()
    .normalize()
    .png()
    .toBuffer();
  const run = async () => {
    const worker = await getWorker();
    const { data } = await worker.recognize(prepared);
    return { text: data.text.replace(/\n{3,}/g, "\n\n").trim(), confidence: data.confidence };
  };
  const prev = g.__marinedocOcrQueue ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(run);
  g.__marinedocOcrQueue = next;
  return next;
}
