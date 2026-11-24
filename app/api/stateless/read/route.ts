/**
 * Chế độ stateless (Vercel): đọc MỘT file -> tách trang/phần, trả về chữ + ảnh trang scan cho trình duyệt giữ.
 * Không lưu gì lâu dài trên server (file tạm trong /tmp được xóa ngay).
 */

import crypto from "crypto";
import type { FileRecord, PageInfo } from "@/lib/types";
import { getStorage, paths } from "@/lib/storage";
import { isSupportedExtension, readDocument } from "@/lib/extraction/read";
import { loadPageImageForModel } from "@/lib/extraction/read/pdf";
import { errorMessage, jsonError } from "@/lib/api";

export const maxDuration = 120;

/** Vercel giới hạn mỗi lần gửi lên khoảng 4,5 MB. */
const MAX_BYTES = 4.4 * 1024 * 1024;

export interface StatelessPageAsset {
  page: number;
  text: string;
  /** JPEG base64 (chỉ trang scan / trộn ảnh) */
  image?: string;
}

export async function POST(request: Request): Promise<Response> {
  const tmpId = `tmp-${crypto.randomUUID()}`;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return jsonError("Chưa chọn file");
    const ext = (file.name.split(".").pop() ?? "").toLowerCase();
    if (!isSupportedExtension(ext)) return jsonError("Chỉ nhận PDF, DOCX, PNG, JPG");
    if (file.size > MAX_BYTES) return jsonError("File vượt quá 4,4 MB (giới hạn của Vercel) – hãy nén hoặc tách file");
    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const fileId = crypto.randomUUID();

    const instances = await readDocument({ shipmentId: tmpId, fileId, fileName: file.name, ext, buffer, sha256 });
    const assets: StatelessPageAsset[] = [];
    for (const inst of instances) {
      const asset: StatelessPageAsset = { page: inst.page, text: inst.text };
      if (inst.kind !== "text" && inst.hasImage) asset.image = await loadPageImageForModel(tmpId, fileId, inst.page, 0);
      assets.push(asset);
    }
    const record: FileRecord = {
      fileId,
      fileName: file.name,
      ext,
      size: buffer.length,
      sha256,
      uploadedAt: new Date().toISOString(),
      pages: instances.map(
        (i): PageInfo => ({
          page: i.page,
          kind: i.kind,
          title: i.title,
          docType: null,
          mode: null,
          port: null,
          date: null,
          voyageNo: null,
          rotation: 0,
          active: true,
          status: "pending",
          hasImage: i.hasImage,
          hasHtml: i.hasHtml,
        }),
      ),
    };
    return Response.json({ file: record, assets });
  } catch (err) {
    return jsonError(`Không đọc được file: ${errorMessage(err)}`, 500);
  } finally {
    await getStorage()
      .deleteDir(paths.pagesDir(tmpId))
      .catch(() => undefined);
  }
}
