"use client";

import { useState, useEffect } from "react";
import {
  Cpu,
  Sparkles,
  Play,
  CheckCircle2,
  AlertCircle,
  FileText,
  ArrowRight,
  RefreshCw,
  HelpCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { DocumentRecord, ExtractionRecord, VesselFile } from "@/types/database";
import { getDocumentTypeById } from "@/config/documentTypes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { vesselStore } from "@/lib/store/vesselStore";

interface Props {
  vessel: VesselFile;
  onNextStep: () => void;
  onRefresh: () => void;
}

export function VesselExtractionTab({ vessel, onNextStep, onRefresh }: Props) {
  const { toast } = useToast();

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [extractions, setExtractions] = useState<Record<string, ExtractionRecord>>({});
  const [loading, setLoading] = useState(true);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [extractAllProgress, setExtractAllProgress] = useState<{ current: number; total: number } | null>(null);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const docs = await vesselStore.getDocuments(vessel.id);
      setDocuments(docs);

      const extList = await vesselStore.getExtractions(vessel.id);
      const extMap: Record<string, ExtractionRecord> = {};
      extList.forEach((e) => {
        extMap[e.document_id] = e;
      });
      setExtractions(extMap);

      if (docs.length > 0 && !expandedDocId) {
        setExpandedDocId(docs[0].id);
      }
    } catch {
      toast("Không thể tải dữ liệu chứng từ", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [vessel.id]);

  // Trích xuất 1 file
  const extractSingleFile = async (doc: DocumentRecord): Promise<boolean> => {
    setExtractingId(doc.id);
    await vesselStore.updateDocument(doc.id, { status: "extracting" });

    try {
      const blobUrl = vesselStore.getStoredFileBlob(doc.id);
      let file: File;

      if (blobUrl) {
        // Convert dataUrl back to File
        const res = await fetch(blobUrl);
        const blob = await res.blob();
        file = new File([blob], doc.file_name, { type: doc.mime_type });
      } else {
        // Fallback dummy file
        file = new File(["dummy"], doc.file_name, { type: "text/plain" });
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("docType", doc.doc_type);
      formData.append("vesselName", vessel.vessel_name);
      formData.append("imoNumber", vessel.imo_number);
      formData.append("voyageNumber", vessel.voyage_number);

      const apiRes = await fetch("/api/extract", {
        method: "POST",
        body: formData,
      });

      const json = await apiRes.json();

      if (!apiRes.ok || !json.success) {
        throw new Error(json.error || "Lỗi xử lý trích xuất");
      }

      // Lưu kết quả vào store
      const savedExt = await vesselStore.saveExtraction({
        document_id: doc.id,
        vessel_file_id: vessel.id,
        raw_json: json.data,
        confidence_score: json.confidence_score || 0.95,
      });

      await vesselStore.updateDocument(doc.id, { status: "extracted", error_message: null });

      setExtractions((prev) => ({ ...prev, [doc.id]: savedExt }));
      setDocuments((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, status: "extracted" } : d))
      );

      return true;
    } catch (err: any) {
      await vesselStore.updateDocument(doc.id, {
        status: "error",
        error_message: err?.message || "Lỗi trích xuất",
      });
      setDocuments((prev) =>
        prev.map((d) =>
          d.id === doc.id ? { ...d, status: "error", error_message: err?.message } : d
        )
      );
      toast(`Trích xuất "${doc.file_name}" thất bại: ${err?.message}`, "error");
      return false;
    } finally {
      setExtractingId(null);
    }
  };

  // Trích xuất tất cả
  const handleExtractAll = async () => {
    if (documents.length === 0) return;

    setExtractAllProgress({ current: 0, total: documents.length });
    let successCount = 0;

    for (let i = 0; i < documents.length; i++) {
      setExtractAllProgress({ current: i + 1, total: documents.length });
      const success = await extractSingleFile(documents[i]);
      if (success) successCount++;
    }

    setExtractAllProgress(null);

    if (successCount > 0) {
      toast(`Đã trích xuất xong ${successCount}/${documents.length} chứng từ!`, "success");
      // Cập nhật trạng thái tàu thành 'extracted'
      await vesselStore.updateVesselStatus(vessel.id, "extracted");
      onRefresh();
    }
  };

  const hasAnyExtracted = Object.keys(extractions).length > 0;

  return (
    <div className="space-y-6">
      {/* Top Action Card */}
      <Card className="border-blue-200 bg-gradient-to-r from-blue-50/60 to-indigo-50/40 shadow-xs">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
                <Cpu className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Trích xuất dữ liệu bằng AI (Claude)
                </h3>
                <p className="text-xs text-slate-600 mt-0.5 max-w-xl leading-relaxed">
                  Trích xuất chính xác theo mẫu <code className="rounded bg-white px-1 py-0.5 border text-blue-700">config/documentTypes.ts</code>. Mỗi trường dữ liệu đi kèm độ tin cậy và trích dẫn nguồn.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadData}
                className="gap-1.5"
                title="Tải lại kết quả"
              >
                <RefreshCw className="h-4 w-4" />
                Làm mới
              </Button>

              <Button
                onClick={handleExtractAll}
                disabled={documents.length === 0 || !!extractingId || !!extractAllProgress}
                className="gap-2 shadow-sm font-semibold"
              >
                <Sparkles className="h-4 w-4" />
                {extractAllProgress
                  ? `Đang trích xuất (${extractAllProgress.current}/${extractAllProgress.total})...`
                  : "Trích xuất tất cả file"}
              </Button>
            </div>
          </div>

          {extractAllProgress && (
            <div className="mt-4 space-y-1.5">
              <div className="flex justify-between text-xs text-slate-600 font-medium">
                <span>Tiến trình trích xuất tài liệu</span>
                <span>
                  {Math.round((extractAllProgress.current / extractAllProgress.total) * 100)}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                  style={{
                    width: `${(extractAllProgress.current / extractAllProgress.total) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Content Area */}
      {documents.length === 0 ? (
        <Card className="p-8 text-center border-dashed border-2">
          <p className="text-sm text-slate-500">
            Hồ sơ tàu này chưa có chứng từ nào. Vui lòng chuyển qua bước <strong>"2. Tải chứng từ"</strong> để tải lên trước.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {documents.map((doc) => {
            const ext = extractions[doc.id];
            const isExpanded = expandedDocId === doc.id;
            const docConfig = getDocumentTypeById(doc.doc_type);
            const isProcessingThis = extractingId === doc.id;

            return (
              <Card key={doc.id} className="overflow-hidden shadow-xs border-slate-200">
                {/* Header item */}
                <div
                  className="flex items-center justify-between p-4 bg-slate-50/70 hover:bg-slate-50 cursor-pointer border-b border-slate-100 transition"
                  onClick={() => setExpandedDocId(isExpanded ? null : doc.id)}
                >
                  <div className="flex items-center gap-3">
                    <button className="text-slate-400 hover:text-slate-600">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-slate-200 text-blue-600">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{doc.file_name}</h4>
                      <p className="text-xs text-slate-500 font-medium">{docConfig.name}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    {ext ? (
                      <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Độ tin cậy: {Math.round((ext.confidence_score || 0.95) * 100)}%
                      </span>
                    ) : doc.status === "error" ? (
                      <span className="flex items-center gap-1.5 rounded-full bg-red-50 border border-red-200 px-3 py-1 text-xs font-semibold text-red-700">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Lỗi trích xuất
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">Chưa trích xuất</span>
                    )}

                    <Button
                      variant={ext ? "outline" : "default"}
                      size="sm"
                      onClick={() => extractSingleFile(doc)}
                      disabled={isProcessingThis || !!extractAllProgress}
                      className="gap-1.5 text-xs h-8"
                    >
                      {isProcessingThis ? (
                        <>
                          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          Đang trích xuất...
                        </>
                      ) : (
                        <>
                          <Play className="h-3.5 w-3.5 fill-current" />
                          {ext ? "Trích xuất lại" : "Trích xuất"}
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Body Table of Extracted Fields */}
                {isExpanded && (
                  <CardContent className="p-0">
                    {ext && ext.raw_json ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-100/60 text-slate-500 uppercase font-semibold">
                            <tr>
                              <th className="px-5 py-2.5 w-1/4">Trường dữ liệu</th>
                              <th className="px-5 py-2.5 w-1/3">Giá trị trích xuất</th>
                              <th className="px-5 py-2.5 w-1/8">Độ tin cậy</th>
                              <th className="px-5 py-2.5 w-1/3">Trích dẫn chứng cứ từ tài liệu</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {docConfig.fields.map((field) => {
                              const item = ext.raw_json[field.key];
                              const val = item ? item.value : null;
                              const conf = item && typeof item.confidence === "number" ? item.confidence : null;
                              const cit = item ? item.citation : null;

                              return (
                                <tr key={field.key} className="hover:bg-slate-50/50">
                                  <td className="px-5 py-2.5 font-medium text-slate-900">
                                    {field.label}
                                    <span className="block text-[10px] text-slate-400 font-mono">
                                      {field.key}
                                    </span>
                                  </td>

                                  <td className="px-5 py-2.5">
                                    {val === null || val === undefined ? (
                                      <span className="text-slate-400 italic">null (Không tìm thấy)</span>
                                    ) : typeof val === "object" ? (
                                      <pre className="max-w-xs overflow-x-auto rounded bg-slate-100 p-1 text-[11px] font-mono">
                                        {JSON.stringify(val, null, 2)}
                                      </pre>
                                    ) : (
                                      <span className="font-semibold text-slate-900">{String(val)}</span>
                                    )}
                                  </td>

                                  <td className="px-5 py-2.5">
                                    {conf !== null ? (
                                      <span
                                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                                          conf >= 0.9
                                            ? "bg-emerald-100 text-emerald-800"
                                            : conf >= 0.7
                                            ? "bg-amber-100 text-amber-800"
                                            : "bg-red-100 text-red-800"
                                        }`}
                                      >
                                        {Math.round(conf * 100)}%
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </td>

                                  <td className="px-5 py-2.5 text-slate-600 text-[11px] italic">
                                    {cit || "-"}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-6 text-center text-xs text-slate-500">
                        Chứng từ này chưa được trích xuất. Bấm nút <strong>"Trích xuất"</strong> ở góc trên bên phải để bắt đầu.
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}

          {/* Bottom Next Step Bar */}
          {hasAnyExtracted && (
            <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/80 p-4">
              <div>
                <h4 className="text-sm font-semibold text-blue-950">
                  Bước tiếp theo: Đối chiếu dữ liệu giữa các chứng từ
                </h4>
                <p className="text-xs text-blue-700">
                  Tự động so sánh số IMO, tên tàu, số chuyến, cảng đến, ETA... phát hiện sai lệch bằng mã màu cảnh báo.
                </p>
              </div>
              <Button onClick={onNextStep} className="gap-2 shadow-xs">
                Sang bước đối chiếu
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
