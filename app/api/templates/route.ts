import { deleteTemplate, listTemplates, saveUploadedTemplate, setDefaultTemplate } from "@/lib/templates";
import { errorMessage, isValidId, jsonError } from "@/lib/api";

export async function GET(): Promise<Response> {
  try {
    return Response.json({ templates: await listTemplates() });
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}

/** Upload template mới (multipart: file). Lưu vào ./data/templates. */
export async function POST(request: Request): Promise<Response> {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return jsonError("Chưa chọn file template");
    if (!file.name.toLowerCase().endsWith(".xlsx")) return jsonError("Template phải là file .xlsx");
    if (file.size > 25 * 1024 * 1024) return jsonError("File vượt quá 25 MB");
    const info = await saveUploadedTemplate(file.name, Buffer.from(await file.arrayBuffer()));
    return Response.json({ template: info }, { status: 201 });
  } catch (err) {
    return jsonError(`Không lưu được template: ${errorMessage(err)}`, 400);
  }
}

/** PUT { defaultId } – đặt template mặc định. */
export async function PUT(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { defaultId?: string };
    if (!body.defaultId || !isValidId(body.defaultId)) return jsonError("Thiếu mã template");
    await setDefaultTemplate(body.defaultId);
    return Response.json({ templates: await listTemplates() });
  } catch (err) {
    return jsonError(errorMessage(err), 400);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!isValidId(id)) return jsonError("Thiếu mã template");
  try {
    await deleteTemplate(id);
    return Response.json({ templates: await listTemplates() });
  } catch (err) {
    return jsonError(errorMessage(err), 400);
  }
}
