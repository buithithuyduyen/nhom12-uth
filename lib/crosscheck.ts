/**
 * lib/crosscheck.ts – ĐỐI CHIẾU CHÉO BẰNG CODE (không dùng AI). Dùng chung cho server và client:
 * khi người dùng chọn/sửa giá trị, client chạy lại cùng hàm để cảnh báo tự cập nhật.
 *
 * Chuẩn hóa trước khi so: ngày -> ISO; cảng -> mã qua data/ports.json (không có thì tên bỏ dấu, hoa);
 * container -> bỏ khoảng trắng, hoa; tên người -> bỏ dấu, hoa; số chuyến -> số + năm.
 */

import type { CrosscheckResult, Discrepancy, ExtractedInstance, FileRecord, SheetsData } from "@/lib/types";
import { SECTIONS } from "@/lib/mapping/nsw";
import { activeInstances, collectCandidates, collectVoyageCandidates, SECURITY_RULES, VOYAGE_RULES, type AggregateContext } from "@/lib/aggregate";
import { ageAt, canonicalText, compareDates, normalizeIdNumber, normalizeVoyageNo, parseDate, toIsoDate, type SimpleDate } from "@/lib/normalize";
import { portCompareKey, samePortKey } from "@/lib/ports";

const NOTICE_TARGET = "Notice ship to port + General Declaration";
/** Giá trị đánh dấu mục đã được người dùng xem và bỏ qua */
export const DISMISSED = "__dismissed__";

function voyageLabel(key: string): string {
  return SECTIONS.voyage.header.find((f) => f.key === key)?.label ?? key;
}

function isoOrNull(d: SimpleDate | null): string | null {
  return d ? toIsoDate(d) : null;
}

