/**
 * lib/aggregate.ts – CODE THUẦN (dùng được ở client và server)
 *
 * Tổng hợp kết quả bóc tách của các DocumentInstance đang bật thành dữ liệu các sheet:
 *  - 1-1: crew_list -> Crew list; ship_store -> Ship's store; bill_of_lading/cargo_manifest -> Goods Declaration (+ House B/L)
 *  - N-1: mọi chứng từ chuyến đi -> MỘT bộ "voyage" đổ vào cả Notice ship to port và General Declaration.
 * Mỗi trường giữ sourceFile + page. Trường người dùng đã sửa tay (userEdited) không bị ghi đè.
 */

import type {
  AppSettings,
  CodeTables,
  DocType,
  ExtractedInstance,
  FieldValue,
  FileRecord,
  Flag,
  PortEntry,
  SectionData,
  SectionKey,
  SheetsData,
  TableRow,
} from "@/lib/types";
import { emptySheets } from "@/lib/types";
import { SECTIONS, SIGNER_OPTIONS } from "@/lib/mapping/nsw";
import { matchCode, codeName } from "@/lib/codes";
import { matchPort, portCompareKey, samePortKey } from "@/lib/ports";
import {
  canonicalText,
  collapseSpaces,
  normalizeDate,
  normalizeDateTime,
  normalizeNumber,
  parseDate,
  splitName,
  toIsoDate,
} from "@/lib/normalize";

export interface AggregateContext {
  codes: CodeTables | null;
  ports: PortEntry[];
  settings: AppSettings;
}

// ---------------------------------------------------------------------------
// Tiện ích
// ---------------------------------------------------------------------------

