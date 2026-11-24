/**
 * lib/extraction/validators.ts
 *
 * Validator thuần bằng code (dùng được ở client và server).
 */

import type { Flag } from "@/lib/types";
import type { FieldDef } from "@/lib/mapping/nsw";
import { parseDate } from "@/lib/normalize";

export interface CellRuleLike {
  maxLength?: number;
  format?: "dd/MM/yyyy" | "dd/MM/yyyy HH:mm";
  numeric?: "integer" | "decimal";
}

/** ISO 6346: 4 chữ cái + 6 số + 1 số kiểm tra. */
export function checkIso6346(container: string): { ok: boolean; message?: string } {
  const c = container.replace(/[\s\-.]/g, "").toUpperCase();
  if (!/^[A-Z]{4}\d{7}$/.test(c)) return { ok: false, message: "Số container không đúng dạng ISO 6346 (4 chữ + 7 số)" };
  const values: Record<string, number> = {};
  let v = 10;
  for (let i = 0; i < 26; i++) {
    if (v % 11 === 0) v++;
    values[String.fromCharCode(65 + i)] = v;
    v++;
  }
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const ch = c[i];
    const n = /\d/.test(ch) ? parseInt(ch, 10) : values[ch];
    sum += n * Math.pow(2, i);
  }
  const check = (sum % 11) % 10;
  if (check !== parseInt(c[10], 10)) return { ok: false, message: `Số kiểm tra container sai (đúng phải là ${check})` };
  return { ok: true };
}

export function looksLikeContainer(value: string): boolean {
  return /^[A-Z]{4}\s?\d{6,7}$/i.test(value.replace(/[\s\-.]/g, ""));
}

export function checkDateFormat(value: string, withTime: boolean): { ok: boolean; message?: string } {
  const re = withTime ? /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/ : /^(\d{2})\/(\d{2})\/(\d{4})$/;
  if (!re.test(value)) {
    return { ok: false, message: `Định dạng phải là ${withTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy"}` };
  }
  const d = parseDate(value);
  if (!d) return { ok: false, message: "Ngày không hợp lệ" };
  if (withTime && ((d.hh ?? 0) > 23 || (d.mm ?? 0) > 59)) return { ok: false, message: "Giờ không hợp lệ" };
  return { ok: true };
}

export function checkPassportNo(value: string): { ok: boolean; message?: string } {
  const v = value.replace(/\s+/g, "");
  if (!/^[A-Z0-9]+$/i.test(v)) return { ok: false, message: "Số hộ chiếu chỉ gồm chữ và số" };
  if (v.length < 6 || v.length > 12) return { ok: false, message: `Độ dài số hộ chiếu bất thường (${v.length} ký tự)` };
  return { ok: true };
}

/** Kiểm tra một giá trị theo định nghĩa trường + ràng buộc từ comment của ô template. */
export function validateValue(def: FieldDef, value: string, rule?: CellRuleLike, extra?: { columnKey?: string }): Flag[] {
  const flags: Flag[] = [];
  const v = (value ?? "").trim();
  if (!v) return flags;
  const maxLength = rule?.maxLength ?? def.maxLength;
  if (maxLength && v.length > maxLength) flags.push({ kind: "invalid", message: `Vượt độ dài tối đa ${maxLength} ký tự (${v.length})` });

  if (def.type === "date") {
    const res = checkDateFormat(v, false);
    // Một số comment ghi "dd/MM/yyyy HH:mm" cho ô ngày ký: chấp nhận cả hai dạng.
    if (!res.ok && !(rule?.format === "dd/MM/yyyy HH:mm" && checkDateFormat(v, true).ok)) flags.push({ kind: "invalid", message: res.message ?? "Ngày không hợp lệ" });
  } else if (def.type === "datetime") {
    const withTime = checkDateFormat(v, true);
    if (!withTime.ok) {
      if (checkDateFormat(v, false).ok) flags.push({ kind: "needsInput", message: "Thiếu giờ phút (dd/MM/yyyy HH:mm)" });
      else flags.push({ kind: "invalid", message: withTime.message ?? "Ngày giờ không hợp lệ" });
    }
  } else if (def.type === "number" || rule?.numeric === "decimal") {
    if (!/^-?\d+(\.\d+)?$/.test(v)) flags.push({ kind: "invalid", message: "Phải là số (dấu chấm thập phân, không phân cách nghìn)" });
  } else if (def.type === "integer" || rule?.numeric === "integer") {
    if (!/^-?\d+$/.test(v)) flags.push({ kind: "invalid", message: "Phải là số nguyên" });
  } else if (def.type === "select" && def.options && !def.options.includes(v)) {
    flags.push({ kind: "invalid", message: `Chỉ nhận: ${def.options.join(" | ")}` });
  }

  const key = extra?.columnKey ?? def.key;
  if (key === "containerNo" && looksLikeContainer(v)) {
    for (const part of v.split(/[;,/]\s*/)) {
      if (!part.trim()) continue;
      const r = checkIso6346(part);
      if (!r.ok) flags.push({ kind: "invalid", message: `${part}: ${r.message}` });
    }
  }
  if (key === "passportNo") {
    const r = checkPassportNo(v);
    if (!r.ok) flags.push({ kind: "invalid", message: r.message ?? "Số hộ chiếu không hợp lệ" });
  }
  return flags;
}