export function crosscheck(
  instances: ExtractedInstance[],
  files: FileRecord[],
  sheets: SheetsData,
  ctx: AggregateContext,
  resolvedValues: Record<string, string> = {},
): CrosscheckResult {
  const discrepancies: Discrepancy[] = [];
  let comparedGroups = 0;
  const active = activeInstances(instances, files);

  // -------------------------------------------------------------------------
  // 1) Trường N-1 có nhiều nguồn khác nhau
  // -------------------------------------------------------------------------
  const candidates = collectVoyageCandidates(active, ctx);
  for (const [field, list] of Object.entries(candidates)) {
    const rule = VOYAGE_RULES[field];
    if (!rule || rule.compare === false || list.length < 2) continue;
    comparedGroups++;
    // Gom các giá trị "giống nhau" thành nhóm (cảng: tên chứa nhau coi là một)
    const same = (a: string, b: string) => (rule.kind === "ports" ? a.split(";").every((x) => b.split(";").some((y) => samePortKey(x, y))) : a === b);
    const groups: string[] = [];
    for (const c of list) if (!groups.some((g) => same(g, c.compareKey) || same(c.compareKey, g))) groups.push(c.compareKey);
    const keys = groups;
    if (keys.length <= 1) continue;
    const id = `voyage:${field}`;
    const resolved = resolvedValues[id];
    const current = sheets.voyage.header[field]?.value ?? "";
    // Đã chọn: chỉ coi là xong khi giá trị hiện tại vẫn là giá trị đã chọn
    const isResolved = resolved !== undefined && resolved === current;
    discrepancies.push({
      id,
      field,
      label: voyageLabel(field),
      sheetTarget: NOTICE_TARGET,
      severity: "error",
      message: `${voyageLabel(field)}: các chứng từ ghi ${keys.length} giá trị khác nhau`,
      sources: list.map((c) => ({ fileName: c.fileName, page: c.page, value: c.display })),
      target: { section: "voyage", field },
      resolvedValue: isResolved ? resolved : undefined,
    });
  }

  // -------------------------------------------------------------------------
  // 1b) Trường N-1 của Declaration For Ship Security
  // -------------------------------------------------------------------------
  const secCandidates = collectCandidates(SECURITY_RULES, active, ctx);
  for (const [field, list] of Object.entries(secCandidates)) {
    const rule = SECURITY_RULES[field];
    if (!rule || rule.compare === false || list.length < 2) continue;
    comparedGroups++;
    const groups: string[] = [];
    for (const c of list) if (!groups.includes(c.compareKey)) groups.push(c.compareKey);
    if (groups.length <= 1) continue;
    const id = `security:${field}`;
    const label = SECTIONS.security.header.find((f) => f.key === field)?.label ?? field;
    const resolved = resolvedValues[id];
    const current = sheets.security?.header?.[field]?.value ?? "";
    discrepancies.push({
      id,
      field,
      label,
      sheetTarget: "Declaration For Ship Security",
      severity: "error",
      message: `${label}: các chứng từ ghi ${groups.length} giá trị khác nhau`,
      sources: list.map((c) => ({ fileName: c.fileName, page: c.page, value: c.display })),
      target: { section: "security", field },
      resolvedValue: resolved !== undefined && resolved === current ? resolved : undefined,
    });
  }

  // -------------------------------------------------------------------------
  // 2) Số chuyến khác nhau -> cảnh báo, không tự quyết
  // -------------------------------------------------------------------------
  const voyageNos: Array<{ key: string; value: string; fileName: string; page: number }> = [];
  for (const inst of active) {
    const v = inst.header.voyageNo?.value;
    const n = normalizeVoyageNo(v);
    if (v && n) voyageNos.push({ key: n.num, value: v, fileName: inst.fileName, page: inst.page });
  }
  if (voyageNos.length >= 2) {
    comparedGroups++;
    if (new Set(voyageNos.map((v) => v.key)).size > 1) {
      discrepancies.push({
        id: "voyageNo",
        field: "voyageNo",
        label: "Số chuyến",
        sheetTarget: NOTICE_TARGET,
        severity: "warning",
        message: "Số chuyến khác nhau giữa các chứng từ – hệ thống không tự quyết",
        sources: voyageNos.map((v) => ({ fileName: v.fileName, page: v.page, value: v.value })),
      });
    }
  }

  // -------------------------------------------------------------------------
  // 3) Cùng thuyền viên (theo số hộ chiếu) giữa các crew list: ngày sinh & ngày hết hạn phải trùng
  // -------------------------------------------------------------------------
  const crewLists = instances.filter((i) => i.docType === "crew_list");
  if (crewLists.length >= 2) {
    const byPassport = new Map<string, Array<{ inst: ExtractedInstance; dob: string | null; exp: string | null; dobRaw: string; expRaw: string; name: string }>>();
    for (const inst of crewLists) {
      for (const row of inst.tables.crew ?? []) {
        const pp = row.passportNo?.value ? normalizeIdNumber(row.passportNo.value) : "";
        if (!pp) continue;
        const arr = byPassport.get(pp) ?? [];
        arr.push({
          inst,
          dob: isoOrNull(parseDate(row.dateOfBirth?.value)),
          exp: isoOrNull(parseDate(row.passportExpiry?.value)),
          dobRaw: row.dateOfBirth?.value ?? "",
          expRaw: row.passportExpiry?.value ?? "",
          name: row.fullName?.value ?? "",
        });
        byPassport.set(pp, arr);
      }
    }
    for (const [pp, list] of byPassport) {
      if (list.length < 2) continue;
      comparedGroups++;
      const dobs = new Set(list.map((l) => l.dob ?? l.dobRaw));
      if (dobs.size > 1) {
        discrepancies.push({
          id: `crew-dob:${pp}`,
          field: "dateOfBirth",
          label: `Ngày sinh – hộ chiếu ${pp}`,
          sheetTarget: "Crew list",
          severity: "error",
          message: `Cùng số hộ chiếu ${pp} nhưng ngày sinh khác nhau giữa các crew list`,
          sources: list.map((l) => ({ fileName: l.inst.fileName, page: l.inst.page, value: l.dobRaw })),
          target: { section: "crew", table: "crew", column: "dateOfBirth", rowId: findCrewRowId(sheets, pp) },
          resolvedValue: crewResolved(sheets, resolvedValues, `crew-dob:${pp}`, pp, "dateOfBirth"),
        });
      }
      const exps = new Set(list.map((l) => l.exp ?? l.expRaw));
      if (exps.size > 1) {
        discrepancies.push({
          id: `crew-exp:${pp}`,
          field: "passportExpiry",
          label: `Ngày hết hạn HC – ${pp}`,
          sheetTarget: "Crew list",
          severity: "error",
          message: `Cùng số hộ chiếu ${pp} nhưng ngày hết hạn khác nhau giữa các crew list`,
          sources: list.map((l) => ({ fileName: l.inst.fileName, page: l.inst.page, value: l.expRaw })),
          target: { section: "crew", table: "crew", column: "passportExpiry", rowId: findCrewRowId(sheets, pp) },
          resolvedValue: crewResolved(sheets, resolvedValues, `crew-exp:${pp}`, pp, "passportExpiry"),
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4) Luật logic
  // -------------------------------------------------------------------------
  const v = sheets.voyage.header;
  const signDate = parseDate(v.signDate?.value) ?? parseDate(sheets.crew.header.signDate?.value);
  const arrival = parseDate(v.arrivalDeparture?.value);
  const refDate = signDate ?? arrival;

  // 4a) Năm hợp lý (±2 năm so với ngày ký) cho các mốc thời gian của chuyến
  if (refDate) {
    for (const key of ["arrivalDeparture", "berthingTime", "pilotOnBoard"]) {
      const d = parseDate(v[key]?.value);
      if (d && Math.abs(d.y - refDate.y) > 2) {
        discrepancies.push({
          id: `logic:year:${key}`,
          field: key,
          label: voyageLabel(key),
          sheetTarget: NOTICE_TARGET,
          severity: "warning",
          message: `Năm ${d.y} lệch quá 2 năm so với ngày ký (${refDate.y})`,
          sources: [{ fileName: v[key]?.source?.fileName ?? "Nhập tay", page: v[key]?.source?.page ?? 0, value: v[key]?.value ?? "" }],
          target: { section: "voyage", field: key },
        });
      }
    }
  }

  // 4b) Ngày đến <= ngày rời (trong từng chứng từ)
  for (const inst of active) {
    const a = parseDate(inst.header.arrivalTime?.value);
    const d = parseDate(inst.header.departureTime?.value);
    if (a && d && compareDates(a, d) > 0) {
      discrepancies.push({
        id: `logic:arr-dep:${inst.fileId}:${inst.page}`,
        field: "arrivalDeparture",
        label: `Thời gian đến/rời – ${inst.fileName}`,
        sheetTarget: NOTICE_TARGET,
        severity: "warning",
        message: "Trong cùng chứng từ, giờ đến sau giờ rời – kiểm tra xem có phải hai địa điểm khác nhau (vd. rời cầu rồi đến khu neo)",
        sources: [
          { fileName: inst.fileName, page: inst.page, value: `Đến: ${inst.header.arrivalTime?.value}` },
          { fileName: inst.fileName, page: inst.page, value: `Rời: ${inst.header.departureTime?.value}` },
        ],
        target: { section: "voyage", field: "arrivalDeparture" },
      });
    }
  }

  // 4c) Voyage memory: ngày đến <= ngày rời; năm hợp lý so với ngày ký của voyage memory
  for (const inst of active.filter((i) => i.docType === "voyage_memory")) {
    const vmSign = parseDate(inst.header.signDate?.value) ?? refDate;
    (inst.tables.portCalls ?? []).forEach((row, idx) => {
      const a = parseDate(row.arrivalDate?.value);
      const d = parseDate(row.departureDate?.value);
      const portName = row.port?.value ?? `dòng ${idx + 1}`;
      if (a && d && compareDates(a, d) > 0) {
        discrepancies.push({
          id: `logic:vm-order:${inst.fileId}:${inst.page}:${idx}`,
          field: "voyageMemory",
          label: `Voyage memory – ${portName}`,
          sheetTarget: "Voyage memory (đối chiếu)",
          severity: "error",
          message: "Ngày đến sau ngày rời",
          sources: [
            { fileName: inst.fileName, page: inst.page, value: `Đến ${row.arrivalDate?.value}` },
            { fileName: inst.fileName, page: inst.page, value: `Rời ${row.departureDate?.value}` },
          ],
        });
      }
      if (vmSign) {
        for (const [label, date, raw] of [
          ["ngày đến", a, row.arrivalDate?.value],
          ["ngày rời", d, row.departureDate?.value],
        ] as const) {
          if (date && Math.abs(date.y - vmSign.y) > 2) {
            discrepancies.push({
              id: `logic:vm-year:${inst.fileId}:${inst.page}:${idx}:${label}`,
              field: "voyageMemory",
              label: `Voyage memory – ${portName}`,
              sheetTarget: "Voyage memory (đối chiếu)",
              severity: "warning",
              message: `Năm của ${label} (${date.y}) lệch quá 2 năm so với ngày ký (${vmSign.y})`,
              sources: [{ fileName: inst.fileName, page: inst.page, value: raw ?? "" }],
            });
          }
        }
      }
    });
  }

  // 4d) Ngày vận đơn không sau ngày tàu rời cảng xếp (theo voyage memory)
  const vmRows = active.filter((i) => i.docType === "voyage_memory").flatMap((i) => (i.tables.portCalls ?? []).map((r) => ({ inst: i, r })));
  for (const bl of active.filter((i) => i.docType === "bill_of_lading")) {
    const blDate = parseDate(bl.header.blDate?.value);
    const pol = bl.header.loadingPort?.value;
    if (!blDate || !pol || vmRows.length === 0) continue;
    const polKey = portCompareKey(ctx.ports, pol);
    const call = [...vmRows].reverse().find((x) => x.r.port?.value && portCompareKey(ctx.ports, x.r.port.value) === polKey);
    const dep = parseDate(call?.r.departureDate?.value);
    if (call && dep) {
      comparedGroups++;
      if (compareDates(blDate, dep) > 0) {
        discrepancies.push({
          id: `logic:bl-date:${bl.fileId}:${bl.page}`,
          field: "blDate",
          label: `Ngày vận đơn ${bl.header.blNumber?.value ?? ""}`.trim(),
          sheetTarget: "Goods Declaration",
          severity: "error",
          message: "Ngày vận đơn sau ngày tàu rời cảng xếp",
          sources: [
            { fileName: bl.fileName, page: bl.page, value: bl.header.blDate?.value ?? "" },
            { fileName: call.inst.fileName, page: call.inst.page, value: `Rời ${call.r.port?.value}: ${call.r.departureDate?.value}` },
          ],
          target: { section: "goods", table: "bl" },
        });
      }
    }
  }

  // 4e) Thuyền viên: hộ chiếu hết hạn trước ngày đến (cảnh báo); tuổi 18-70
  const crewRef = arrival ?? signDate;
  for (const row of sheets.crew.tables.crew ?? []) {
    const name = `${row.cells.familyName?.value ?? ""} ${row.cells.givenName?.value ?? ""}`.trim() || "(không tên)";
    const exp = parseDate(row.cells.passportExpiry?.value);
    if (exp && crewRef && compareDates(exp, crewRef) <= 0) {
      discrepancies.push({
        id: `logic:pp-exp:${row.id}`,
        field: "passportExpiry",
        label: `Hộ chiếu – ${canonicalText(name)}`,
        sheetTarget: "Crew list",
        severity: "warning",
        message: `Hộ chiếu hết hạn (${row.cells.passportExpiry?.value}) trước/đúng ngày đến`,
        sources: [{ fileName: row.cells.passportExpiry?.source?.fileName ?? "Nhập tay", page: row.cells.passportExpiry?.source?.page ?? 0, value: row.cells.passportExpiry?.value ?? "" }],
        target: { section: "crew", table: "crew", rowId: row.id, column: "passportExpiry" },
      });
    }
    const dob = parseDate(row.cells.dateOfBirth?.value);
    const at = crewRef ?? null;
    if (dob && at) {
      const age = ageAt(dob, at);
      if (age < 18 || age > 70) {
        discrepancies.push({
          id: `logic:age:${row.id}`,
          field: "dateOfBirth",
          label: `Ngày sinh – ${canonicalText(name)}`,
          sheetTarget: "Crew list",
          severity: "warning",
          message: `Tuổi ${age} nằm ngoài khoảng hợp lý 18–70`,
          sources: [{ fileName: row.cells.dateOfBirth?.source?.fileName ?? "Nhập tay", page: row.cells.dateOfBirth?.source?.page ?? 0, value: row.cells.dateOfBirth?.value ?? "" }],
          target: { section: "crew", table: "crew", rowId: row.id, column: "dateOfBirth" },
        });
      }
    }
  }

  // 4f) Ghi chú cơ học từ bước bóc tách (thiếu dòng, tổng số crew...)
  for (const inst of active) {
    (inst.notes ?? []).forEach((note, idx) => {
      discrepancies.push({
        id: `note:${inst.fileId}:${inst.page}:${idx}`,
        field: "rows",
        label: `${inst.fileName} – trang ${inst.page}`,
        sheetTarget: inst.docType,
        severity: "warning",
        message: note,
        sources: [{ fileName: inst.fileName, page: inst.page, value: note }],
      });
    });
  }

  // Mục người dùng đã xem và bấm "bỏ qua"
  for (const d of discrepancies) {
    if (d.resolvedValue === undefined && resolvedValues[d.id] === DISMISSED) d.resolvedValue = DISMISSED;
  }
  return { discrepancies, comparedGroups };
}

/** Người dùng đã chọn giá trị cho ô crew và ô hiện vẫn giữ giá trị đó -> coi là đã xử lý. */
function crewResolved(sheets: SheetsData, resolved: Record<string, string>, id: string, passport: string, column: string): string | undefined {
  const chosen = resolved[id];
  if (chosen === undefined) return undefined;
  const row = sheets.crew.tables.crew?.find((r) => normalizeIdNumber(r.cells.passportNo?.value ?? "") === passport);
  return row?.cells[column]?.value === chosen ? chosen : undefined;
}

function findCrewRowId(sheets: SheetsData, passport: string): string | undefined {
  return sheets.crew.tables.crew?.find((r) => normalizeIdNumber(r.cells.passportNo?.value ?? "") === passport)?.id;
}

export function unresolvedCount(result: CrosscheckResult): number {
  return result.discrepancies.filter((d) => d.resolvedValue === undefined).length;
}

/** "Dữ liệu khớp" chỉ khi có ít nhất 2 nguồn được đối chiếu và không còn lệch. */
export function isAllMatched(result: CrosscheckResult): boolean {
  return result.comparedGroups > 0 && unresolvedCount(result) === 0;
}

export const VOYAGE_FIELDS_WITH_RULES = Object.keys(VOYAGE_RULES);
