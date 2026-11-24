/**
 * Đọc DOCX bằng mammoth.convertToHtml (giữ <table>), chuyển bảng sang " | ".
 * Tách thành nhiều phần (DocumentInstance) theo ngắt trang và theo tiêu đề lớn của tờ khai.
 */

import mammoth from "mammoth";
import { getStorage, paths } from "@/lib/storage";
import type { DocumentInstance, UploadedFileInput } from "./types";
import { pageHeader } from "./layout";
import { stripAccents } from "@/lib/normalize";

/** Tiêu đề lớn thường gặp của các tờ khai/chứng từ. */
const TITLE_PATTERNS: RegExp[] = [
  /THONG BAO TAU (DEN|ROI)/,
  /NOTICE OF (ARRIVAL|DEPARTURE)/,
  /BAN LUOC KHAI HANG HOA/,
  /CARGO MANIFEST/,
  /BAN KHAI HANG HOA/,
  /CARGO DECLARATION/,
  /BAN KHAI DU TRU/,
  /SHIP'?S STORES? DECLARATION/,
  /BAN KHAI HANH LY/,
  /CREW'?S EFFECTS/,
  /DANH SACH THUYEN VIEN/,
  /CREW LIST/,
  /DANH SACH HANH KHACH/,
  /PASSENGER LIST/,
  /BAN KHAI CHUNG/,
  /GENERAL DECLARATION/,
  /SHIP'?S PARTICULARS/,
  /THONG SO (KY THUAT )?TAU/,
  /GIAY CHUNG NHAN/,
  /CERTIFICATE/,
  /GIAY PHEP ROI CANG/,
  /PORT CLEARANCE/,
  /KIEM DICH/,
  /DECLARATION OF HEALTH/,
  /VOYAGE MEMO/,
  /BILL OF LADING/,
  /VAN DON/,
];

function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<br\s*\/?>/gi, "\n");
  // Bảng: mỗi <tr> một dòng, ô ngăn " | "
  s = s.replace(/<table[\s\S]*?<\/table>/gi, (table) => {
    const rows: string[] = [];
    for (const tr of table.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
      const cells: string[] = [];
      for (const td of tr[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)) {
        cells.push(
          td[1]
            .replace(/<\/p>\s*<p[^>]*>/gi, " / ")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
        );
      }
      rows.push(cells.join(" | "));
    }
    return `\n${rows.join("\n")}\n`;
  });
  s = s.replace(/<\/(p|h[1-6]|li|div)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, "");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter((l) => l !== "")
    .join("\n");
}

function blockText(html: string): string {
  return stripAccents(html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/’/g, "'"))
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isUppercaseDominant(text: string): boolean {
  const letters = text.replace(/[^A-Za-zÀ-ỹ]/g, "");
  if (letters.length < 4) return false;
  const upper = letters.split("").filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length;
  return upper / letters.length >= 0.7;
}

/** Các dòng (tách theo <br>) của một đoạn văn. */
function paragraphLines(innerHtml: string): string[] {
  return innerHtml
    .split(/<br\s*\/?>/i)
    .map((l) => l.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0);
}

function titleOfParagraph(innerHtml: string): string | undefined {
  for (const line of paragraphLines(innerHtml)) {
    if (line.length < 4 || line.length > 160) continue;
    if (!isUppercaseDominant(line)) continue;
    if (TITLE_PATTERNS.some((re) => re.test(blockText(line)))) return line;
  }
  return undefined;
}

