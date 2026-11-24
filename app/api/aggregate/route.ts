import { reaggregate, removeFile, setPageActive } from "@/lib/pipeline";
import { errorMessage, isValidId, jsonError } from "@/lib/api";

/**
 * POST { shipmentId, toggle?: {fileId, page, active}, removeFileId? }
 * Bật/tắt trang, xóa file, hoặc tổng hợp lại N-1 + đối chiếu (giữ các ô người dùng đã sửa).
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      shipmentId?: string;
      toggle?: { fileId: string; page: number; active: boolean };
      removeFileId?: string;
    };
    if (!body.shipmentId || !isValidId(body.shipmentId)) return jsonError("Thiếu mã chuyến tàu");
    let shipment;
    if (body.toggle) {
      shipment = await setPageActive(body.shipmentId, body.toggle.fileId, body.toggle.page, !!body.toggle.active);
    } else if (body.removeFileId) {
      shipment = await removeFile(body.shipmentId, body.removeFileId);
    } else {
      shipment = await reaggregate(body.shipmentId);
    }
    return Response.json({ shipment });
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}
