/**
 * Bước B – bóc tách theo schema zod RIÊNG của từng docType.
 * Chia bảng dài thành khối ~30 dòng (lặp tiêu đề cột), gộp, loại dòng trùng ở ranh giới.
 * Kết quả được xác minh bằng code (verify.ts).
 */

import { callJson } from "./llm";
import { buildExtractionSchema, buildStructureExample, describeSpec, getDocSpec, type DocSpec, type ExtractedField } from "./schemas";
import { countNumberedRows, flagLowConfidence, verifyInstance, verifyWithOcr } from "./verify";
import type { DocType, ExtractedInstance, FieldValue, PageKind } from "@/lib/types";

const CHUNK_ROWS = 30;
const CHUNK_TRIGGER = 45;

function systemPrompt(spec: DocSpec): string {
  return `Bạn là bộ trích xuất dữ liệu chứng từ hàng hải. Loại chứng từ: ${spec.title}.
Chỉ trả về MỘT đối tượng JSON đúng cấu trúc, không giải thích.

QUY TẮC BẮT BUỘC:
1. Chỉ trích xuất thông tin CÓ trong tài liệu. Không thấy thì value = null. Tuyệt đối không suy đoán, không bịa.
2. Chép NGUYÊN VĂN từng ký tự: số hộ chiếu, số B/L, số container, số seal, số giấy phép, số IMO.
3. KHÔNG đổi định dạng ngày (giữ nguyên như trong tài liệu). KHÔNG dịch tên riêng, tên cảng, tên công ty.
4. Bảng phải ĐỦ MỌI DÒNG và ĐÚNG THỨ TỰ như tài liệu.
5. Mỗi trường là object: {"value": chuỗi nguyên văn hoặc null, "confidence": 0..1, "page": số trang, "sourceText": đoạn text gốc ngắn chứa giá trị}.
6. Khi có cả text và ảnh: text là nguồn chính cho từng ký tự, ảnh chỉ để hiểu bố cục. Nếu ảnh và text mâu thuẫn, dùng giá trị trong text và đặt confidence <= 0.5.
7. Không so sánh, không chọn mã, không chuẩn hóa – việc đó do hệ thống làm.
8. "totalRowsStated": nếu tài liệu ghi tổng số dòng/người (vd. "Total 11 crew") thì ghi số đó, không có thì null.

HƯỚNG DẪN RIÊNG: ${spec.instructions}

CÁC KHÓA CẦN TRẢ:
${describeSpec(spec)}

CẤU TRÚC JSON (chỉ minh họa cấu trúc, không phải dữ liệu):
${buildStructureExample(spec)}`;
}

interface RawResult {
  header: Record<string, ExtractedField | null | undefined>;
  tables: Record<string, Array<Record<string, ExtractedField | null | undefined>>>;
  totalRowsStated: number | null;
}

async function runOnce(spec: DocSpec, userText: string, imageBase64?: string): Promise<RawResult> {
  const schema = buildExtractionSchema(spec);
  const system = systemPrompt(spec);
  const first = await callJson({ system, userText, imageBase64 });
  let parsed = schema.safeParse(first.json);
  if (!parsed.success) {
    const retry = await callJson({
      system,
      userText,
      imageBase64,
      followUp: {
        assistant: first.raw.slice(0, 12000),
        user: `JSON chưa đúng schema. Lỗi: ${parsed.error.message.slice(0, 1500)}. Hãy trả lại toàn bộ JSON đúng cấu trúc.`,
      },
    });
    parsed = schema.safeParse(retry.json);
    if (!parsed.success) throw new Error(`Kết quả bóc tách không đúng schema sau 2 lần gọi: ${parsed.error.message.slice(0, 500)}`);
  }
  const data = parsed.data;
  const stated = data.totalRowsStated;
  return {
    header: (data.header ?? {}) as RawResult["header"],
    tables: (data.tables ?? {}) as RawResult["tables"],
    totalRowsStated: stated === null || stated === undefined || stated === "" ? null : Number.isFinite(Number(stated)) ? Number(stated) : null,
  };
}

/** Chia text có bảng dài thành nhiều khối, mỗi khối lặp lại dòng tiêu đề cột. */
export function chunkTableText(text: string): string[] {
  const lines = text.split("\n");
  const tableIdx = lines.map((l, i) => (l.includes(" | ") ? i : -1)).filter((i) => i >= 0);
  if (tableIdx.length <= CHUNK_TRIGGER) return [text];
  const firstTable = tableIdx[0];
  const preamble = lines.slice(0, firstTable);
  // dòng tiêu đề cột: các dòng bảng đầu tiên không bắt đầu bằng số thứ tự
  const headerLines: string[] = [];
  let i = firstTable;
  while (i < lines.length && headerLines.length < 3 && !/^\s*\d{1,3}\s*[|.)]/.test(lines[i])) {
    headerLines.push(lines[i]);
    i++;
  }
  const body = lines.slice(i);
  const chunks: string[] = [];
  for (let start = 0; start < body.length; start += CHUNK_ROWS) {
    const part = body.slice(start, start + CHUNK_ROWS);
    const head = start === 0 ? [...preamble, ...headerLines] : [lines[0], "(tiếp theo của bảng – tiêu đề cột lặp lại)", ...headerLines];
    chunks.push([...head, ...part].join("\n"));
  }
  return chunks;
}

function rowSignature(row: Record<string, ExtractedField | null | undefined>): string {
  return Object.keys(row)
    .sort()
    .map((k) => `${k}=${(row[k]?.value ?? "").toString().trim().toUpperCase()}`)
    .join("|");
}

