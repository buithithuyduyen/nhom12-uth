/**
 * Đọc PDF bằng pdfjs-dist: lấy chữ kèm tọa độ, dựng bảng giả, render PNG bằng @napi-rs/canvas.
 * Trang < 50 ký tự -> "scanned". Có ảnh lớn và ít chữ -> "mixed".
 */

import path from "path";
import { pathToFileURL } from "url";
import { createCanvas } from "@napi-rs/canvas";
import type { PageKind } from "@/lib/types";
import { getStorage, paths } from "@/lib/storage";
import type { DocumentInstance, ReadOptions, TextItemBox, UploadedFileInput } from "./types";
import { groupIntoLines, linesToText, pageHeader, type PositionedText } from "./layout";
import { enhanceForModel } from "./image";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfJs> | null = null;

async function getPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((mod) => {
      const workerPath = path.join(process.cwd(), "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
      mod.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
      return mod;
    });
  }
  return pdfjsPromise;
}

const TARGET_DPI = 150;
const MAX_EDGE = 8192;
const MIN_TEXT_CHARS = 50;

function chooseScale(widthPt: number, heightPt: number): number {
  let dpi = TARGET_DPI;
  const longPt = Math.max(widthPt, heightPt);
  if ((longPt / 72) * dpi > MAX_EDGE) dpi = Math.floor((MAX_EDGE * 72) / longPt);
  return dpi / 72;
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export async function readPdf(input: UploadedFileInput, options: ReadOptions = {}): Promise<DocumentInstance[]> {
  const pdfjs = await getPdfJs();
  const storage = getStorage();
  const nodeModules = path.join(process.cwd(), "node_modules", "pdfjs-dist").replace(/\\/g, "/");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(input.buffer),
    useSystemFonts: true,
    disableFontFace: true,
    standardFontDataUrl: `${nodeModules}/standard_fonts/`,
    cMapUrl: `${nodeModules}/cmaps/`,
    // Bộ giải mã ảnh JBIG2/JPEG2000 (bản scan thường dùng) + ICC màu – thiếu thì trang scan render ra gần như trắng
    wasmUrl: `${nodeModules}/wasm/`,
    iccUrl: `${nodeModules}/iccs/`,
    cMapPacked: true,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;

  const instances: DocumentInstance[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: chooseScale(page.view[2] - page.view[0], page.view[3] - page.view[1]) });

      // --- Text với tọa độ (đổi sang tọa độ ảnh)
      const content = await page.getTextContent();
      const positioned: PositionedText[] = [];
      for (const raw of content.items as unknown[]) {
        const item = raw as PdfTextItem;
        if (typeof item.str !== "string" || !item.transform) continue;
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        const fontH = Math.hypot(item.transform[2], item.transform[3]) * viewport.scale;
        const w = item.width * viewport.scale;
        positioned.push({ str: item.str, x, y: y - fontH, w, h: fontH || 10 });
      }
      const lines = groupIntoLines(positioned);
      const body = linesToText(lines);
      const charCount = body.replace(/[\s|]/g, "").length;

      // --- Ảnh trên trang?
      let imageOps = 0;
      try {
        const ops = await page.getOperatorList();
        const imgOps = new Set([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject]);
        for (const fn of ops.fnArray) if (imgOps.has(fn)) imageOps++;
      } catch {
        imageOps = 0;
      }
      let kind: PageKind = "text";
      if (charCount < MIN_TEXT_CHARS) kind = "scanned";
      else if (imageOps > 0 && charCount < 300) kind = "mixed";

      // --- Render PNG (lưu để UI xem; trang scan dùng gửi model)
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
      const png = canvas.toBuffer("image/png");
      await storage.saveFile(paths.pageImage(input.shipmentId, input.fileId, n), png);

      const text = `${pageHeader(n)}\n${body}`;
      await storage.saveFile(paths.pageText(input.shipmentId, input.fileId, n), text);
      const boxes: TextItemBox[] = positioned.filter((p) => p.str.trim()).map((p) => ({ str: p.str, x: Math.round(p.x), y: Math.round(p.y), w: Math.round(p.w), h: Math.round(p.h) }));
      await storage.saveFile(
        paths.pageItems(input.shipmentId, input.fileId, n),
        JSON.stringify({ width: canvas.width, height: canvas.height, items: boxes }),
      );

      instances.push({
        fileId: input.fileId,
        fileName: input.fileName,
        page: n,
        kind,
        text,
        sha256: input.sha256,
        rotation: 0,
        hasImage: true,
        hasHtml: false,
      });
      page.cleanup();
      options.onProgress?.(n, doc.numPages);
    }
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
  return instances;
}

/** Ảnh trang đã lưu -> base64 tăng tương phản, thu nhỏ cho model. */
export async function loadPageImageForModel(shipmentId: string, fileId: string, page: number, rotation: number): Promise<string> {
  const png = await getStorage().readFile(paths.pageImage(shipmentId, fileId, page));
  return enhanceForModel(png, rotation);
}
