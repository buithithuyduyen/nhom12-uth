/**
 * readDocument(file) -> DocumentInstance[] (theo từng trang PDF / từng phần DOCX / một ảnh).
 */

import { getStorage, paths } from "@/lib/storage";
import type { DocumentInstance, ReadOptions, UploadedFileInput } from "./types";
import { readPdf } from "./pdf";
import { readDocx } from "./docx";
import { readImage } from "./image";

export const SUPPORTED_EXTENSIONS = ["pdf", "docx", "png", "jpg", "jpeg"] as const;

export function isSupportedExtension(ext: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext.toLowerCase());
}

export async function readDocument(input: UploadedFileInput, options: ReadOptions = {}): Promise<DocumentInstance[]> {
  const ext = input.ext.toLowerCase();
  if (ext === "pdf") return readPdf(input, options);
  if (ext === "docx") return readDocx(input);
  if (ext === "png" || ext === "jpg" || ext === "jpeg") return readImage(input);
  throw new Error(`Định dạng .${ext} chưa được hỗ trợ (chỉ nhận PDF, DOCX, PNG, JPG)`);
}

/** Đọc lại text cơ học đã lưu của một trang/phần. */
export async function loadPageText(shipmentId: string, fileId: string, page: number): Promise<string> {
  try {
    return (await getStorage().readFile(paths.pageText(shipmentId, fileId, page))).toString("utf-8");
  } catch {
    return "";
  }
}

export type { DocumentInstance } from "./types";
