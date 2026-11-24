import { getStorage } from "@/lib/storage";
import { jsonError } from "@/lib/api";

const TYPES: Record<string, string> = {
  png: "image/png",
  html: "text/html; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  json: "application/json; charset=utf-8",
};

/** Phục vụ ảnh trang / HTML phần DOCX / text / tọa độ text: /api/pages/<shipmentId>/<file> */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await params;
  if (!Array.isArray(path) || path.length !== 2) return jsonError("Đường dẫn không hợp lệ", 400);
  const [shipmentId, file] = path;
  if (!/^[a-zA-Z0-9-]+$/.test(shipmentId) || !/^[a-zA-Z0-9-]+-p\d+(\.items)?\.(png|html|txt|json)$/.test(file)) {
    return jsonError("Đường dẫn không hợp lệ", 400);
  }
  const ext = file.split(".").pop() ?? "";
  try {
    const buffer = await getStorage().readFile(`pages/${shipmentId}/${file}`);
    const headers: Record<string, string> = { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "no-store" };
    if (ext === "html") headers["Content-Security-Policy"] = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";
    return new Response(new Uint8Array(buffer), { headers });
  } catch {
    return jsonError("Không tìm thấy", 404);
  }
}
