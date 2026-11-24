import { addFiles, createShipment, MAX_FILE_BYTES, type IncomingFile } from "@/lib/pipeline";
import { getShipmentRepo } from "@/lib/storage";
import { errorMessage, isValidId, jsonError } from "@/lib/api";

export const maxDuration = 300;

/**
 * POST multipart/form-data: shipmentId? (tạo mới nếu thiếu), voyageName?, files (nhiều file).
 * Lưu file, tách trang/phần, phát hiện trùng SHA-256. Chưa gọi AI.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const form = await request.formData();
    let shipmentId = String(form.get("shipmentId") ?? "").trim();
    const files = form.getAll("files").filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
    if (files.length === 0) return jsonError("Chưa chọn file nào");

    if (shipmentId) {
      if (!isValidId(shipmentId)) return jsonError("Mã chuyến tàu không hợp lệ");
      if (!(await getShipmentRepo().get(shipmentId))) return jsonError("Không tìm thấy chuyến tàu", 404);
    } else {
      const created = await createShipment(String(form.get("voyageName") ?? ""));
      shipmentId = created.id;
    }

    const incoming: IncomingFile[] = [];
    const rejected: Array<{ fileName: string; ok: false; message: string }> = [];
    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) {
        rejected.push({ fileName: f.name, ok: false, message: "File vượt quá 25 MB" });
        continue;
      }
      incoming.push({ name: f.name, buffer: Buffer.from(await f.arrayBuffer()) });
    }
    const { shipment, outcomes } = await addFiles(shipmentId, incoming);
    return Response.json({ shipment, outcomes: [...rejected, ...outcomes] });
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}
