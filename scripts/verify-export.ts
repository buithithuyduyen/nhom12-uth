/**
 * scripts/verify-export.ts
 *
 * Kiểm tra file Excel đã xuất so với template:
 *   npx tsx scripts/verify-export.ts                 # file xuất gần nhất trong ./data/exports
 *   npx tsx scripts/verify-export.ts --shipment <id> # file xuất gần nhất của chuyến tàu
 *   npx tsx scripts/verify-export.ts --file <đường dẫn .xlsx trong data/exports>
 *
 * In PASS/FAIL cho từng mục. Thoát mã 1 nếu có FAIL.
 */

import { XMLValidator } from "fast-xml-parser";
import { getShipmentRepo, getStorage, paths } from "@/lib/storage";
import { getTemplateBuffer } from "@/lib/templates";
import { loadSharedStrings, loadXlsx, readSheetCells, readStats } from "@/lib/excel/template-reader";
import { listSheets, parseRange, numberToCol, readZipText } from "@/lib/excel/xlsx-xml";
import { WRITE_MAPPINGS } from "@/lib/mapping/nsw";
import type { ExportManifest } from "@/lib/export";

let failures = 0;
function report(ok: boolean, label: string, detail = ""): void {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

function argValue(name: string): string | null {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] ?? null : null;
}

async function pickExportFile(): Promise<string> {
  const storage = getStorage();
  const fileArg = argValue("--file");
  if (fileArg) {
    const name = fileArg.replace(/\\/g, "/").split("/").pop()!;
    return paths.exportFile(name);
  }
  const shipmentId = argValue("--shipment");
  if (shipmentId) {
    const shipment = await getShipmentRepo().get(shipmentId);
    if (!shipment) throw new Error(`Không tìm thấy chuyến tàu ${shipmentId}`);
    const last = shipment.exports[shipment.exports.length - 1];
    if (!last) throw new Error("Chuyến tàu chưa có file xuất nào");
    return paths.exportFile(last.fileName);
  }
  const files = (await storage.listFiles("exports")).filter((f) => f.endsWith(".xlsx"));
  if (files.length === 0) throw new Error("Chưa có file nào trong ./data/exports");
  let best = files[0];
  let bestTime = -1;
  for (const f of files) {
    const t = (await storage.modifiedAt(f)) ?? 0;
    if (t > bestTime) {
      bestTime = t;
      best = f;
    }
  }
  return best;
}

