import { startExtraction } from "@/lib/pipeline";
import { getLlmConfig, missingKeyMessage } from "@/lib/extraction/llm";
import { errorMessage, isValidId, jsonError } from "@/lib/api";

/**
 * POST { shipmentId, fileId?, page?, force? }
 * Bắt đầu bóc tách nền (từng trang/phần). Tiến độ: polling GET /api/shipments/[id].
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { shipmentId?: string; fileId?: string; page?: number; force?: boolean };
    if (!body.shipmentId || !isValidId(body.shipmentId)) return jsonError("Thiếu mã chuyến tàu");
    if (!getLlmConfig().configured) return jsonError(missingKeyMessage(), 400);
    const shipment = await startExtraction(body.shipmentId, {
      fileId: body.fileId,
      page: typeof body.page === "number" ? body.page : undefined,
      force: !!body.force,
    });
    return Response.json({ shipment, extracting: true }, { status: 202 });
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}
