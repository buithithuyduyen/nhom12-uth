"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useShipment } from "@/components/app/shipment-context";
import { SECTIONS, SHEET_MAPPINGS, type FieldDef, type SheetMapping } from "@/lib/mapping/nsw";
import type { CodeTables, Discrepancy, FieldValue, Flag, PortEntry, SectionKey, TableRow } from "@/lib/types";
import { emptySection } from "@/lib/types";
import { flashElement } from "@/lib/client";
import { discrepancyDomId } from "./CheckPanel";
import { validateValue } from "@/lib/extraction/validators";
import { codeName } from "@/lib/codes";
import { newRowId } from "@/lib/aggregate";

const TAB_LABELS: Record<string, string> = {
  "crew-list": "Crew list",
  notice: "Notice ship to port",
  "general-declaration": "General Declaration",
  "goods-declaration": "Goods Declaration",
  "ship-security": "Declaration For Ship Security",
  "ship-store": "Ship's store",
};

function flagsFor(def: FieldDef, fv: FieldValue | undefined, conflict: boolean): Flag[] {
  const value = fv?.value ?? "";
  const flags: Flag[] = [];
  if (fv && !fv.userEdited) flags.push(...(fv.flags ?? []).filter((f) => f.kind !== "invalid"));
  if (fv?.userEdited && !value) flags.push(...(fv.flags ?? []).filter((f) => f.kind === "needsConfirm"));
  flags.push(...validateValue(def, value, undefined));
  if (!value && def.needsInputIfEmpty) flags.push({ kind: "needsInput", message: "Chứng từ không có – cần nhập" });
  if (conflict) flags.unshift({ kind: "invalid", message: "Các chứng từ ghi khác nhau – bấm vào ô để tới mục Kiểm tra chéo và chọn giá trị đúng" });
  return flags;
}

function toneClass(flags: Flag[], conflict: boolean): string {
  if (conflict || flags.some((f) => f.kind === "invalid")) return "border-red-300 bg-red-50";
  if (flags.length) return "border-amber-300 bg-amber-50";
  return "border-slate-200 bg-white";
}

