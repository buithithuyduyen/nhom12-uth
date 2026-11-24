/**
 * Ảnh .png/.jpg: coi như một trang scanned. Dùng sharp để chuẩn hóa, xoay, tăng tương phản.
 */

import sharp from "sharp";
import { getStorage, paths } from "@/lib/storage";
import type { DocumentInstance, UploadedFileInput } from "./types";
import { pageHeader } from "./layout";

/** Cạnh dài tối đa khi gửi model (giữ đủ nét để đọc chữ, giảm token). */
const MODEL_MAX_EDGE = 2048;
const STORE_MAX_EDGE = 8192;

export async function readImage(input: UploadedFileInput): Promise<DocumentInstance[]> {
  const png = await sharp(input.buffer, { failOn: "none" })
    .rotate() // theo EXIF
    .resize({ width: STORE_MAX_EDGE, height: STORE_MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .png()
    .toBuffer();
  const storage = getStorage();
  await storage.saveFile(paths.pageImage(input.shipmentId, input.fileId, 1), png);
  const text = `${pageHeader(1)}\n`;
  await storage.saveFile(paths.pageText(input.shipmentId, input.fileId, 1), text);
  return [
    {
      fileId: input.fileId,
      fileName: input.fileName,
      page: 1,
      kind: "scanned",
      text,
      sha256: input.sha256,
      rotation: 0,
      hasImage: true,
      hasHtml: false,
    },
  ];
}

/** Xoay (theo góc đã phát hiện), thu nhỏ, tăng tương phản nhẹ -> base64 PNG. */
export async function enhanceForModel(png: Buffer, rotation: number): Promise<string> {
  let pipeline = sharp(png, { failOn: "none" });
  if (rotation % 360 !== 0) pipeline = pipeline.rotate(rotation, { background: "#ffffff" });
  const out = await pipeline
    .resize({ width: MODEL_MAX_EDGE, height: MODEL_MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .grayscale()
    .linear(1.15, -12)
    .sharpen()
    .jpeg({ quality: 88 })
    .toBuffer();
  return out.toString("base64");
}

/** Xoay ảnh trang đã lưu (để UI hiển thị đúng chiều) – xoay tuyệt đối từ ảnh gốc. */
export async function rotateStoredPage(shipmentId: string, fileId: string, page: number, degrees: number): Promise<void> {
  if (degrees % 360 === 0) return;
  const storage = getStorage();
  const p = paths.pageImage(shipmentId, fileId, page);
  const png = await storage.readFile(p);
  const rotated = await sharp(png, { failOn: "none" }).rotate(degrees, { background: "#ffffff" }).png().toBuffer();
  await storage.saveFile(p, rotated);
  // Tọa độ text không còn khớp sau khi xoay
  await storage.deleteFile(paths.pageItems(shipmentId, fileId, page));
}
