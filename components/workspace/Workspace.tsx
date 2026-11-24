"use client";

import { useState } from "react";
import { Anchor, Download, Loader2, RotateCcw } from "lucide-react";
import { useShipment } from "@/components/app/shipment-context";
import { UploadPanel } from "./UploadPanel";
import { CheckPanel } from "./CheckPanel";
import { SheetEditor } from "./SheetEditor";

function Step({ n, title, children, right }: { n: number; title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">{n}</span>
        <h2 className="flex-1 text-[15px] font-semibold text-slate-900">{title}</h2>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Workspace() {
  const { voyageName, setVoyageName, saveStatus, exportExcel, newShipment, loading, stateless } = useShipment();
  const [exporting, setExporting] = useState(false);

  const onExport = async () => {
    setExporting(true);
    try {
      await exportExcel();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="min-h-full bg-[#F8FAFC]">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
              <Anchor className="h-4 w-4" />
            </div>
            <span className="hidden font-semibold text-slate-900 sm:block">MarineDoc AI</span>
          </div>
          <input
            value={voyageName}
            onChange={(e) => setVoyageName(e.target.value)}
            className="h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-sm font-medium text-slate-700 outline-none hover:border-slate-200 focus:border-slate-300 focus:bg-white"
            aria-label="Tên chuyến tàu"
          />
          <span className="hidden text-xs text-slate-400 md:block">
            {saveStatus === "saving" ? "Đang lưu…" : saveStatus === "saved" ? "Đã lưu" : saveStatus === "error" ? "Lỗi lưu" : ""}
          </span>
          <button onClick={newShipment} className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 sm:flex" title="Bắt đầu chuyến mới">
            <RotateCcw className="h-4 w-4" /> Làm mới
          </button>
          <button
            onClick={() => void onExport()}
            disabled={exporting}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Tải Excel
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6">
        {stateless && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
            Bản demo: dữ liệu chỉ nằm trong trình duyệt này – <b>tải lại trang (F5) sẽ mất dữ liệu</b>. Hãy tải file Excel trước khi đóng trang.
          </div>
        )}
        {loading ? (
          <div className="flex justify-center py-20 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <>
            <Step n={1} title="Tải chứng từ lên">
              <UploadPanel />
            </Step>
            <Step n={2} title="Kiểm tra chéo">
              <CheckPanel />
            </Step>
            <Step n={3} title="Dữ liệu điền vào Excel">
              <SheetEditor />
            </Step>
          </>
        )}
      </main>
    </div>
  );
}
