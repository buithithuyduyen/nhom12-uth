/**
 * scripts/inspect-template.ts
 *
 *   npx tsx scripts/inspect-template.ts [đường dẫn template.xlsx]
 *
 * In: tên sheet (theo thứ tự, trạng thái ẩn), ô merge, data validation,
 * comment của từng ô theo mapping, danh mục mã đọc được.
 */

import path from "node:path";
import { LocalFsProvider, getProjectStorage, paths } from "@/lib/storage";
import { loadXlsx, readCodeTables, readSheetCells, readSheetComments, readStats, parseRuleFromComment } from "@/lib/excel/template-reader";
import { listSheets, readZipText } from "@/lib/excel/xlsx-xml";
import { WRITE_MAPPINGS } from "@/lib/mapping/nsw";
import type { CodeType } from "@/lib/types";

async function main(): Promise<void> {
  const arg = process.argv[2];
  // Cho phép đọc template ở đường dẫn tùy ý do người chạy truyền vào (vẫn qua lớp storage).
  const buffer = arg
    ? await new LocalFsProvider(path.dirname(path.resolve(arg))).readFile(path.basename(arg))
    : await getProjectStorage().readFile(paths.builtinTemplate());
  const zip = await loadXlsx(buffer);
  const stats = await readStats(zip);

  console.log("=== THỐNG KÊ ===");
  console.log(`Số file trong zip: ${stats.fileCount}`);
  console.log(`externalLinks: ${stats.externalLinks}, file comments: ${stats.commentFiles} (${stats.comments} comment)`);
  console.log(`dataValidation: ${stats.dataValidations}, x14:dataValidation: ${stats.x14DataValidations}, defined names: ${stats.definedNames}`);

  console.log("\n=== SHEET ===");
  const sheets = await listSheets(zip);
  sheets.forEach((s, i) => console.log(`${String(i + 1).padStart(2)}. ${s.name}${s.state ? ` [${s.state}]` : ""}  -> ${s.path}`));

  for (const mapping of WRITE_MAPPINGS) {
    const entry = sheets.find((s) => s.name === mapping.sheetName);
    console.log(`\n=== ${mapping.sheetName} ===`);
    if (!entry) {
      console.log("  !! Không tìm thấy sheet");
      continue;
    }
    const xml = await readZipText(zip, entry.path);
    const merges = [...xml.matchAll(/<mergeCell ref="([^"]+)"/g)].map((m) => m[1]);
    console.log(`  Merge: ${merges.join(", ") || "(không)"}`);
    const dvs = [...xml.matchAll(/<dataValidation\b([^>]*)>([\s\S]*?)<\/dataValidation>|<dataValidation\b([^>]*)\/>/g)];
    console.log(`  Data validation (${dvs.length}):`);
    for (const m of dvs) {
      const attrs = m[1] ?? m[3] ?? "";
      const sqref = /sqref="([^"]+)"/.exec(attrs)?.[1] ?? "";
      const type = /type="([^"]+)"/.exec(attrs)?.[1] ?? "any";
      const f1 = /<formula1>([\s\S]*?)<\/formula1>/.exec(m[2] ?? "")?.[1] ?? "";
      console.log(`    ${sqref.padEnd(22)} ${type.padEnd(8)} ${f1.slice(0, 80)}`);
    }
    const comments = await readSheetComments(zip, mapping.sheetName);
    const cells = await readSheetCells(zip, mapping.sheetName);
    console.log("  Ô đơn theo mapping:");
    for (const b of mapping.header) {
      const label = (cells.get(`A${b.cell.replace(/^[A-Z]+/, "")}`)?.value ?? "").split("\n")[0];
      const comment = comments[b.cell];
      const rule = comment ? parseRuleFromComment(comment) : null;
      console.log(
        `    ${b.cell.padEnd(5)} ${b.key.padEnd(20)} ${label.slice(0, 45).padEnd(46)}` +
          (rule ? ` [maxLen=${rule.maxLength ?? "-"} fmt=${rule.format ?? "-"} num=${rule.numeric ?? "-"}]` : ""),
      );
    }
    for (const t of mapping.tables) {
      const headerRow = mapping.repeatBlock && t.startRow === mapping.repeatBlock.subStartRow ? mapping.repeatBlock.subHeaderRow : t.startRow - 1;
      console.log(`  Bảng "${t.key}" từ dòng ${t.startRow} (tiêu đề dòng ${headerRow}):`);
      for (const c of t.columns) {
        const header = (cells.get(`${c.col}${headerRow}`)?.value ?? "").split("\n")[0];
        const comment = comments[`${c.col}${headerRow}`] ?? comments[`${c.col}${t.startRow}`];
        const rule = comment ? parseRuleFromComment(comment) : null;
        console.log(
          `    ${c.col.padEnd(3)} ${c.key.padEnd(20)} ${header.slice(0, 40).padEnd(41)}` +
            (rule ? ` [maxLen=${rule.maxLength ?? "-"} fmt=${rule.format ?? "-"} num=${rule.numeric ?? "-"}]` : ""),
        );
      }
    }
    const formulas = [...cells.entries()].filter(([, v]) => v.formula).map(([k, v]) => `${k}=${v.formula}`);
    console.log(`  Công thức: ${formulas.slice(0, 8).join("; ")}${formulas.length > 8 ? ` ... (+${formulas.length - 8})` : ""}`);
  }

  console.log("\n=== DANH MỤC MÃ (Declaration list) ===");
  const codes = await readCodeTables(zip);
  for (const k of Object.keys(codes) as CodeType[]) {
    const sample = codes[k].slice(0, 8).map((e) => e.code).join(", ");
    console.log(`  ${k.padEnd(14)} ${String(codes[k].length).padStart(4)} mã  (${sample}${codes[k].length > 8 ? ", ..." : ""})`);
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