function CellInput({
  def,
  fv,
  onChange,
  compact,
  conflict,
  codes,
}: {
  def: FieldDef;
  fv: FieldValue | undefined;
  onChange: (v: string) => void;
  compact?: boolean;
  conflict?: boolean;
  codes: CodeTables | null;
}) {
  const value = fv?.value ?? "";
  const flags = flagsFor(def, fv, !!conflict);
  // Hiện giá trị gốc trên giấy khi hệ thống đã quy đổi (vd. ABD -> mã NSW ABS)
  const codeLabel = def.type === "code" && def.codeType && value ? codeName(codes, def.codeType, value) : "";
  const converted =
    fv?.raw && !fv.userEdited && value && fv.raw.trim().toUpperCase() !== value.toUpperCase() && (def.type === "code" || def.type === "select")
      ? `Giấy ghi: ${fv.raw} → mã NSW: ${value}${codeLabel ? ` (${codeLabel})` : ""}`
      : codeLabel
        ? `${value} = ${codeLabel}`
        : "";
  const title = [
    converted,
    ...flags.map((f) => `• ${f.message}`),
    fv?.source ? `Nguồn: ${fv.source.fileName} – trang ${fv.source.page}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  // Nhãn chữ gốc trong ô: chỉ khi quy đổi không hiển nhiên (bỏ qua quốc tịch VIETNAM -> VN...) và chữ gốc ngắn
  const isConverted = converted.startsWith("Giấy ghi") && def.codeType !== "country" && (fv?.raw?.length ?? 0) <= 8;
  const base = `w-full rounded-md border px-2 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 ${compact ? "h-8" : "h-9"} ${toneClass(flags, !!conflict)}`;

  if (def.derivedFrom) return <div className={`${base} flex items-center truncate bg-slate-50 text-slate-500`}>{value}</div>;
  if (def.type === "select" && def.options) {
    return (
      <select className={base} value={value} onChange={(e) => onChange(e.target.value)} title={title}>
        <option value="">—</option>
        {def.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        {value && !def.options.includes(value) && <option value={value}>{value}</option>}
      </select>
    );
  }
  const list = def.type === "code" && def.codeType ? `codes-${def.codeType}` : def.type === "port" ? "ports-list" : undefined;
  const input = (
    <input
      className={`${base} ${isConverted ? "pr-10" : ""}`}
      value={value}
      list={list}
      title={title}
      placeholder={def.type === "date" ? "dd/MM/yyyy" : def.type === "datetime" ? "dd/MM/yyyy HH:mm" : ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
  if (!isConverted) return input;
  return (
    <div className="relative" title={title}>
      {input}
      <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 rounded bg-slate-100 px-1 text-[10px] text-slate-500">
        {fv?.raw}
      </span>
    </div>
  );
}

function Datalists({ codes, ports }: { codes: CodeTables | null; ports: PortEntry[] }) {
  return (
    <>
      {codes &&
        (Object.keys(codes) as Array<keyof CodeTables>).map((k) => (
          <datalist key={k} id={`codes-${k}`}>
            {codes[k].map((e) => (
              <option key={e.code} value={e.code}>
                {e.name}
              </option>
            ))}
          </datalist>
        ))}
      <datalist id="ports-list">
        {ports.map((p) => (
          <option key={p.code} value={p.code}>
            {p.name}
          </option>
        ))}
      </datalist>
    </>
  );
}

export function SheetEditor() {
  const { sheets, updateSection, setHeaderValue, check, codes, ports, focus } = useShipment();
  const [tab, setTab] = useState(SHEET_MAPPINGS[0].id);
  const mapping = SHEET_MAPPINGS.find((m) => m.id === tab) as SheetMapping;
  const sectionKey: SectionKey = mapping.section;
  const section = sheets[sectionKey] ?? emptySection();
  const def = SECTIONS[sectionKey];
  const excluded = new Set(mapping.excludeKeys ?? []);
  const headerDefs = mapping.header.map((b) => def.header.find((f) => f.key === b.key)).filter((f): f is FieldDef => !!f && !excluded.has(f.key));
  const open = check.discrepancies.filter((d) => d.resolvedValue === undefined);
  const conflictFor = (match: (d: Discrepancy) => boolean): Discrepancy | undefined =>
    open.find((d) => d.severity === "error" && d.target?.section === sectionKey && match(d));
  /** Bấm ô đỏ -> cuộn tới mục kiểm tra chéo tương ứng và nhấp nháy */
  const goToCheck = (d: Discrepancy | undefined) => {
    if (d) flashElement(discrepancyDomId(d.id));
  };

  // "Xem ô" từ mục kiểm tra chéo -> mở đúng tab (đổi state ngay khi render), rồi cuộn tới ô và nhấp nháy
  const [seenFocus, setSeenFocus] = useState<number | null>(null);
  if (focus && focus.nonce !== seenFocus) {
    setSeenFocus(focus.nonce);
    const target = SHEET_MAPPINGS.find((m) => m.section === focus.section);
    if (target && target.id !== tab) setTab(target.id);
  }
  useEffect(() => {
    if (!focus) return;
    const id = focus.field
      ? `f-${focus.section}-${focus.field}`
      : focus.table && focus.rowId && focus.column
        ? `c-${focus.section}-${focus.table}-${focus.rowId}-${focus.column}`
        : focus.table
          ? `t-${focus.section}-${focus.table}`
          : "";
    if (!id) return;
    const timer = window.setTimeout(() => flashElement(id), 80);
    return () => window.clearTimeout(timer);
  }, [focus]);

  const setCell = (tableKey: string, rowId: string, key: string, value: string) =>
    updateSection(sectionKey, (s) => ({
      ...s,
      tables: {
        ...s.tables,
        [tableKey]: (s.tables[tableKey] ?? []).map((r) => {
          if (r.id !== rowId) return r;
          const cells = { ...r.cells, [key]: { ...(r.cells[key] ?? {}), value, userEdited: true, flags: [] } };
          const tdef = def.tables.find((t) => t.key === tableKey);
          for (const c of tdef?.columns ?? []) {
            if (c.derivedFrom?.key === key) cells[c.key] = { value: codeName(codes, c.derivedFrom.codeType, value) };
          }
          return { ...r, cells, userEdited: true };
        }),
      },
    }));

  const addRow = (tableKey: string) =>
    updateSection(sectionKey, (s) => ({ ...s, tables: { ...s.tables, [tableKey]: [...(s.tables[tableKey] ?? []), { id: newRowId(), cells: {}, userEdited: true }] } }));

  const removeRow = (tableKey: string, rowId: string) =>
    updateSection(sectionKey, (s) => ({
      ...s,
      tables: { ...s.tables, [tableKey]: (s.tables[tableKey] ?? []).filter((r) => r.id !== rowId).map((r) => ({ ...r, userEdited: true })) },
    }));

  const applyAll = (tableKey: string, key: string, value: string) =>
    updateSection(sectionKey, (s) => ({
      ...s,
      tables: {
        ...s.tables,
        [tableKey]: (s.tables[tableKey] ?? []).map((r: TableRow) => ({ ...r, userEdited: true, cells: { ...r.cells, [key]: { value, userEdited: true } } })),
      },
    }));

  return (
    <div>
      <Datalists codes={codes} ports={ports} />
      <div className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-slate-100 px-1">
        {SHEET_MAPPINGS.map((m) => (
          <button
            key={m.id}
            onClick={() => setTab(m.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === m.id ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {TAB_LABELS[m.id]}
          </button>
        ))}
      </div>

      {sectionKey === "voyage" && <p className="mb-4 text-xs text-slate-400">Notice ship to port và General Declaration dùng chung một bộ dữ liệu.</p>}

      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {headerDefs.map((f) => {
          const conflictD = conflictFor((d) => d.target?.field === f.key);
          const conflict = !!conflictD;
          const fv = section.header[f.key];
          return (
            <label
              key={f.key}
              id={`f-${sectionKey}-${f.key}`}
              className={`block rounded-md ${conflict ? "cursor-pointer" : ""}`}
              onMouseDown={conflict ? () => goToCheck(conflictD) : undefined}
            >
              <span className="mb-1 block text-xs font-medium text-slate-500">
                {f.label}
                {f.required && <span className="text-red-500"> *</span>}
              </span>
              <CellInput def={f} fv={fv} conflict={conflict} codes={codes} onChange={(v) => setHeaderValue(sectionKey, f.key, v)} />
              {fv?.source && !fv.userEdited && (
                <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                  Nguồn: {fv.source.fileName} – trang {fv.source.page}
                </span>
              )}
            </label>
          );
        })}
      </div>

      {mapping.tables.map((tb) => {
        const tdef = def.tables.find((t) => t.key === tb.key);
        if (!tdef) return null;
        const rows = section.tables[tb.key] ?? [];
        return (
          <div key={tb.key} className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-700">
                {tdef.label} <span className="font-normal text-slate-400">({rows.length} dòng)</span>
              </h3>
              <button
                onClick={() => addRow(tb.key)}
                disabled={!!tdef.maxRows && rows.length >= tdef.maxRows}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" /> Thêm dòng
              </button>
            </div>
            <div id={`t-${sectionKey}-${tb.key}`} className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="w-10 px-2 py-2 font-medium">#</th>
                    {tdef.columns.map((c) => (
                      <th key={c.key} className="px-2 py-2 font-medium" style={{ minWidth: c.width ?? 120 }}>
                        <div>
                          {c.label}
                          {c.required && <span className="text-red-500"> *</span>}
                        </div>
                        {c.needsInputIfEmpty && c.options && rows.length > 0 && (
                          <select
                            className="mt-1 h-6 w-full rounded border border-slate-200 bg-white text-[11px] font-normal"
                            value=""
                            onChange={(e) => e.target.value && applyAll(tb.key, c.key, e.target.value)}
                          >
                            <option value="">Áp dụng tất cả…</option>
                            {c.options.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        )}
                      </th>
                    ))}
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={tdef.columns.length + 2} className="px-3 py-6 text-center text-xs text-slate-400">
                        Chưa có dữ liệu – bóc tách từ chứng từ hoặc bấm “Thêm dòng” để nhập tay
                      </td>
                    </tr>
                  )}
                  {rows.map((row, i) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className="px-2 text-xs text-slate-400">{i + 1}</td>
                      {tdef.columns.map((c) => {
                        const conflictD = conflictFor((d) => d.target?.rowId === row.id && d.target.column === c.key);
                        const conflict = !!conflictD;
                        return (
                          <td
                            key={c.key}
                            id={`c-${sectionKey}-${tb.key}-${row.id}-${c.key}`}
                            className={`rounded-md p-1 ${conflict ? "cursor-pointer" : ""}`}
                            onMouseDown={conflict ? () => goToCheck(conflictD) : undefined}
                          >
                            <CellInput def={c} fv={row.cells[c.key]} conflict={conflict} codes={codes} compact onChange={(v) => setCell(tb.key, row.id, c.key, v)} />
                          </td>
                        );
                      })}
                      <td className="px-1">
                        <button className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-600" onClick={() => removeRow(tb.key, row.id)} title="Xóa dòng">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <p className="mt-4 flex flex-wrap gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-amber-300 bg-amber-50" /> Cần kiểm tra (di chuột để xem lý do)</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-red-300 bg-red-50" /> Sai định dạng / lệch giữa chứng từ</span>
      </p>
    </div>
  );
}
