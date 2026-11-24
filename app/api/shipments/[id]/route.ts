import type { SheetsData, Shipment } from "@/lib/types";
import { getShipmentRepo, getStorage, mutateShipment, paths } from "@/lib/storage";
import { buildContext, isExtractionRunning } from "@/lib/pipeline";
import { crosscheck } from "@/lib/crosscheck";
import { errorMessage, isValidId, jsonError } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!isValidId(id)) return jsonError("Mã chuyến tàu không hợp lệ");
  const shipment = await getShipmentRepo().get(id);
  if (!shipment) return jsonError("Không tìm thấy chuyến tàu", 404);
  return Response.json({ shipment, extracting: isExtractionRunning(id) });
}

interface PutBody {
  voyageName?: string;
  sheets?: SheetsData;
  resolvedValues?: Record<string, string>;
  status?: Shipment["status"];
  templateId?: string;
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!isValidId(id)) return jsonError("Mã chuyến tàu không hợp lệ");
  try {
    const body = (await request.json()) as PutBody;
    const existing = await getShipmentRepo().get(id);
    if (!existing) return jsonError("Không tìm thấy chuyến tàu", 404);
    const ctx = await buildContext(existing.templateId);
    const updated = await mutateShipment(id, (s) => {
      const next: Shipment = { ...s };
      if (typeof body.voyageName === "string") next.voyageName = body.voyageName.trim().slice(0, 200) || s.voyageName;
      if (body.sheets) next.extractedData = { ...s.extractedData, sheets: body.sheets };
      if (body.resolvedValues) next.resolvedValues = body.resolvedValues;
      if (body.templateId && isValidId(body.templateId)) next.templateId = body.templateId;
      if (body.status) next.status = body.status;
      else if (body.sheets && (s.status === "extracted" || s.status === "draft") && s.extractedData.instances.length > 0) next.status = "reviewed";
      const result = crosscheck(next.extractedData.instances, next.files, next.extractedData.sheets, ctx, next.resolvedValues);
      next.discrepancies = result.discrepancies;
      return next;
    });
    return Response.json({ shipment: updated });
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!isValidId(id)) return jsonError("Mã chuyến tàu không hợp lệ");
  if (isExtractionRunning(id)) return jsonError("Chuyến tàu đang được bóc tách, hãy đợi xong rồi xóa", 409);
  try {
    const repo = getShipmentRepo();
    const shipment = await repo.get(id);
    if (!shipment) return jsonError("Không tìm thấy chuyến tàu", 404);
    const storage = getStorage();
    await storage.deleteDir(paths.uploadsDir(id));
    await storage.deleteDir(paths.pagesDir(id));
    for (const e of shipment.exports) {
      await storage.deleteFile(paths.exportFile(e.fileName));
      await storage.deleteFile(paths.exportManifest(e.fileName));
    }
    await repo.delete(id);
    return Response.json({ ok: true });
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}
