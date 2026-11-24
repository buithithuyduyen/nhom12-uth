import { getCellRules, getCodeTables, getTemplateBuffer } from "@/lib/templates";
import { checkTemplate, loadXlsx, readStats } from "@/lib/excel/template-reader";
import { errorMessage, isValidId, jsonError } from "@/lib/api";

/**
 * GET /api/templates/<id>?view=codes|check
 *  - codes (mặc định): danh mục mã + ràng buộc ô (từ comment)
 *  - check: kiểm tra template có đủ sheet / ô theo mapping + thống kê
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!isValidId(id)) return jsonError("Mã template không hợp lệ");
  const view = new URL(request.url).searchParams.get("view") ?? "codes";
  try {
    if (view === "check") {
      const zip = await loadXlsx(await getTemplateBuffer(id));
      const [items, stats] = await Promise.all([checkTemplate(zip), readStats(zip)]);
      return Response.json({
        items,
        stats: {
          fileCount: stats.fileCount,
          externalLinks: stats.externalLinks,
          comments: stats.comments,
          dataValidations: stats.dataValidations,
          x14DataValidations: stats.x14DataValidations,
          definedNames: stats.definedNames,
          sheetNames: stats.sheetNames,
        },
      });
    }
    const [codes, rules] = await Promise.all([getCodeTables(id), getCellRules(id)]);
    return Response.json({ codes, rules });
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}