function toFieldValue(f: ExtractedField | null | undefined, ctx: { fileId: string; fileName: string; page: number }): FieldValue | null {
  if (!f || f.value === null || f.value === undefined || String(f.value).trim() === "") return null;
  const value = String(f.value).trim();
  return {
    value,
    raw: value,
    confidence: f.confidence ?? undefined,
    source: { fileId: ctx.fileId, fileName: ctx.fileName, page: ctx.page },
    sourceText: f.sourceText ?? undefined,
    flags: [],
  };
}

export interface ExtractInput {
  fileId: string;
  fileName: string;
  page: number;
  kind: PageKind;
  docType: DocType;
  text: string;
  imageBase64?: string;
  /** text là kết quả OCR của ảnh scan (có thể lỗi lẻ tẻ) */
  ocr?: boolean;
}

export async function extractInstance(input: ExtractInput): Promise<ExtractedInstance> {
  const spec = getDocSpec(input.docType);
  const base: ExtractedInstance = {
    fileId: input.fileId,
    fileName: input.fileName,
    page: input.page,
    docType: input.docType,
    kind: input.kind,
    header: {},
    tables: {},
    notes: [],
    extractedAt: new Date().toISOString(),
  };
  if (!spec) return base;

  const textBody = input.text.replace(/^=== TRANG \d+ ===\n?/, "").trim();
  // Trang scan có OCR: AI chỉ đọc ẢNH (OCR có nhiễu, không đưa cho AI); OCR dùng để kiểm tra lại bằng code.
  const hasText = !input.ocr && input.kind !== "scanned" && textBody.length >= 50;
  const chunks = hasText ? chunkTableText(input.text) : [input.text];

  const merged: RawResult = { header: {}, tables: {}, totalRowsStated: null };
  for (let idx = 0; idx < chunks.length; idx++) {
    const parts: string[] = [];
    if (hasText) {
      parts.push(`Trang/phần số ${input.page}. Text cơ học của tài liệu (cột ngăn bởi ' | ')${chunks.length > 1 ? ` – khối ${idx + 1}/${chunks.length}` : ""}:`);
      parts.push("-----");
      parts.push(chunks[idx]);
      parts.push("-----");
      if (chunks.length > 1 && idx > 0) parts.push("Đây là phần tiếp theo của bảng: chỉ trích các dòng bảng trong khối này; header có thể để null.");
      if (input.imageBase64) parts.push("Kèm ảnh trang để hiểu bố cục (text là nguồn chính cho ký tự).");
    } else {
      parts.push(`Trang số ${input.page}. Đây là ẢNH bản scan của chứng từ. Đọc kỹ từng ký tự.`);
    }
    const res = await runOnce(spec, parts.join("\n"), idx === 0 || !hasText ? input.imageBase64 : undefined);
    for (const [k, v] of Object.entries(res.header)) {
      if (v && v.value !== null && !merged.header[k]) merged.header[k] = v;
    }
    for (const [k, rows] of Object.entries(res.tables)) {
      if (!Array.isArray(rows)) continue;
      const target = (merged.tables[k] ??= []);
      for (const row of rows) {
        if (!row) continue;
        const sig = rowSignature(row);
        // loại dòng trùng ở ranh giới khối
        const tail = target.slice(-3).map(rowSignature);
        if (tail.includes(sig)) continue;
        target.push(row);
      }
    }
    if (res.totalRowsStated !== null && merged.totalRowsStated === null) merged.totalRowsStated = res.totalRowsStated;
  }

  const ctx = { fileId: input.fileId, fileName: input.fileName, page: input.page };
  for (const f of spec.header) {
    const fv = toFieldValue(merged.header[f.key], ctx);
    if (fv) base.header[f.key] = fv;
  }
  for (const t of spec.tables) {
    const rows = merged.tables[t.key] ?? [];
    base.tables[t.key] = rows
      .map((row) => {
        const out: Record<string, FieldValue> = {};
        for (const c of t.columns) {
          const fv = toFieldValue(row[c.key], ctx);
          if (fv) out[c.key] = fv;
        }
        return out;
      })
      .filter((r) => Object.keys(r).length > 0);
  }

  // --- Xác minh bằng code
  if (input.ocr) verifyWithOcr(base, input.text);
  else verifyInstance(base, hasText ? input.text : "", input.kind);
  flagLowConfidence(base);

  const mainTable = spec.tables[0]?.key;
  if (mainTable) {
    const extractedRows = base.tables[mainTable]?.length ?? 0;
    if (hasText) {
      const mech = countNumberedRows(input.text);
      if (mech !== undefined) {
        base.mechanicalRowCount = mech;
        if (mech !== extractedRows) base.notes!.push(`Có thể thiếu dòng: đếm cơ học ${mech} dòng, trích được ${extractedRows} dòng`);
      }
    }
    if (merged.totalRowsStated !== null && merged.totalRowsStated !== extractedRows) {
      base.notes!.push(`Chứng từ ghi tổng ${merged.totalRowsStated}, trích được ${extractedRows} dòng`);
    }
    const statedTotal = base.header.totalCrew?.value;
    if (input.docType === "crew_list" && statedTotal) {
      const n = parseInt(statedTotal.replace(/\D+/g, ""), 10);
      if (Number.isFinite(n) && n !== extractedRows) base.notes!.push(`"Total ${n} crew" khác số dòng trích được (${extractedRows})`);
    }
  }
  return base;
}