let rowCounter = 0;
export function newRowId(): string {
  rowCounter = (rowCounter + 1) % 1_000_000;
  return `r${Date.now().toString(36)}${rowCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function flag(kind: Flag["kind"], message: string): Flag {
  return { kind, message };
}

/** Tạo FieldValue mới từ trường nguồn với giá trị đã chuẩn hóa, giữ nguồn và cờ. */
function derive(src: FieldValue | undefined, value: string, extra: Flag[] = []): FieldValue {
  return {
    value,
    raw: src?.raw ?? src?.value,
    confidence: src?.confidence,
    source: src?.source,
    sourceText: src?.sourceText,
    flags: [...(src?.flags ?? []), ...extra],
  };
}

function h(inst: ExtractedInstance | undefined, key: string): FieldValue | undefined {
  const f = inst?.header[key];
  return f && f.value && f.value.trim() ? f : undefined;
}

export function isInstanceActive(inst: ExtractedInstance, files: FileRecord[]): boolean {
  const file = files.find((f) => f.fileId === inst.fileId);
  if (!file || file.duplicateOf) return false;
  const page = file.pages.find((p) => p.page === inst.page);
  return !!page?.active;
}

export function activeInstances(instances: ExtractedInstance[], files: FileRecord[]): ExtractedInstance[] {
  const order = new Map(files.map((f, i) => [f.fileId, i]));
  return instances
    .filter((i) => isInstanceActive(i, files))
    .sort((a, b) => (order.get(a.fileId) ?? 0) - (order.get(b.fileId) ?? 0) || a.page - b.page);
}

const SIGNER_MAP: Record<string, string> = {
  MASTER: SIGNER_OPTIONS[0],
  CAPTAIN: SIGNER_OPTIONS[0],
  "THUYEN TRUONG": SIGNER_OPTIONS[0],
  AGENT: SIGNER_OPTIONS[1],
  "DAI LY": SIGNER_OPTIONS[1],
  OWNER: SIGNER_OPTIONS[2],
  "CHU TAU": SIGNER_OPTIONS[2],
};

function normalizeSigner(src: FieldValue | undefined): FieldValue | undefined {
  if (!src) return undefined;
  const key = canonicalText(src.value);
  const found = Object.entries(SIGNER_MAP).find(([k]) => key.includes(k));
  if (!found) return undefined;
  // Vai trò người ký do AI suy ra từ dòng ký -> không áp cờ "nguyên văn"
  return { ...derive(src, found[1]), raw: undefined, flags: [] };
}

// ---------------------------------------------------------------------------
// Chuẩn hóa theo loại trường
// ---------------------------------------------------------------------------

export function normalizePortsField(src: FieldValue, ports: PortEntry[], allowNames = false): FieldValue {
  const parts = src.value
    .split(/[;\n]+/)
    .map((p) => collapseSpaces(p))
    .filter(Boolean);
  const codes: string[] = [];
  const missing: string[] = [];
  for (const p of parts) {
    const m = matchPort(ports, p);
    if (m.code) codes.push(m.code);
    else missing.push(p);
  }
  if (missing.length > 0 && allowNames) {
    // Ô cho phép nhập tên cảng: ghi mã nếu có, không thì tên cảng theo chứng từ
    const mixed = parts.map((p) => matchPort(ports, p).code ?? canonicalText(p));
    return derive(src, mixed.join(";"), [
      flag("needsConfirm", `Chưa có mã cảng cho: ${missing.map((m) => `"${m}"`).join(", ")} – đang ghi tên cảng theo chứng từ (thêm mã vào data/ports.json)`),
    ]);
  }
  if (missing.length > 0) {
    return derive(src, "", [
      flag(
        "needsConfirm",
        ports.length === 0
          ? `Chưa có mã cảng (data/ports.json trống). Giá trị trong chứng từ: "${src.value}"`
          : `Không tìm thấy mã cảng cho: ${missing.map((m) => `"${m}"`).join(", ")} trong data/ports.json`,
      ),
    ]);
  }
  return derive(src, codes.join(";"));
}

function normalizeSingleCode(src: FieldValue | undefined, ctx: AggregateContext, type: Parameters<typeof matchCode>[1], label: string, allowed?: readonly string[]): FieldValue | undefined {
  if (!src) return undefined;
  const m = matchCode(ctx.codes, type, src.value);
  if (m.code && (!allowed || allowed.includes(m.code))) {
    const extra = m.method === "fuzzy" ? [flag("needsConfirm", `Mã ${label} "${m.code}" được gợi ý gần đúng từ "${src.value}"`)] : [];
    return derive(src, m.code, extra);
  }
  const hint = m.suggestions.length ? ` Gợi ý: ${m.suggestions.slice(0, 3).map((s) => `${s.code} (${s.name})`).join(", ")}` : "";
  return derive(src, "", [flag("needsConfirm", `Không có mã ${label} khớp chính xác với "${src.value}".${hint}`)]);
}

function normalizeDateField(src: FieldValue | undefined): FieldValue | undefined {
  if (!src) return undefined;
  const d = parseDate(src.value);
  if (!d) return derive(src, collapseSpaces(src.value), [flag("invalid", `Không đọc được ngày "${src.value}"`)]);
  return derive(src, normalizeDate(src.value));
}

function normalizeDateTimeField(src: FieldValue | undefined): FieldValue | undefined {
  if (!src) return undefined;
  const d = parseDate(src.value);
  if (!d) return derive(src, collapseSpaces(src.value), [flag("invalid", `Không đọc được ngày giờ "${src.value}"`)]);
  return derive(src, normalizeDateTime(src.value));
}

function normalizeNumberField(src: FieldValue | undefined): FieldValue | undefined {
  if (!src) return undefined;
  const n = normalizeNumber(src.value);
  if (!n) return derive(src, "", [flag("needsConfirm", `Không đọc được số từ "${src.value}"`)]);
  return derive(src, n);
}

function normalizeTextField(src: FieldValue | undefined): FieldValue | undefined {
  if (!src) return undefined;
  return derive(src, collapseSpaces(src.value));
}

// ---------------------------------------------------------------------------
// Ứng viên N-1 cho bộ "voyage"
// ---------------------------------------------------------------------------

export type VoyageFieldKind = "ports" | "datetime" | "date" | "number" | "text" | "signer";

interface SourceRule {
  docTypes: DocType[];
  key: string;
  when?: (inst: ExtractedInstance) => boolean;
}

interface VoyageFieldRule {
  kind: VoyageFieldKind;
  sources: SourceRule[];
  /** false: trường chữ tự do / khác nhau là bình thường -> không đối chiếu chéo */
  compare?: boolean;
}

const isArrival = (inst: ExtractedInstance) => {
  const v = canonicalText(inst.header.arrivalOrDeparture?.value ?? "");
  return v === "" || v.startsWith("ARR") || v.startsWith("DEN");
};

export const VOYAGE_RULES: Record<string, VoyageFieldRule> = {
  lastPorts: {
    kind: "ports",
    sources: [
      { docTypes: ["notice_of_arrival"], key: "lastPort" },
      { docTypes: ["port_clearance"], key: "port" },
      { docTypes: ["crew_list"], key: "lastPort" },
      { docTypes: ["health_declaration", "security_certificate", "other"], key: "lastPort" },
    ],
  },
  nextPorts: {
    kind: "ports",
    sources: [
      { docTypes: ["notice_of_arrival"], key: "port" },
      { docTypes: ["port_clearance"], key: "nextPort" },
      { docTypes: ["crew_list"], key: "port", when: isArrival },
      { docTypes: ["health_declaration", "crew_effects", "ship_store", "other"], key: "port" },
    ],
  },
  dischargePorts: {
    kind: "ports",
    sources: [
      { docTypes: ["notice_of_arrival"], key: "dischargePort" },
      { docTypes: ["cargo_manifest", "bill_of_lading"], key: "dischargePort" },
    ],
  },
  remainingCargo: { kind: "text", compare: false, sources: [{ docTypes: ["notice_of_arrival"], key: "remainingCargo" }] },
  draftForward: { kind: "number", sources: [{ docTypes: ["notice_of_arrival", "other", "port_clearance"], key: "draftForward" }] },
  draftAft: { kind: "number", sources: [{ docTypes: ["notice_of_arrival", "other", "port_clearance"], key: "draftAft" }] },
  airDraft: { kind: "number", sources: [{ docTypes: ["notice_of_arrival", "ship_particulars"], key: "airDraft" }] },
  remarks: { kind: "text", compare: false, sources: [{ docTypes: ["notice_of_arrival"], key: "remarks" }] },
  wasteRequest: { kind: "text", compare: false, sources: [{ docTypes: ["notice_of_arrival"], key: "wasteRequest" }] },
  berthPosition: { kind: "text", compare: false, sources: [{ docTypes: ["notice_of_arrival", "other"], key: "berthPosition" }] },
  tugboat: { kind: "text", compare: false, sources: [{ docTypes: ["notice_of_arrival", "other"], key: "tugboat" }] },
  portClearanceNo: { kind: "text", sources: [{ docTypes: ["port_clearance"], key: "portClearanceNo" }] },
  arrivalDeparture: {
    kind: "datetime",
    sources: [
      { docTypes: ["notice_of_arrival", "other"], key: "arrivalTime" },
      { docTypes: ["crew_list"], key: "date", when: isArrival },
      { docTypes: ["health_declaration", "crew_effects", "security_certificate"], key: "arrivalTime" },
    ],
  },
  berthingTime: { kind: "datetime", sources: [{ docTypes: ["other", "notice_of_arrival"], key: "berthingTime" }] },
  pilotOnBoard: { kind: "datetime", sources: [{ docTypes: ["other", "notice_of_arrival"], key: "pilotOnBoardTime" }] },
  fuelDO: { kind: "number", sources: [{ docTypes: ["notice_of_arrival", "other"], key: "fuelDO" }] },
  fuelFO: { kind: "number", sources: [{ docTypes: ["notice_of_arrival", "other"], key: "fuelFO" }] },
  freshWater: { kind: "number", sources: [{ docTypes: ["notice_of_arrival", "other"], key: "freshWater" }] },
  signPlace: { kind: "text", compare: false, sources: [{ docTypes: ["notice_of_arrival"], key: "signPlace" }] },
  signDate: { kind: "date", compare: false, sources: [{ docTypes: ["notice_of_arrival"], key: "signDate" }] },
  signedBy: { kind: "signer", compare: false, sources: [{ docTypes: ["notice_of_arrival"], key: "signerRole" }] },
};

export interface VoyageCandidate {
  field: FieldValue;
  docType: DocType;
  fileName: string;
  page: number;
  /** Khóa so sánh đã chuẩn hóa (ISO, mã cảng, số...) */
  compareKey: string;
  /** Giá trị hiển thị cho người dùng chọn */
  display: string;
}

function compareKeyFor(kind: VoyageFieldKind, raw: string, ports: PortEntry[]): string {
  switch (kind) {
    case "ports":
      return raw
        .split(/[;\n]+/)
        .map((p) => collapseSpaces(p))
        .filter(Boolean)
        .map((p) => portCompareKey(ports, p))
        .sort()
        .join(";");
    case "date":
    case "datetime": {
      const d = parseDate(raw);
      return d ? toIsoDate(d) : canonicalText(raw);
    }
    case "number": {
      const n = normalizeNumber(raw);
      return n ? String(parseFloat(n)) : canonicalText(raw);
    }
    default:
      return canonicalText(raw);
  }
}

function normalizeVoyageField(kind: VoyageFieldKind, src: FieldValue, ctx: AggregateContext): FieldValue | undefined {
  switch (kind) {
    case "ports":
      return normalizePortsField(src, ctx.ports, true);
    case "datetime":
      return normalizeDateTimeField(src);
    case "date":
      return normalizeDateField(src);
    case "number":
      return normalizeNumberField(src);
    case "signer":
      return normalizeSigner(src);
    default:
      return normalizeTextField(src);
  }
}

/** Chuẩn hóa một giá trị ứng viên (khi người dùng chọn giá trị từ nguồn xung đột). */
export function normalizeVoyageCandidate(fieldKey: string, src: FieldValue, ctx: AggregateContext): FieldValue {
  const rule = VOYAGE_RULES[fieldKey];
  if (!rule) return { ...src };
  const out = normalizeVoyageField(rule.kind, src, ctx) ?? { ...src, value: "" };
  // Người dùng chủ động chọn cảng nhưng chưa có mã -> ghi TÊN cảng như trên chứng từ (ô template cho phép nhập tên cảng)
  if (rule.kind === "ports" && !out.value && src.value.trim()) {
    return {
      ...out,
      value: canonicalText(src.value),
      flags: [{ kind: "needsConfirm", message: "Chưa có mã cảng trong data/ports.json – đang ghi tên cảng theo chứng từ" }],
    };
  }
  return out;
}

/** Cảng trước suy ra từ voyage memory: dòng ngay trước cảng hiện tại. */
function lastPortFromVoyageMemory(instances: ExtractedInstance[], currentPortRaw: string | null, ports: PortEntry[]): FieldValue | undefined {
  if (!currentPortRaw) return undefined;
  const currentKey = compareKeyFor("ports", currentPortRaw, ports);
  const same = (raw: string) => {
    const k = compareKeyFor("ports", raw, ports);
    return k.split(";").every((x) => currentKey.split(";").some((y) => samePortKey(x, y)));
  };
  for (const inst of instances.filter((i) => i.docType === "voyage_memory")) {
    const rows = (inst.tables.portCalls ?? []).filter((r) => r.port?.value);
    if (rows.length === 0) continue;
    const last = rows[rows.length - 1];
    // Voyage memory đã ghi cả cảng hiện tại ở dòng cuối -> cảng trước là dòng kề trên
    if (same(last.port!.value)) return rows.length > 1 ? rows[rows.length - 2].port : undefined;
    // Chưa ghi cảng hiện tại -> dòng cuối chính là cảng vừa rời (KHÔNG lấy lần ghé cũ cùng tên ở giữa bảng)
    return last.port;
  }
  return undefined;
}

export function collectVoyageCandidates(active: ExtractedInstance[], ctx: AggregateContext): Record<string, VoyageCandidate[]> {
  const out: Record<string, VoyageCandidate[]> = {};
  for (const [fieldKey, rule] of Object.entries(VOYAGE_RULES)) {
    const list: VoyageCandidate[] = [];
    for (const src of rule.sources) {
      for (const inst of active) {
        if (!src.docTypes.includes(inst.docType)) continue;
        if (src.when && !src.when(inst)) continue;
        const f = h(inst, src.key);
        if (!f) continue;
        list.push({
          field: f,
          docType: inst.docType,
          fileName: inst.fileName,
          page: inst.page,
          compareKey: compareKeyFor(rule.kind, f.value, ctx.ports),
          display: f.value,
        });
      }
    }
    out[fieldKey] = list;
  }
  // Cảng trước từ voyage memory
  const current = out.nextPorts?.[0]?.field.value ?? null;
  const vm = lastPortFromVoyageMemory(active, current, ctx.ports);
  if (vm?.source) {
    out.lastPorts.push({
      field: vm,
      docType: "voyage_memory",
      fileName: vm.source.fileName,
      page: vm.source.page,
      compareKey: compareKeyFor("ports", vm.value, ctx.ports),
      display: vm.value,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Ứng viên N-1 cho "Declaration For Ship Security"
// ---------------------------------------------------------------------------

export const SECURITY_RULES: Record<string, VoyageFieldRule> = {
  purposeDetail: { kind: "text", compare: false, sources: [{ docTypes: ["notice_of_arrival"], key: "purposeOfCall" }] },
  isscIssuer: { kind: "text", compare: false, sources: [{ docTypes: ["security_certificate"], key: "issuedBy" }] },
  isscIssueDate: { kind: "date", sources: [{ docTypes: ["security_certificate"], key: "issueDate" }] },
  isscExpiryDate: { kind: "date", sources: [{ docTypes: ["security_certificate"], key: "expiryDate" }] },
  securityLevel: { kind: "number", sources: [{ docTypes: ["notice_of_arrival", "security_certificate"], key: "securityLevel" }] },
  latitude: { kind: "text", compare: false, sources: [{ docTypes: ["notice_of_arrival", "security_certificate"], key: "latitude" }] },
  longitude: { kind: "text", compare: false, sources: [{ docTypes: ["notice_of_arrival", "security_certificate"], key: "longitude" }] },
  eta: {
    kind: "datetime",
    compare: false, // cùng nguồn với "Thời gian đến/rời" của General Declaration (đã đối chiếu ở đó)
    sources: [
      { docTypes: ["notice_of_arrival", "other"], key: "arrivalTime" },
      { docTypes: ["security_certificate", "health_declaration", "crew_effects"], key: "arrivalTime" },
    ],
  },
  signPlace: { kind: "text", compare: false, sources: [{ docTypes: ["notice_of_arrival"], key: "signPlace" }] },
  signDate: { kind: "date", compare: false, sources: [{ docTypes: ["notice_of_arrival"], key: "signDate" }] },
  signedBy: { kind: "signer", compare: false, sources: [{ docTypes: ["notice_of_arrival"], key: "signerRole" }] },
};

/** Thu thập ứng viên theo bộ luật bất kỳ (dùng cho Ship Security). */
export function collectCandidates(rules: Record<string, VoyageFieldRule>, active: ExtractedInstance[], ctx: AggregateContext): Record<string, VoyageCandidate[]> {
  const out: Record<string, VoyageCandidate[]> = {};
  for (const [fieldKey, rule] of Object.entries(rules)) {
    const list: VoyageCandidate[] = [];
    for (const src of rule.sources) {
      for (const inst of active) {
        if (!src.docTypes.includes(inst.docType)) continue;
        if (src.when && !src.when(inst)) continue;
        const f = h(inst, src.key);
        if (!f) continue;
        list.push({ field: f, docType: inst.docType, fileName: inst.fileName, page: inst.page, compareKey: compareKeyFor(rule.kind, f.value, ctx.ports), display: f.value });
      }
    }
    out[fieldKey] = list;
  }
  return out;
}

/** Chuẩn hóa giá trị ứng viên cho Ship Security (khi người dùng chọn giá trị từ nguồn xung đột). */
export function normalizeSecurityCandidate(fieldKey: string, src: FieldValue, ctx: AggregateContext): FieldValue {
  const rule = SECURITY_RULES[fieldKey];
  if (!rule) return { ...src };
  return normalizeVoyageField(rule.kind, src, ctx) ?? { ...src, value: "" };
}

function buildSecurity(active: ExtractedInstance[], ctx: AggregateContext): SectionData {
  const section: SectionData = { header: {}, tables: { portCalls: [] } };
  const candidates = collectCandidates(SECURITY_RULES, active, ctx);
  for (const [fieldKey, rule] of Object.entries(SECURITY_RULES)) {
    const list = candidates[fieldKey] ?? [];
    if (list.length === 0) continue;
    const chosen = normalizeVoyageField(rule.kind, list[0].field, ctx);
    if (chosen) section.header[fieldKey] = chosen;
  }

  // Cấp độ an ninh chỉ nhận 1/2/3
  const lvl = section.header.securityLevel;
  if (lvl) {
    const d = /[123]/.exec(lvl.value)?.[0] ?? "";
    section.header.securityLevel = d ? { ...lvl, value: d } : { ...lvl, value: "", flags: [...(lvl.flags ?? []), flag("needsConfirm", `Không đọc được cấp độ an ninh từ "${lvl.raw ?? lvl.value}"`)] };
  }

  // Mã mục đích đến cảng: chỉ khi khớp danh mục; không thì để trống kèm gợi ý
  const purpose = section.header.purposeDetail;
  if (purpose) {
    const m = matchCode(ctx.codes, "portPurpose", purpose.value);
    if (m.code) section.header.purposeCode = derive(purpose, m.code, [flag("needsConfirm", `Mã mục đích gợi ý từ "${purpose.value}"`)]);
    else
      section.header.purposeCode = derive(purpose, "", [
        flag("needsConfirm", `Chọn mã mục đích đến cảng cho "${purpose.value}"${m.suggestions.length ? `. Gợi ý: ${m.suggestions.slice(0, 3).map((s) => `${s.code} (${s.name})`).join(", ")}` : ""}`),
      ]);
    section.header.purposeCode.raw = undefined;
  }

  // Có ISSC: chỉ "Yes" khi trong các chứng từ upload có giấy ISSC
  const issc = active.find((i) => i.docType === "security_certificate" && (h(i, "certificateNo") || h(i, "issueDate") || h(i, "expiryDate")));
  if (issc) {
    const src = h(issc, "certificateNo") ?? h(issc, "issueDate") ?? h(issc, "expiryDate");
    section.header.hasIssc = { ...derive(src, "Yes", [flag("needsConfirm", "Có giấy chứng nhận ISSC trong chứng từ đã upload")]), raw: undefined };
  }

  // 10 cảng ghé gần nhất: từ Voyage memory (bản cuối cùng đang dùng)
  const vm = [...active].reverse().find((i) => i.docType === "voyage_memory" && (i.tables.portCalls ?? []).length > 0);
  if (vm) {
    const rows = (vm.tables.portCalls ?? []).slice(-10);
    for (const r of rows) {
      const cells: Record<string, FieldValue> = {};
      if (r.port) {
        const m = matchPort(ctx.ports, r.port.value);
        cells.portCode = m.code
          ? derive(r.port, m.code)
          : { ...derive(r.port, "", [flag("needsConfirm", `Chưa có mã cảng cho "${r.port.value}" (thêm vào data/ports.json)`)]), raw: undefined };
        cells.portName = derive(r.port, canonicalText(r.port.value));
      }
      const a = normalizeDateField(r.arrivalDate);
      if (a) cells.arrivalDate = a;
      const d = normalizeDateField(r.departureDate);
      if (d) cells.departureDate = d;
      if (Object.keys(cells).length > 0) section.tables.portCalls.push({ id: newRowId(), cells });
    }
  }
  return section;
}

// ---------------------------------------------------------------------------
// Dựng từng section
// ---------------------------------------------------------------------------

function buildVoyage(active: ExtractedInstance[], ctx: AggregateContext): SectionData {
  const section: SectionData = { header: {}, tables: { waste: [], cargo: [] } };
  const candidates = collectVoyageCandidates(active, ctx);
  for (const [fieldKey, rule] of Object.entries(VOYAGE_RULES)) {
    const list = candidates[fieldKey] ?? [];
    if (list.length === 0) continue;
    const chosen = normalizeVoyageField(rule.kind, list[0].field, ctx);
    if (chosen) section.header[fieldKey] = chosen;
  }

  // Số lượng tờ khai đi kèm: tính từ chứng từ đã upload (cần người dùng xác nhận)
  const has = (types: DocType[]) => active.some((i) => types.includes(i.docType));
  const countFlag = [flag("needsConfirm", "Tính từ các chứng từ đã upload – kiểm tra lại")];
  const setCount = (key: string, types: DocType[]) => {
    if (has(types)) section.header[key] = { value: "1", flags: countFlag };
  };
  setCount("qtyCargoDecl", ["cargo_manifest", "bill_of_lading"]);
  setCount("qtyStoresDecl", ["ship_store"]);
  setCount("qtyCrewList", ["crew_list"]);
  setCount("qtyCrewEffects", ["crew_effects"]);
  setCount("qtyHealthDecl", ["health_declaration"]);

  // Bảng hàng hóa
  const cargoRows: TableRow[] = [];
  const pushCargo = (desc: FieldValue | undefined, qty: FieldValue | undefined, unit: FieldValue | undefined) => {
    if (!desc && !qty) return;
    const goods = desc ? matchCode(ctx.codes, "goods", desc.value) : null;
    const cells: Record<string, FieldValue> = {};
    if (desc) cells.description = derive(desc, collapseSpaces(desc.value));
    if (goods?.code) {
      cells.goodsCode = derive(desc, goods.code);
      cells.goodsName = derive(desc, codeName(ctx.codes, "goods", goods.code));
    } else if (desc) {
      const hint = goods?.suggestions.length ? ` Gợi ý: ${goods.suggestions.slice(0, 3).map((s) => `${s.code} (${s.name})`).join(", ")}` : "";
      cells.goodsCode = derive(desc, "", [flag("needsConfirm", `Chọn mã hàng cho "${desc.value}".${hint}`)]);
    }
    const q = normalizeNumberField(qty);
    if (q) cells.quantity = q;
    const u = normalizeSingleCode(unit, ctx, "unit", "đơn vị", ["TNE", "OCE", "TEU", "UNC"]);
    if (u) cells.unit = u;
    cargoRows.push({ id: newRowId(), cells });
  };
  const notices = active.filter((i) => i.docType === "notice_of_arrival" || i.docType === "other");
  for (const n of notices) {
    for (const row of n.tables.cargo ?? []) pushCargo(row.description, row.quantity, row.unit);
  }
  if (cargoRows.length === 0) {
    const n = notices.find((i) => h(i, "cargoDescription"));
    if (n) pushCargo(h(n, "cargoDescription"), h(n, "cargoQuantity"), h(n, "cargoUnit"));
  }
  if (cargoRows.length === 0) {
    for (const bl of active.filter((i) => i.docType === "bill_of_lading")) pushCargo(h(bl, "description"), h(bl, "grossWeight"), h(bl, "weightUnit"));
  }
  section.tables.cargo = cargoRows;
  return section;
}

function buildCrew(active: ExtractedInstance[], ctx: AggregateContext): SectionData {
  const section: SectionData = { header: {}, tables: { crew: [] } };
  const crewList = active.find((i) => i.docType === "crew_list");
  if (!crewList) return section;
  const sp = normalizeTextField(h(crewList, "signPlace"));
  if (sp) section.header.signPlace = sp;
  const sd = normalizeDateField(h(crewList, "signDate"));
  if (sd) section.header.signDate = sd;
  const sb = normalizeSigner(h(crewList, "signerRole"));
  if (sb) section.header.signedBy = sb;

  for (const r of crewList.tables.crew ?? []) {
    const cells: Record<string, FieldValue> = {};
    if (r.fullName) {
      // NSW: họ tên in hoa, không dấu (AI đôi khi tự thêm dấu tiếng Việt)
      const { familyName, givenName } = splitName(canonicalText(r.fullName.value), ctx.settings.nameSplitRule);
      cells.familyName = derive(r.fullName, familyName);
      cells.givenName = derive(r.fullName, givenName);
    }
    if (r.rank) {
      const m = matchCode(ctx.codes, "rank", r.rank.value);
      cells.rank = m.code
        ? derive(r.rank, m.code)
        : derive(r.rank, "", [flag("needsConfirm", `Chức danh "${r.rank.value}" không có trong bảng alias – chọn mã chức danh`)]);
    }
    const nat = normalizeSingleCode(r.nationality, ctx, "country", "quốc gia");
    if (nat) cells.nationality = nat;
    const dob = normalizeDateField(r.dateOfBirth);
    if (dob) cells.dateOfBirth = dob;
    if (r.placeOfBirth) cells.placeOfBirth = derive(r.placeOfBirth, canonicalText(r.placeOfBirth.value));
    if (r.passportNo) cells.passportNo = derive(r.passportNo, r.passportNo.value.replace(/\s+/g, "").toUpperCase());
    const exp = normalizeDateField(r.passportExpiry);
    if (exp) cells.passportExpiry = exp;
    if (r.gender) {
      const g = canonicalText(r.gender.value);
      if (/^(M|MALE|NAM)$/.test(g)) cells.gender = derive(r.gender, "Nam/Man");
      else if (/^(F|FEMALE|NU)$/.test(g)) cells.gender = derive(r.gender, "Nữ/Woman");
    }
    // Loại hộ chiếu: CHỈ khi chứng từ ghi rõ loại giấy tờ ở tiêu đề cột (không đoán)
    if (r.passportNo) {
      const docType = canonicalText(crewList.header.idDocumentType?.value ?? "");
      let code = "";
      let why = "";
      if (docType.startsWith("SEAMAN")) {
        code = "4";
        why = "Chứng từ ghi sổ/hộ chiếu thuyền viên";
      } else if (docType.startsWith("PASSPORT")) {
        code = "1";
        why = "Chứng từ ghi Passport No";
      }
      if (code && matchCode(ctx.codes, "passportType", code).code) {
        cells.passportType = { ...derive(r.passportNo, code, [flag("needsConfirm", `${why} – kiểm tra lại`)]), raw: undefined };
      }
    }
    if (Object.keys(cells).length > 0) section.tables.crew.push({ id: newRowId(), cells });
  }
  return section;
}

function buildStore(active: ExtractedInstance[], ctx: AggregateContext): SectionData {
  const section: SectionData = { header: {}, tables: { items: [] } };
  const store = active.find((i) => i.docType === "ship_store");
  if (!store) return section;
  const pob = normalizeNumberField(h(store, "personsOnBoard"));
  if (pob) section.header.personsOnBoard = pob;
  const pos = normalizeNumberField(h(store, "periodOfStay"));
  if (pos) section.header.periodOfStay = pos;
  const sp = normalizeTextField(h(store, "signPlace"));
  if (sp) section.header.signPlace = sp;
  const sd = normalizeDateField(h(store, "signDate"));
  if (sd) section.header.signDate = sd;
  const sb = normalizeSigner(h(store, "signerRole"));
  if (sb) section.header.signedBy = sb;
  for (const r of store.tables.items ?? []) {
    const cells: Record<string, FieldValue> = {};
    const name = normalizeTextField(r.name);
    if (name) cells.name = name;
    const q = normalizeNumberField(r.quantity);
    if (q) cells.quantity = q;
    const u = normalizeSingleCode(r.unit, ctx, "unit", "đơn vị");
    if (u) cells.unit = u;
    const loc = normalizeTextField(r.location);
    if (loc) cells.location = loc;
    if (Object.keys(cells).length > 0) section.tables.items.push({ id: newRowId(), cells });
  }
  return section;
}

function portCell(src: FieldValue | undefined, ctx: AggregateContext): FieldValue | undefined {
  if (!src) return undefined;
  return normalizePortsField(src, ctx.ports);
}

function buildGoods(active: ExtractedInstance[], ctx: AggregateContext): SectionData {
  const section: SectionData = { header: {}, tables: { bl: [] } };
  const bls = active.filter((i) => i.docType === "bill_of_lading");
  const seen = new Set<string>();
  let packagesSum = 0;
  let packagesKnown = true;
  let packageKind: FieldValue | undefined;

  const baseCells = (src: Record<string, FieldValue | undefined>): Record<string, FieldValue> => {
    const cells: Record<string, FieldValue> = {};
    const put = (k: string, v: FieldValue | undefined) => {
      if (v) cells[k] = v;
    };
    put("blNumber", src.blNumber ? derive(src.blNumber, src.blNumber.value.trim()) : undefined);
    put("shipper", normalizeTextField(src.shipper));
    put("consignee", normalizeTextField(src.consignee));
    put("notifyParty", normalizeTextField(src.notifyParty));
    put("notifyParty2", normalizeTextField(src.notifyParty2));
    put("containerNo", src.containerNo ? derive(src.containerNo, src.containerNo.value.replace(/\s+/g, "").toUpperCase()) : undefined);
    put("sealNo", normalizeTextField(src.sealNo));
    put("hsCode", normalizeTextField(src.hsCode));
    put("description", normalizeTextField(src.description));
    put("netWeight", normalizeNumberField(src.netWeight));
    put("grossWeight", normalizeNumberField(src.grossWeight));
    put("measurement", normalizeNumberField(src.measurement));
    put("weightUnit", normalizeSingleCode(src.weightUnit, ctx, "unit", "đơn vị"));
    put("measurementUnit", normalizeSingleCode(src.measurementUnit, ctx, "unit", "đơn vị"));
    put("dischargePort", portCell(src.dischargePort, ctx));
    put("loadingPort", portCell(src.loadingPort, ctx));
    put("transhipmentPort", portCell(src.transhipmentPort, ctx));
    put("finalDestination", portCell(src.finalDestination ?? src.placeOfDelivery, ctx));
    put("containerType", normalizeSingleCode(src.containerType, ctx, "containerType", "loại container"));
    return cells;
  };

  for (const bl of bls) {
    const hdr: Record<string, FieldValue | undefined> = {};
    for (const k of Object.keys(bl.header)) hdr[k] = h(bl, k);
    const key = canonicalText(hdr.blNumber?.value ?? `${bl.fileId}-${bl.page}`);
    if (seen.has(key)) continue;
    seen.add(key);
    const containers = bl.tables.containers ?? [];
    if (containers.length > 1) {
      for (const c of containers) {
        section.tables.bl.push({ id: newRowId(), cells: baseCells({ ...hdr, ...c }) });
      }
    } else {
      section.tables.bl.push({ id: newRowId(), cells: baseCells({ ...hdr, ...(containers[0] ?? {}) }) });
    }
    const pk = normalizeNumber(hdr.packages?.value ?? "");
    if (pk) packagesSum += parseFloat(pk);
    else packagesKnown = false;
    packageKind ??= hdr.packageKind;
  }
  for (const m of active.filter((i) => i.docType === "cargo_manifest")) {
    for (const item of m.tables.items ?? []) {
      const key = canonicalText(item.blNumber?.value ?? "");
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      const src: Record<string, FieldValue | undefined> = { ...item };
      src.loadingPort ??= h(m, "loadingPort");
      src.dischargePort ??= h(m, "dischargePort");
      section.tables.bl.push({ id: newRowId(), cells: baseCells(src) });
      const pk = normalizeNumber(item.packages?.value ?? "");
      if (pk) packagesSum += parseFloat(pk);
      else packagesKnown = false;
      packageKind ??= item.packageKind;
    }
  }
  if (section.tables.bl.length > 0 && packagesKnown && packagesSum > 0) {
    section.header.totalPackages = { value: String(packagesSum), flags: [flag("needsConfirm", "Tổng số kiện cộng từ các vận đơn")] };
  }
  const pk = normalizeSingleCode(packageKind, ctx, "packageType", "loại kiện");
  if (pk) section.header.packageKind = pk;
  return section;
}

function buildHbl(active: ExtractedInstance[], ctx: AggregateContext): SectionData {
  const section: SectionData = { header: {}, tables: { lines: [] } };
  const hbl = active.find((i) => i.docType === "bill_of_lading" && /^(Y|YES|CO|TRUE)/.test(canonicalText(i.header.isHouseBl?.value ?? "")));
  if (!hbl) return section;
  const put = (k: string, v: FieldValue | undefined) => {
    if (v) section.header[k] = v;
  };
  section.header.seq = { value: "1" };
  put("shipper", normalizeTextField(h(hbl, "shipper")));
  put("consignee", normalizeTextField(h(hbl, "consignee")));
  put("notifyParty", normalizeTextField(h(hbl, "notifyParty")));
  put("notifyParty2", normalizeTextField(h(hbl, "notifyParty2")));
  put("transhipmentPort", portCell(h(hbl, "transhipmentPort"), ctx));
  put("finalDestination", portCell(h(hbl, "finalDestination"), ctx));
  put("loadingPort", portCell(h(hbl, "loadingPort"), ctx));
  put("dischargePort", portCell(h(hbl, "dischargePort"), ctx));
  put("placeOfDelivery", normalizeTextField(h(hbl, "placeOfDelivery")));
  put("hblNumber", normalizeTextField(h(hbl, "blNumber")));
  put("hblDate", normalizeDateField(h(hbl, "blDate")));
  put("masterBlNumber", normalizeTextField(h(hbl, "masterBlNumber")));
  put("departureDate", normalizeDateField(h(hbl, "shippedOnBoardDate")));
  put("packages", normalizeNumberField(h(hbl, "packages")));
  put("packageKind", normalizeSingleCode(h(hbl, "packageKind"), ctx, "packageType", "loại kiện"));
  put("grossWeight", normalizeNumberField(h(hbl, "grossWeight")));
  put("grossWeightUnit", normalizeSingleCode(h(hbl, "weightUnit"), ctx, "unit", "đơn vị", ["KGM", "TNE"]));
  const containers = hbl.tables.containers ?? [];
  const rows = containers.length > 0 ? containers : [{}];
  for (const c of rows) {
    const cells: Record<string, FieldValue> = {};
    const desc = normalizeTextField(c.description ?? h(hbl, "description"));
    if (desc) cells.description = desc;
    const hs = normalizeTextField(h(hbl, "hsCode"));
    if (hs) cells.hsCode = hs;
    const gw = normalizeNumberField(c.grossWeight ?? h(hbl, "grossWeight"));
    if (gw) cells.grossWeight = gw;
    const ms = normalizeNumberField(c.measurement ?? h(hbl, "measurement"));
    if (ms) cells.measurement = ms;
    const cn = c.containerNo ?? h(hbl, "containerNo");
    if (cn) cells.containerNo = derive(cn, cn.value.replace(/\s+/g, "").toUpperCase());
    const sn = normalizeTextField(c.sealNo ?? h(hbl, "sealNo"));
    if (sn) cells.sealNo = sn;
    if (Object.keys(cells).length > 0) section.tables.lines.push({ id: newRowId(), cells });
  }
  return section;
}

// ---------------------------------------------------------------------------
// Gộp với dữ liệu cũ (giữ phần người dùng đã sửa)
// ---------------------------------------------------------------------------

/** Khóa nhận diện một dòng (để khớp dòng cũ/mới khi tổng hợp lại). */
function rowKey(row: TableRow): string {
  for (const k of ["passportNo", "blNumber", "containerNo", "name", "description", "goodsCode", "wasteType"]) {
    const v = row.cells[k]?.value;
    if (v && v.trim()) return `${k}:${canonicalText(v)}`;
  }
  const fam = row.cells.familyName?.value ?? "";
  const giv = row.cells.givenName?.value ?? "";
  return fam || giv ? `name:${canonicalText(`${fam} ${giv}`)}` : "";
}

/**
 * Gộp dòng ở mức Ô: dòng mới từ chứng từ được cập nhật, nhưng ô người dùng đã sửa tay được giữ nguyên.
 * Dòng người dùng tự thêm (không khớp dòng nào từ chứng từ) được giữ ở cuối bảng.
 */
function mergeRows(fresh: TableRow[], previous: TableRow[]): TableRow[] {
  const prevByKey = new Map<string, TableRow>();
  for (const r of previous) {
    const k = rowKey(r);
    if (k && !prevByKey.has(k)) prevByKey.set(k, r);
  }
  const used = new Set<TableRow>();
  const out: TableRow[] = fresh.map((row) => {
    const prev = prevByKey.get(rowKey(row));
    if (!prev) return row;
    used.add(prev);
    const cells = { ...row.cells };
    for (const [k, v] of Object.entries(prev.cells)) if (v.userEdited) cells[k] = v;
    return { ...row, id: prev.id, cells };
  });
  for (const r of previous) {
    if (used.has(r)) continue;
    const manual = Object.values(r.cells).some((c) => c.userEdited) && !Object.values(r.cells).some((c) => c.source);
    if (manual) out.push(r);
  }
  return out;
}

function mergeSection(fresh: SectionData, previous: SectionData | undefined, key: SectionKey): SectionData {
  const def = SECTIONS[key];
  const out: SectionData = { header: { ...fresh.header }, tables: { ...fresh.tables } };
  if (previous) {
    for (const [k, v] of Object.entries(previous.header)) {
      if (v.userEdited) out.header[k] = v;
    }
    for (const t of def.tables) {
      out.tables[t.key] = mergeRows(fresh.tables[t.key] ?? [], previous.tables[t.key] ?? []);
    }
  }
  for (const f of def.header) {
    if (f.defaultValue && !(out.header[f.key]?.value ?? "").trim()) out.header[f.key] = { value: f.defaultValue };
  }
  for (const t of def.tables) out.tables[t.key] ??= [];
  return out;
}

export function aggregate(instances: ExtractedInstance[], files: FileRecord[], previous: SheetsData | null, ctx: AggregateContext): SheetsData {
  const active = activeInstances(instances, files);
  const fresh: SheetsData = {
    crew: buildCrew(active, ctx),
    voyage: buildVoyage(active, ctx),
    goods: buildGoods(active, ctx),
    hbl: buildHbl(active, ctx),
    store: buildStore(active, ctx),
    security: buildSecurity(active, ctx),
  };
  const result = emptySheets();
  for (const key of Object.keys(result) as SectionKey[]) {
    result[key] = mergeSection(fresh[key], previous?.[key], key);
  }
  return result;
}

/** Dữ liệu khởi tạo cho chuyến tàu mới: chỉ có giá trị cố định CN01. */
export function initialSheets(): SheetsData {
  const s = emptySheets();
  for (const key of Object.keys(s) as SectionKey[]) {
    s[key] = mergeSection({ header: {}, tables: {} }, undefined, key);
  }
  return s;
}

/** Bổ sung section còn thiếu (chuyến tàu tạo từ phiên bản cũ chưa có sheet mới). */
export function ensureSheets(sheets: Partial<SheetsData> | null | undefined): SheetsData {
  const base = initialSheets();
  const out = { ...base } as SheetsData;
  for (const key of Object.keys(base) as SectionKey[]) {
    const s = sheets?.[key];
    if (s) out[key] = { header: { ...base[key].header, ...s.header }, tables: { ...base[key].tables, ...s.tables } };
  }
  return out;
}

/**
 * Tự chọn bản active khi có nhiều instance cùng docType 1-1 (vd. hai crew list khác cảng/ngày):
 * ưu tiên bản có cảng/ngày khớp notice_of_arrival; không có thì bản có ngày mới nhất.
 * Không đụng tới trang người dùng đã tự bật/tắt.
 */
export function autoSelectActive(files: FileRecord[], instances: ExtractedInstance[], ports: PortEntry[]): FileRecord[] {
  const next: FileRecord[] = files.map((f) => ({ ...f, pages: f.pages.map((p) => ({ ...p })) }));
  const pageOf = (fileId: string, page: number) => next.find((f) => f.fileId === fileId)?.pages.find((p) => p.page === page);
  const notice = instances.find((i) => i.docType === "notice_of_arrival" && pageOf(i.fileId, i.page)?.active);
  const noticePort = notice?.header.port?.value ?? null;
  const noticeDate = notice ? parseDate(notice.header.arrivalTime?.value ?? notice.header.signDate?.value ?? "") : null;

  for (const docType of ["crew_list", "ship_store"] as DocType[]) {
    const group = instances.filter((i) => i.docType === docType && !next.find((f) => f.fileId === i.fileId)?.duplicateOf);
    if (group.length < 2) continue;
    if (group.some((i) => pageOf(i.fileId, i.page)?.activeManual)) continue;
    const score = (i: ExtractedInstance): number => {
      let s = 0;
      const port = i.header.port?.value;
      if (noticePort && port && portCompareKey(ports, port) === portCompareKey(ports, noticePort)) s += 10;
      const d = parseDate(i.header.date?.value ?? i.header.signDate?.value ?? "");
      if (noticeDate && d && toIsoDate(d) === toIsoDate(noticeDate)) s += 5;
      if (d) s += (d.y * 10000 + d.m * 100 + d.d) / 1e9;
      return s;
    };
    const best = [...group].sort((a, b) => score(b) - score(a))[0];
    for (const i of group) {
      const p = pageOf(i.fileId, i.page);
      if (!p) continue;
      const isBest = i === best;
      p.active = isBest;
      p.activeNote = isBest
        ? `Được chọn trong ${group.length} bản ${docType === "crew_list" ? "crew list" : "ship's store"}${noticePort ? " (khớp cảng/ngày với thông báo tàu đến)" : " (ngày mới nhất)"}`
        : `Tự tắt: đã có bản ${docType === "crew_list" ? "crew list" : "ship's store"} khác phù hợp hơn – bật lại nếu cần`;
    }
  }
  return next;
}
