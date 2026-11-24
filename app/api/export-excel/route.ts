import type { SheetsData } from "@/lib/types";
import { createExport } from "@/lib/export";
import { getShipmentRepo, getStorage, paths } from "@/lib/storage";
import { contentDisposition, errorMessage, isValidId, jsonError } from "@/lib/api";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/**
 * POST { shipmentId?, voyageName, sheets } -> file .xlsx (attachment).
 * Tên: <tên chuyến>_NSW_<yyyyMMdd-HHmm>.xlsx; lưu bản sao vào ./data/exports.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { shipmentId?: string | null; voyageName?: string; sheets?: SheetsData };
    if (!body.sheets) return jsonError("Thiếu dữ liệu sheets");
    let templateId: string | null = null;
    let shipmentId: string | null = null;
    if (body.shipmentId) {
      if (!isValidId(body.shipmentId)) return jsonError("Mã chuyến tàu không hợp lệ");
      const s = await getShipmentRepo().get(body.shipmentId);
      if (!s) return jsonError("Không tìm thấy chuyến tàu", 404);
      templateId = s.templateId;
      shipmentId = s.id;
    }
    const { fileName, buffer, manifest } = await createExport({
      shipmentId,
      voyageName: body.voyageName || "ChuyenTau",
      sheets: body.sheets,
      templateId,
    });
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": contentDisposition(fileName),
        "X-Export-File": encodeURIComponent(fileName),
        "X-Export-Warnings": encodeURIComponent(JSON.stringify(manifest.warnings.slice(0, 20))),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}

/** GET ?file=<tên file> – tải lại file đã xuất trong ./data/exports. */
export async function GET(request: Request): Promise<Response> {
  const name = new URL(request.url).searchParams.get("file") ?? "";
  if (!/^[A-Za-z0-9._-]+\.xlsx$/.test(name)) return jsonError("Tên file không hợp lệ");
  try {
    const buffer = await getStorage().readFile(paths.exportFile(name));
    return new Response(new Uint8Array(buffer), {
      headers: { "Content-Type": XLSX_MIME, "Content-Disposition": contentDisposition(name), "Cache-Control": "no-store" },
    });
  } catch {
    return jsonError("Không tìm thấy file đã xuất", 404);
  }
}
