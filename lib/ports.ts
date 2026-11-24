/**
 * lib/ports.ts
 *
 * Tra mã cảng theo data/ports.json do NGƯỜI DÙNG cung cấp (mảng {code, name, aliases}).
 * Template không có bảng mã cảng; ứng dụng không tự bịa mã cảng.
 * File này THUẦN (nhận danh sách cảng làm tham số) để dùng được ở client.
 */

import Fuse from "fuse.js";
import type { PortEntry } from "@/lib/types";
import { canonicalText } from "@/lib/normalize";

export interface PortMatch {
  code: string | null;
  name: string | null;
  method: "exact" | "alias" | "fuzzy" | "none";
}

function keyOf(s: string): string {
  return canonicalText(s).replace(/[^A-Z0-9]+/g, " ").trim();
}

const fuseCache = new WeakMap<PortEntry[], Fuse<PortEntry>>();

export function matchPort(ports: PortEntry[], raw: string | null | undefined): PortMatch {
  const none: PortMatch = { code: null, name: null, method: "none" };
  if (!raw || !raw.trim() || ports.length === 0) return none;
  const key = keyOf(raw);
  const byCode = ports.find((p) => keyOf(p.code) === key);
  if (byCode) return { code: byCode.code, name: byCode.name, method: "exact" };
  const byName = ports.find((p) => keyOf(p.name) === key);
  if (byName) return { code: byName.code, name: byName.name, method: "exact" };
  const byAlias = ports.find((p) => (p.aliases ?? []).some((a) => keyOf(a) === key));
  if (byAlias) return { code: byAlias.code, name: byAlias.name, method: "alias" };
  let fuse = fuseCache.get(ports);
  if (!fuse) {
    fuse = new Fuse(ports, { keys: ["name", "aliases"], threshold: 0.25, includeScore: true, ignoreLocation: true });
    fuseCache.set(ports, fuse);
  }
  const res = fuse.search(raw.trim());
  if (res.length > 0 && (res[0].score ?? 1) <= 0.12) return { code: res[0].item.code, name: res[0].item.name, method: "fuzzy" };
  return none;
}

/** Từ chung không mang nghĩa phân biệt cảng (bỏ khi so tên). */
const GENERIC_WORDS = new Set([
  "CANG", "PORT", "OF", "QUOC", "TE", "INTERNATIONAL", "INT", "L", "TERMINAL", "BEN", "CAU", "BERTH", "NO", "SO",
  "VIET", "NAM", "VIETNAM", "VN", "INDONESIA", "CHINA", "BRUNEI", "THAILAND", "MALAYSIA", "SINGAPORE", "PHILIPPINES",
  "TP", "CITY", "PROVINCE", "TINH", "KHU", "NEO", "ANCHORAGE", "P", "S", "PS",
]);

/** Khóa so sánh cảng: mã nếu tra được, không thì tên bỏ dấu, viết hoa, bỏ từ chung. */
export function portCompareKey(ports: PortEntry[], raw: string): string {
  const m = matchPort(ports, raw);
  if (m.code) return `CODE:${m.code.toUpperCase()}`;
  const words = keyOf(raw.replace(/\(.*?\)/g, " ")).split(" ").filter((w) => w && !GENERIC_WORDS.has(w) && !/^\d+$/.test(w));
  return `NAME:${words.join(" ") || keyOf(raw)}`;
}

/** Hai khóa cảng coi là cùng một nơi: bằng nhau, hoặc tên này chứa tên kia. */
export function samePortKey(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a.startsWith("NAME:") || !b.startsWith("NAME:")) return false;
  const x = a.slice(5);
  const y = b.slice(5);
  return x.length >= 3 && y.length >= 3 && (` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `));
}

export function searchPorts(ports: PortEntry[], query: string, limit = 30): PortEntry[] {
  const q = query.trim();
  if (!q) return ports.slice(0, limit);
  const key = keyOf(q);
  const direct = ports.filter((p) => keyOf(p.code).startsWith(key) || keyOf(p.name).includes(key) || (p.aliases ?? []).some((a) => keyOf(a).includes(key)));
  if (direct.length >= limit) return direct.slice(0, limit);
  let fuse = fuseCache.get(ports);
  if (!fuse) {
    fuse = new Fuse(ports, { keys: ["name", "aliases"], threshold: 0.25, includeScore: true, ignoreLocation: true });
    fuseCache.set(ports, fuse);
  }
  const fuzzy = fuse.search(q).map((r) => r.item);
  return [...direct, ...fuzzy.filter((p) => !direct.includes(p))].slice(0, limit);
}

export function isValidPortList(value: unknown): value is PortEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (p) =>
        typeof p === "object" &&
        p !== null &&
        typeof (p as PortEntry).code === "string" &&
        typeof (p as PortEntry).name === "string" &&
        ((p as PortEntry).aliases === undefined || (Array.isArray((p as PortEntry).aliases) && (p as PortEntry).aliases!.every((a) => typeof a === "string"))),
    )
  );
}
