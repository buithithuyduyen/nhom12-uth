"use client";

import { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Loader2, RefreshCw, Sparkles, Trash2, UploadCloud } from "lucide-react";
import { useShipment } from "@/components/app/shipment-context";
import { DOC_TYPE_LABELS, type PageInfo } from "@/lib/types";
import { formatBytes } from "@/lib/client";

function PageChip({ p, onToggle, disabled }: { p: PageInfo; onToggle: () => void; disabled: boolean }) {
  const label = p.docType ? DOC_TYPE_LABELS[p.docType] : p.title ?? `Trang ${p.page}`;
  const tone = !p.active
    ? "border-slate-200 bg-white text-slate-400 line-through"
    : p.status === "error"
      ? "border-red-200 bg-red-50 text-red-700"
      : p.status === "done"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : p.status === "processing"
          ? "border-blue-200 bg-blue-50 text-blue-700"
          : "border-slate-200 bg-slate-50 text-slate-600";
  const tip = [
    p.error,
    p.port || p.date ? `${p.port ?? ""} ${p.date ?? ""}`.trim() : "",
    p.activeNote,
    p.active ? "Bấm để KHÔNG dùng trang này" : "Bấm để DÙNG lại trang này",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition hover:shadow-sm disabled:cursor-default ${tone}`}
      title={tip}
    >
      {p.status === "processing" && <Loader2 className="h-3 w-3 animate-spin" />}
      {p.status === "error" && <AlertCircle className="h-3 w-3" />}
      <span className="text-slate-400">{p.page}.</span> {label}
      {p.date && p.status === "done" && <span className="opacity-60">· {p.date}</span>}
      {p.kind === "scanned" && <span className="opacity-60">· scan</span>}
      {!p.active && <span className="no-underline opacity-80">(không dùng)</span>}
    </button>
  );
}

export function UploadPanel() {
  const { shipment, uploads, uploadFiles, startExtraction, extracting, removeFile, deepseek, togglePage } = useShipment();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const files = shipment?.files ?? [];
  const pages = files.filter((f) => !f.duplicateOf).flatMap((f) => f.pages);
  const pending = pages.filter((p) => p.status !== "done").length;
  const done = pages.filter((p) => p.status === "done").length;

  const onFiles = (list: FileList | null) => {
    if (list && list.length) void uploadFiles(Array.from(list));
  };

  return (
    <div className="space-y-4">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          onFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          drag ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
        }`}
      >
        <UploadCloud className="mb-3 h-8 w-8 text-slate-400" />
        <p className="text-sm font-medium text-slate-700">Kéo thả chứng từ (PDF, DOCX, ảnh) để bắt đầu</p>
        <p className="mt-1 text-xs text-slate-400">hoặc bấm để chọn file · tối đa 25 MB/file</p>
        <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.png,.jpg,.jpeg" className="hidden" onChange={(e) => {
          onFiles(e.target.files);
          e.target.value = "";
        }} />
      </div>

      {uploads.map((u) => (
        <div key={u.key} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm">
          <FileText className="h-4 w-4 text-slate-400" />
          <span className="flex-1 truncate">{u.fileName}</span>
          {u.status === "error" ? (
            <span className="text-xs text-red-600">{u.message}</span>
          ) : (
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-slate-900 transition-all" style={{ width: `${Math.round(u.progress * 100)}%` }} />
            </div>
          )}
        </div>
      ))}

      {files.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {files.map((f) => (
            <li key={f.fileId} className="flex items-start gap-3 px-4 py-3">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">{f.fileName}</span>
                  <span className="shrink-0 text-xs text-slate-400">{formatBytes(f.size)}</span>
                </div>
                {f.duplicateOf ? (
                  <p className="mt-1 text-xs text-amber-600">Trùng file – bỏ qua</p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {f.pages.map((p) => (
                      <PageChip key={p.page} p={p} disabled={extracting} onToggle={() => void togglePage(f.fileId, p.page, !p.active)} />
                    ))}
                  </div>
                )}
                {f.pages.filter((p) => p.status === "error").map((p) => (
                  <p key={p.page} className="mt-1 text-xs text-red-600">
                    Trang {p.page}: {p.error}
                  </p>
                ))}
              </div>
              {!f.duplicateOf && f.pages.some((p) => p.status === "done" || p.status === "error") && (
                <button
                  className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
                  title="Đọc lại file này"
                  disabled={extracting}
                  onClick={() => void startExtraction({ fileId: f.fileId })}
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
              )}
              <button className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Xóa file" disabled={extracting} onClick={() => void removeFile(f.fileId)}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {pages.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {(extracting || pending > 0) && (
            <button
              onClick={() => void startExtraction()}
              disabled={extracting}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {extracting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {extracting ? `Đang đọc… (${done}/${pages.length} trang)` : `Đọc ${pending} trang mới bằng AI`}
            </button>
          )}
          {!extracting && pending === 0 && (
            <span className="flex items-center gap-1 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> Đã đọc xong tất cả {pages.length} trang · bấm ↻ cạnh file để đọc lại riêng file đó
            </span>
          )}
          {deepseek && !deepseek.configured && (
            <span className="text-xs text-amber-600">Chưa cấu hình API key cho AI trong .env.local</span>
          )}
        </div>
      )}
    </div>
  );
}
