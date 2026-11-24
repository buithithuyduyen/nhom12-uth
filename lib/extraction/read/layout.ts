/**
 * Dựng "bảng giả" từ các đoạn text có tọa độ:
 *  - groupIntoLines: gom theo trục y
 *  - detectColumns: gom theo trục x, ngăn cột bằng " | "
 */

export interface PositionedText {
  str: string;
  x: number;
  y: number; // trục y hướng xuống (tọa độ ảnh)
  w: number;
  h: number;
}

export function groupIntoLines(items: PositionedText[]): PositionedText[][] {
  const sorted = items.filter((i) => i.str.trim() !== "").sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: PositionedText[][] = [];
  let current: PositionedText[] = [];
  let currentY = 0;
  let currentH = 0;
  for (const item of sorted) {
    const tolerance = Math.max(2, Math.min(item.h || 10, currentH || 10) * 0.5);
    if (current.length === 0 || Math.abs(item.y - currentY) <= tolerance) {
      current.push(item);
      currentY = current.length === 1 ? item.y : (currentY * (current.length - 1) + item.y) / current.length;
      currentH = Math.max(currentH, item.h);
    } else {
      lines.push(current.sort((a, b) => a.x - b.x));
      current = [item];
      currentY = item.y;
      currentH = item.h;
    }
  }
  if (current.length) lines.push(current.sort((a, b) => a.x - b.x));
  return lines;
}

export function detectColumns(line: PositionedText[]): string[] {
  if (line.length === 0) return [];
  const cells: string[] = [];
  let buf = line[0].str;
  let right = line[0].x + line[0].w;
  for (let i = 1; i < line.length; i++) {
    const it = line[i];
    const gap = it.x - right;
    const charW = it.str.length > 0 ? it.w / Math.max(1, it.str.length) : it.h * 0.5;
    if (gap > Math.max(charW * 2.5, it.h * 1.2, 8)) {
      cells.push(buf.trim());
      buf = it.str;
    } else {
      const needsSpace = gap > charW * 0.25 && !buf.endsWith(" ") && !it.str.startsWith(" ");
      buf += (needsSpace ? " " : "") + it.str;
    }
    right = Math.max(right, it.x + it.w);
  }
  cells.push(buf.trim());
  return cells.filter((c) => c !== "");
}

export function linesToText(lines: PositionedText[][]): string {
  return lines
    .map((l) => detectColumns(l).join(" | "))
    .filter((s) => s.trim() !== "")
    .join("\n");
}

export function pageHeader(n: number): string {
  return `=== TRANG ${n} ===`;
}
