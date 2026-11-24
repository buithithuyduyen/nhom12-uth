"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDownRight, Check, CheckCircle2, ChevronDown, FileText, Info, ShieldAlert } from "lucide-react";
import { useShipment } from "@/components/app/shipment-context";
import {
  activeInstances,
  collectCandidates,
  collectVoyageCandidates,
  normalizeSecurityCandidate,
  normalizeVoyageCandidate,
  SECURITY_RULES,
} from "@/lib/aggregate";
import { normalizeDate } from "@/lib/normalize";
import type { Discrepancy, FieldValue } from "@/lib/types";

interface Choice {
  key: string;
  value: string;
  label: string;
  where: string;
  field: FieldValue;
}

export function discrepancyDomId(id: string): string {
  return `disc-${id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function SourceRow({ value, fileName, page }: { value: string; fileName: string; page: number }) {
  return (
    <li className="flex items-start gap-2 py-1">
      <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span className="min-w-0 flex-1">
        <span className="font-mono text-[13px] font-semibold text-slate-800">{value || "(trống)"}</span>
        <span className="ml-2 text-xs text-slate-500">
          {fileName}
          {page ? ` · trang ${page}` : ""}
        </span>
      </span>
    </li>
  );
}

function Card({
  d,
  choices,
  currentValue,
  onChoose,
  onGoToCell,
}: {
  d: Discrepancy;
  choices: Choice[];
  currentValue: string | null;
  onChoose: (c: Choice) => void;
  onGoToCell: (() => void) | null;
}) {
  const error = d.severity === "error";
  return (
    <li id={discrepancyDomId(d.id)} className={`overflow-hidden rounded-xl border bg-white shadow-sm ${error ? "border-red-200" : "border-amber-200"}`}>
      <div className={`flex items-start gap-3 px-4 py-3 ${error ? "bg-red-50/70" : "bg-amber-50/70"}`}>
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${error ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"}`}>
          {error ? <ShieldAlert className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{d.label}</span>
            <span className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-slate-500 ring-1 ring-slate-200">{d.sheetTarget}</span>
          </div>
          <p className={`mt-0.5 text-[13px] ${error ? "text-red-700" : "text-amber-800"}`}>{d.message}</p>
        </div>
        {onGoToCell && (
          <button
            onClick={onGoToCell}
            className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-white hover:text-slate-900"
          >
            Xem ô <ArrowDownRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="px-4 py-3">
        {choices.length > 0 ? (
          <>
            <p className="mb-2 text-xs font-medium text-slate-500">Chọn giá trị đúng để điền vào Excel:</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {choices.map((c) => {
                const selected = d.resolvedValue !== undefined && d.resolvedValue === c.value && currentValue === c.value;
                return (
                  <button
                    key={c.key}
                    onClick={() => onChoose(c)}
                    className={`group flex items-start gap-3 rounded-lg border px-3 py-2 text-left transition ${
                      selected ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200 hover:border-blue-300 hover:bg-blue-50/50"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        selected ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white group-hover:border-blue-400"
                      }`}
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-mono text-[13px] font-semibold text-slate-800">{c.label || "(trống)"}</span>
                      <span className="block truncate text-xs text-slate-500" title={c.where}>
                        {c.where}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <ul className="divide-y divide-slate-100">
            {d.sources.map((s, i) => (
              <SourceRow key={i} value={s.value} fileName={s.fileName} page={s.page} />
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

export function CheckPanel() {
  const { shipment, check, aggregateContext, resolveDiscrepancy, sheets, jumpTo } = useShipment();
  const [showWarnings, setShowWarnings] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const instances = shipment?.extractedData.instances ?? [];

  if (instances.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-400">
        <Info className="h-4 w-4" /> Kết quả đối chiếu giữa các chứng từ sẽ hiện ở đây sau khi đọc bằng AI.
      </p>
    );
  }

  const active = activeInstances(instances, shipment!.files);
  const voyageCands = collectVoyageCandidates(active, aggregateContext);
  const securityCands = collectCandidates(SECURITY_RULES, active, aggregateContext);

  const choicesFor = (d: Discrepancy): Choice[] => {
    const t = d.target;
    if (!t) return [];
    if (t.field && (t.section === "voyage" || t.section === "security")) {
      const list = (t.section === "security" ? securityCands : voyageCands)[t.field] ?? [];
      const seen = new Map<string, Choice>();
      for (const c of list) {
        const fv =
          t.section === "security" ? normalizeSecurityCandidate(t.field, c.field, aggregateContext) : normalizeVoyageCandidate(t.field, c.field, aggregateContext);
        const where = `${c.fileName} · trang ${c.page}`;
        const prev = seen.get(c.compareKey);
        if (prev) prev.where += ` + ${where}`;
        else seen.set(c.compareKey, { key: c.compareKey, value: fv.value, label: fv.value || c.display, where, field: fv });
      }
      return [...seen.values()];
    }
    if (t.table && t.rowId && t.column) {
      const seen = new Map<string, Choice>();
      for (const s of d.sources) {
        const v = normalizeDate(s.value);
        const where = `${s.fileName} · trang ${s.page}`;
        const prev = seen.get(v);
        if (prev) prev.where += ` + ${where}`;
        else seen.set(v, { key: v, value: v, label: v, where, field: { value: v, raw: s.value } });
      }
      return [...seen.values()];
    }
    return [];
  };

  const currentValueFor = (d: Discrepancy): string | null => {
    const t = d.target;
    if (!t) return null;
    if (t.field) return sheets[t.section]?.header[t.field]?.value ?? null;
    if (t.table && t.rowId && t.column) return sheets[t.section]?.tables[t.table]?.find((r) => r.id === t.rowId)?.cells[t.column]?.value ?? null;
    return null;
  };

  const open = check.discrepancies.filter((d) => d.resolvedValue === undefined);
  const errors = open.filter((d) => d.severity === "error");
  const warnings = open.filter((d) => d.severity === "warning");
  const resolved = check.discrepancies.filter((d) => d.resolvedValue !== undefined);

  const renderCard = (d: Discrepancy) => (
    <Card
      key={d.id}
      d={d}
      choices={choicesFor(d)}
      currentValue={currentValueFor(d)}
      onChoose={(c) => resolveDiscrepancy(d, c.field)}
      onGoToCell={d.target ? () => jumpTo(d.target!) : null}
    />
  );

  return (
    <div className="space-y-4">
      {open.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {check.comparedGroups > 0
            ? "Tất cả thông tin đối chiếu giữa các chứng từ đều trùng khớp."
            : "Không phát hiện sai lệch (chưa có thông tin nào xuất hiện ở từ 2 chứng từ để so)."}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {errors.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 font-medium text-red-700">
              <span className="h-2 w-2 rounded-full bg-red-500" /> {errors.length} chỗ lệch cần chọn
            </span>
          )}
          {warnings.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> {warnings.length} cảnh báo nên xem
            </span>
          )}
          {resolved.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 font-medium text-emerald-700">
              <Check className="h-3.5 w-3.5" /> {resolved.length} đã xử lý
            </span>
          )}
        </div>
      )}

      {errors.length > 0 && <ul className="space-y-3">{errors.map(renderCard)}</ul>}

      {warnings.length > 0 && (
        <div>
          <button
            onClick={() => setShowWarnings((v) => !v)}
            className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800"
          >
            <ChevronDown className={`h-4 w-4 transition ${showWarnings ? "" : "-rotate-90"}`} /> Cảnh báo ({warnings.length})
          </button>
          {showWarnings && <ul className="space-y-3">{warnings.map(renderCard)}</ul>}
        </div>
      )}

      {resolved.length > 0 && (
        <div>
          <button
            onClick={() => setShowResolved((v) => !v)}
            className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800"
          >
            <ChevronDown className={`h-4 w-4 transition ${showResolved ? "" : "-rotate-90"}`} /> Đã xử lý ({resolved.length})
          </button>
          {showResolved && <ul className="space-y-3">{resolved.map(renderCard)}</ul>}
        </div>
      )}
    </div>
  );
}
