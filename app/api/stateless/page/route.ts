/**
 * Chế độ stateless (Vercel): AI đọc MỘT trang.
 *  - step "classify": phân loại (tự xoay ảnh nếu chữ bị xoay rồi phân loại lại)
 *  - step "extract": trích dữ liệu theo loại chứng từ + xác minh bằng code
 * Tách 2 bước để mỗi lần gọi ngắn, không vượt giới hạn thời gian của Vercel.
 */

import sharp from "sharp";
import type { DocType, PageKind } from "@/lib/types";
import { DOC_TYPES } from "@/lib/types";
import { classifyInstance } from "@/lib/extraction/classify";
import { extractInstance } from "@/lib/extraction/extract";
import { getLlmConfig, missingKeyMessage } from "@/lib/extraction/llm";
import { errorMessage, jsonError } from "@/lib/api";

export const maxDuration = 300;

interface Body {
  step: "classify" | "extract";
  fileId: string;
  fileName: string;
  page: number;
  kind: PageKind;
  text: string;
  imageBase64?: string;
  docType?: DocType;
}

async function rotateJpeg(base64: string, degrees: number): Promise<string> {
  const out = await sharp(Buffer.from(base64, "base64"), { failOn: "none" }).rotate(degrees, { background: "#ffffff" }).jpeg({ quality: 88 }).toBuffer();
  return out.toString("base64");
}

export async function POST(request: Request): Promise<Response> {
  if (!getLlmConfig().configured) return jsonError(missingKeyMessage(), 400);
  try {
    const body = (await request.json()) as Body;
    if (!body.fileId || typeof body.page !== "number") return jsonError("Thiếu thông tin trang");

    if (body.step === "classify") {
      let image = body.imageBase64;
      let cls = await classifyInstance({ kind: body.kind, text: body.text ?? "", imageBase64: image });
      let rotation = 0;
      if (image && cls.rotation !== 0) {
        rotation = cls.rotation;
        image = await rotateJpeg(image, cls.rotation);
        cls = await classifyInstance({ kind: body.kind, text: body.text ?? "", imageBase64: image });
      }
      return Response.json({ cls: { ...cls, rotation: 0 }, rotation, imageBase64: rotation ? image : undefined });
    }

    if (body.step === "extract") {
      if (!body.docType || !(DOC_TYPES as readonly string[]).includes(body.docType)) return jsonError("Thiếu loại chứng từ");
      const instance = await extractInstance({
        fileId: body.fileId,
        fileName: body.fileName,
        page: body.page,
        kind: body.kind,
        docType: body.docType,
        text: body.text ?? "",
        imageBase64: body.kind !== "text" ? body.imageBase64 : undefined,
      });
      return Response.json({ instance });
    }
    return jsonError("Bước không hợp lệ");
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}