async function main(): Promise<void> {
  const storage = getStorage();
  const exportPath = await pickExportFile();
  const fileName = exportPath.split("/").pop()!;
  console.log(`File kiểm tra: data/${exportPath}`);

  let manifest: ExportManifest | null = null;
  try {
    manifest = JSON.parse((await storage.readFile(paths.exportManifest(fileName))).toString("utf-8")) as ExportManifest;
  } catch {
    console.log("(Không có manifest đi kèm – chỉ kiểm tra cấu trúc, so với template mặc định)");
  }
  const templateId = manifest?.templateId ?? "builtin";
  console.log(`Template: ${templateId}\n`);

  const exportZip = await loadXlsx(await storage.readFile(exportPath));
  const templateZip = await loadXlsx(await getTemplateBuffer(templateId));
  const exp = await readStats(exportZip);
  const tpl = await readStats(templateZip);

  // --- Cấu trúc
  const tplFilesNoCalc = tpl.fileNames.filter((n) => n !== "xl/calcChain.xml");
  const missing = tplFilesNoCalc.filter((n) => !exp.fileNames.includes(n));
  const extra = exp.fileNames.filter((n) => !tpl.fileNames.includes(n));
  report(
    missing.length === 0 && extra.length === 0 && exp.fileCount === tplFilesNoCalc.length,
    "Số file trong zip",
    `template ${tpl.fileCount} (bỏ calcChain.xml: ${tplFilesNoCalc.length}), xuất ${exp.fileCount}` +
      (missing.length ? `; thiếu: ${missing.join(", ")}` : "") +
      (extra.length ? `; thừa: ${extra.join(", ")}` : ""),
  );
  report(exp.x14DataValidations === tpl.x14DataValidations, "Số x14:dataValidation", `${tpl.x14DataValidations} = ${exp.x14DataValidations}`);
  report(exp.dataValidations === tpl.dataValidations, "Số dataValidation", `${tpl.dataValidations} = ${exp.dataValidations}`);
  report(exp.comments === tpl.comments && exp.commentFiles === tpl.commentFiles, "Số comments", `${tpl.comments} (${tpl.commentFiles} file) = ${exp.comments} (${exp.commentFiles} file)`);
  report(exp.externalLinks === tpl.externalLinks, "Số externalLinks", `${tpl.externalLinks} = ${exp.externalLinks}`);
  report(exp.definedNames === tpl.definedNames, "Số defined names", `${tpl.definedNames} = ${exp.definedNames}`);
  report(JSON.stringify(exp.sheetNames) === JSON.stringify(tpl.sheetNames), "Tên & thứ tự sheet", exp.sheetNames.join(" | "));

  // Các phần không được sửa phải giống hệt byte
  const untouched = tpl.fileNames.filter((n) => /^xl\/(externalLinks|comments|drawings|printerSettings|theme)/.test(n) || n === "xl/styles.xml" || n === "xl/sharedStrings.xml");
  const changed: string[] = [];
  for (const n of untouched) {
    const a = await templateZip.file(n)!.async("uint8array");
    const b = await exportZip.file(n)?.async("uint8array");
    if (!b || a.length !== b.length || !a.every((v, i) => v === b[i])) changed.push(n);
  }
  report(changed.length === 0, "externalLinks/comments/VML/printerSettings/styles giữ nguyên byte", changed.length ? `khác: ${changed.join(", ")}` : `${untouched.length} file`);

  const wb = await readZipText(exportZip, "xl/workbook.xml");
  report(/<calcPr\b[^>]*fullCalcOnLoad="1"/.test(wb), "workbook.xml có calcPr fullCalcOnLoad=1");
  const ct = await readZipText(exportZip, "[Content_Types].xml");
  const rels = await readZipText(exportZip, "xl/_rels/workbook.xml.rels");
  report(!exportZip.file("xl/calcChain.xml") && !/calcChain/.test(ct) && !/calcChain/.test(rels), "Đã xóa calcChain.xml và khai báo");

  // XML hợp lệ cho các sheet được ghi
  const sheets = await listSheets(exportZip);
  for (const mapping of WRITE_MAPPINGS) {
    const entry = sheets.find((s) => s.name === mapping.sheetName);
    if (!entry) {
      report(false, `Sheet "${mapping.sheetName}" tồn tại`);
      continue;
    }
    const xml = await readZipText(exportZip, entry.path);
    const valid = XMLValidator.validate(xml);
    report(valid === true, `XML hợp lệ: ${mapping.sheetName}`, valid === true ? "" : JSON.stringify(valid));
  }

  // --- Đọc lại ô đã ghi
  const exportSS = await loadSharedStrings(exportZip);
  const templateSS = await loadSharedStrings(templateZip);
  const written = manifest?.written ?? [];
  if (manifest) {
    let mismatch = 0;
    const cache = new Map<string, Map<string, { value: string; formula: string | null }>>();
    const cellsOf = async (sheet: string) => {
      if (!cache.has(sheet)) cache.set(sheet, await readSheetCells(exportZip, sheet, exportSS));
      return cache.get(sheet)!;
    };
    for (const w of written) {
      const cells = await cellsOf(w.sheet);
      const got = cells.get(w.cell)?.value ?? "";
      if (got !== w.value) {
        mismatch++;
        if (mismatch <= 10) console.log(`      ${w.sheet}!${w.cell}: mong đợi "${w.value}", đọc được "${got}"`);
      }
    }
    report(mismatch === 0, "Đọc lại các ô đã ghi", `${written.length} ô, sai ${mismatch}`);
  }

  // --- Quét vùng nhập liệu: không còn dữ liệu mẫu cũ của template
  const writtenSet = new Set(written.map((w) => `${w.sheet}!${w.cell}`));
  let leftovers = 0;
  for (const mapping of WRITE_MAPPINGS) {
    const tplCells = await readSheetCells(templateZip, mapping.sheetName, templateSS);
    const expCells = await readSheetCells(exportZip, mapping.sheetName, exportSS);
    const keep = new Set(mapping.keepFormulaCells);
    for (const range of mapping.clearRanges) {
      const r = parseRange(range);
      for (let row = r.r1; row <= r.r2; row++) {
        for (let col = r.c1; col <= r.c2; col++) {
          const ref = `${numberToCol(col)}${row}`;
          if (keep.has(ref)) continue;
          const t = tplCells.get(ref);
          const e = expCells.get(ref);
          if (!t || !e) continue;
          if (t.formula && e.formula && t.formula === e.formula) continue; // công thức suy ra được giữ
          if (writtenSet.has(`${mapping.sheetName}!${ref}`)) continue; // người dùng đã ghi đè
          if (e.value !== "" && e.value === t.value) {
            leftovers++;
            if (leftovers <= 15) console.log(`      còn dữ liệu mẫu: ${mapping.sheetName}!${ref} = "${e.value.slice(0, 60)}"`);
          }
        }
      }
    }
  }
  report(leftovers === 0, "Không còn dữ liệu mẫu cũ của template trong vùng nhập liệu", `${leftovers} ô`);

  console.log(`\n${failures === 0 ? "KẾT QUẢ: PASS" : `KẾT QUẢ: FAIL (${failures} mục)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  console.error("FAIL  Lỗi:", err instanceof Error ? err.message : err);
  process.exit(1);
});