function findTitle(html: string): string | undefined {
  for (const m of html.matchAll(/<(p|h[1-6])\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const t = titleOfParagraph(m[2]);
    if (t) return t;
  }
  return undefined;
}

/**
 * Chia HTML theo ngắt trang Ở CẤP NGOÀI CÙNG (ngắt trang nằm trong bảng thì bỏ qua để không cắt đôi bảng).
 */
function splitTopLevel(html: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let last = 0;
  const re = /<table\b|<\/table>|<hr class="page-break" \/>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tok = m[0].toLowerCase();
    if (tok.startsWith("<table")) depth++;
    else if (tok === "</table>") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      parts.push(html.slice(last, m.index));
      last = m.index + m[0].length;
    }
  }
  parts.push(html.slice(last));
  return parts.map(cleanFragment).filter((p) => blockText(p).length > 0);
}

function cleanFragment(html: string): string {
  return html
    .replace(/^(\s*<\/p>)+/i, "")
    .replace(/(<p>\s*)+$/i, "")
    .replace(/<hr class="page-break" \/>/gi, "")
    .trim();
}

/** Tách tiếp một phần nếu có nhiều tiêu đề lớn ở cấp ngoài cùng (tờ khai liền nhau không có ngắt trang). */
function splitByTitles(html: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let lastCut = 0;
  let seenTitle = false;
  let seenContentAfterTitle = false;
  const re = /<table\b|<\/table>|<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tok = m[0];
    if (/^<table/i.test(tok)) {
      if (depth === 0 && seenTitle) seenContentAfterTitle = true;
      depth++;
      continue;
    }
    if (/^<\/table>/i.test(tok)) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth > 0) continue;
    const title = titleOfParagraph(m[1] ?? "");
    if (title) {
      if (seenTitle && seenContentAfterTitle) {
        // lùi về đầu đoạn "CỘNG HÒA..." ngay trước tiêu đề nếu có
        parts.push(html.slice(lastCut, m.index));
        lastCut = m.index;
        seenContentAfterTitle = false;
      }
      seenTitle = true;
    } else if (seenTitle) {
      const text = (m[1] ?? "").replace(/<[^>]+>/g, "").trim();
      if (text.length > 40) seenContentAfterTitle = true;
    }
  }
  parts.push(html.slice(lastCut));
  return parts.map(cleanFragment).filter((p) => blockText(p).length > 0);
}

/** Phần không có tiêu đề và ngắn -> trang tiếp nối của phần trước. */
function mergeContinuations(parts: string[]): string[] {
  const out: string[] = [];
  for (const part of parts) {
    const hasTitle = !!findTitle(part);
    const textLen = blockText(part).length;
    if (!hasTitle && out.length > 0 && textLen < 600) {
      out[out.length - 1] += part;
    } else {
      out.push(part);
    }
  }
  return out;
}

export async function readDocx(input: UploadedFileInput): Promise<DocumentInstance[]> {
  const result = await mammoth.convertToHtml({ buffer: input.buffer }, { styleMap: ["br[type='page'] => hr.page-break:fresh"] });
  const html = result.value;
  const pages = mergeContinuations(splitTopLevel(html).flatMap((part) => splitByTitles(part)));
  const storage = getStorage();
  const instances: DocumentInstance[] = [];
  let n = 0;
  for (const part of pages) {
    n++;
    const body = htmlToText(part);
    const text = `${pageHeader(n)}\n${body}`;
    const title = findTitle(part);
    const doc = `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.45;color:#0f172a;padding:20px;margin:0;background:#fff}
      table{border-collapse:collapse;width:100%;margin:8px 0}
      td,th{border:1px solid #cbd5e1;padding:4px 6px;vertical-align:top}
      p{margin:4px 0}
      mark{background:#fde68a;padding:0 1px}
    </style></head><body>${part}</body></html>`;
    await storage.saveFile(paths.pageHtml(input.shipmentId, input.fileId, n), doc);
    await storage.saveFile(paths.pageText(input.shipmentId, input.fileId, n), text);
    instances.push({
      fileId: input.fileId,
      fileName: input.fileName,
      page: n,
      kind: "text",
      text,
      sha256: input.sha256,
      rotation: 0,
      title,
      hasImage: false,
      hasHtml: true,
    });
  }
  return instances;
}
