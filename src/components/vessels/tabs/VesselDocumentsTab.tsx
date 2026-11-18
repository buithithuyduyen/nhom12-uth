"use client";

import { useState, useRef, useEffect } from "react";
import {
  UploadCloud,
  FileText,
  FileCheck,
  Trash2,
  Eye,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  FileCode,
  Sparkles,
} from "lucide-react";
import { DocumentRecord, VesselFile } from "@/types/database";
import { DOCUMENT_TYPES, detectDocumentType, getDocumentTypeById } from "@/config/documentTypes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { formatFileSize, formatDateTime } from "@/lib/utils";
import { vesselStore } from "@/lib/store/vesselStore";
import mammoth from "mammoth";

interface Props {
  vessel: VesselFile;
  onNextStep: () => void;
  onRefresh: () => void;
}

export function VesselDocumentsTab({ vessel, onNextStep, onRefresh }: Props) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");

  // Preview state
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<"pdf" | "docx" | "other">("pdf");
  const [previewLoading, setPreviewLoading] = useState(false);

  // Delete modal state
  const [deletingDoc, setDeletingDoc] = useState<DocumentRecord | null>(null);

  // Replace state
  const [replacingDocId, setReplacingDocId] = useState<string | null>(null);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const data = await vesselStore.getDocuments(vessel.id);
      setDocuments(data);
    } catch {
      toast("Không thể tải danh sách chứng từ", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [vessel.id]);

  // Xử lý upload các files
  const handleFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadProgress(`Đang tải lên ${i + 1}/${files.length}: ${file.name}...`);

      const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
      const isDocx =
        file.type.includes("wordprocessingml") ||
        file.name.endsWith(".docx") ||
        file.name.endsWith(".doc");

      if (!isPdf && !isDocx) {
        toast(`File "${file.name}" không đúng định dạng PDF hoặc Word (.docx)`, "warning");
        continue;
      }

      try {
        // Tự động nhận diện loại chứng từ
        const detectedType = detectDocumentType(file.name);

        // Chuyển file thành Data URL để lưu vào blob cache cho preview
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Tạo bản ghi document
        const newDoc = await vesselStore.saveDocument({
          vessel_file_id: vessel.id,
          file_name: file.name,
          file_path: `documents/${vessel.id}/${file.name}`,
          file_size: file.size,
          mime_type: file.type || (isPdf ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
          doc_type: detectedType,
          status: "pending",
        });

        vesselStore.storeFileBlob(newDoc.id, dataUrl);
        successCount++;
      } catch (err: any) {
        toast(`Lỗi khi tải file ${file.name}: ${err?.message}`, "error");
      }
    }

    setUploading(false);
    setUploadProgress("");

    if (successCount > 0) {
      toast(`Đã tải lên thành công ${successCount} chứng từ!`, "success");
      // Cập nhật trạng thái hồ sơ tàu thành 'documents_uploaded' nếu đang là 'draft'
      if (vessel.status === "draft") {
        await vesselStore.updateVesselStatus(vessel.id, "documents_uploaded");
        onRefresh();
      }
      loadDocuments();
    }
  };

  // Kéo thả files
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  };

  // Thay đổi loại chứng từ
  const handleTypeChange = async (docId: string, newType: string) => {
    try {
      await vesselStore.updateDocument(docId, { doc_type: newType });
      setDocuments((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, doc_type: newType } : d))
      );
      toast("Đã cập nhật loại chứng từ", "success");
    } catch {
      toast("Không thể cập nhật loại chứng từ", "error");
    }
  };

  // Xóa chứng từ
  const handleDelete = async () => {
    if (!deletingDoc) return;
    try {
      await vesselStore.deleteDocument(deletingDoc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== deletingDoc.id));
      toast(`Đã xóa chứng từ "${deletingDoc.file_name}"`, "success");
      setDeletingDoc(null);
    } catch {
      toast("Lỗi khi xóa chứng từ", "error");
    }
  };

  // Thay thế file
  const handleReplaceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!replacingDocId || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const detectedType = detectDocumentType(file.name);

      await vesselStore.updateDocument(replacingDocId, {
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type || "application/octet-stream",
        doc_type: detectedType,
        status: "pending",
        error_message: null,
      });

      // Xóa kết quả trích xuất cũ
      await vesselStore.deleteExtraction(replacingDocId);
      vesselStore.storeFileBlob(replacingDocId, dataUrl);

      toast(`Đã thay thế chứng từ bằng "${file.name}"`, "success");
      setReplacingDocId(null);
      loadDocuments();
    } catch {
      toast("Lỗi khi thay thế file", "error");
    }
  };

  // Xem trước chứng từ
  const handlePreview = async (doc: DocumentRecord) => {
    setPreviewDoc(doc);
    setPreviewLoading(true);
    setPreviewContent(null);

    const isPdf = doc.file_name.toLowerCase().endsWith(".pdf") || doc.mime_type.includes("pdf");
    const isDocx = doc.file_name.toLowerCase().endsWith(".docx") || doc.mime_type.includes("word");

    setPreviewType(isPdf ? "pdf" : isDocx ? "docx" : "other");

    const blobUrl = vesselStore.getStoredFileBlob(doc.id);

    if (isDocx && blobUrl) {
      try {
        // Convert base64 dataUrl back to buffer for mammoth
        const base64 = blobUrl.split(",")[1];
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const res = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer });
        setPreviewContent(res.value || "<p>Tài liệu Word không có nội dung chữ</p>");
      } catch (err: any) {
        setPreviewContent(`<p class="text-red-500">Không thể đọc nội dung Word: ${err?.message}</p>`);
      }
    } else if (blobUrl) {
      setPreviewContent(blobUrl);
    }

    setPreviewLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* Upload Box */}
      <Card
        className={`border-2 border-dashed transition-all cursor-pointer ${
          isDragging
            ? "border-blue-500 bg-blue-50/60"
            : "border-slate-300 hover:border-blue-400 bg-white"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <CardContent className="p-8 text-center space-y-3">
          <input
            type="file"
            ref={fileInputRef}
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
            multiple
            accept=".pdf,.docx,.doc"
            className="hidden"
          />

          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-xs">
            <UploadCloud className="h-7 w-7" />
          </div>

          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Kéo thả chứng từ vào đây hoặc bấm để chọn nhiều file
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Hỗ trợ định dạng <strong>PDF</strong> và <strong>Word (.docx)</strong>. Hệ thống tự động nhận diện loại chứng từ (Bản khai chung, Danh sách thuyền viên, Bản khai hàng hóa...).
            </p>
          </div>

          {uploading && (
            <div className="mx-auto max-w-sm rounded-lg bg-blue-50 border border-blue-200 p-2 text-xs text-blue-700 flex items-center justify-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <span>{uploadProgress || "Đang xử lý tải lên..."}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hidden input for replace */}
      <input
        type="file"
        ref={replaceInputRef}
        onChange={handleReplaceFile}
        accept=".pdf,.docx,.doc"
        className="hidden"
      />

      {/* Document List Table */}
      <Card className="shadow-xs">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-blue-600" />
              Danh sách chứng từ đã tải ({documents.length})
            </CardTitle>
            <CardDescription>
              Xem trước, sửa loại chứng từ hoặc xóa/thay thế tài liệu
            </CardDescription>
          </div>

          {documents.length > 0 && (
            <Button
              onClick={onNextStep}
              className="gap-2 shadow-xs text-xs"
              size="sm"
            >
              <Sparkles className="h-4 w-4" />
              Tiến hành trích xuất AI
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Đang tải danh sách tài liệu...
            </div>
          ) : documents.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Chưa có chứng từ nào được tải lên cho hồ sơ tàu này. Hãy kéo thả file vào khung trên.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="border-y border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Tên file</th>
                    <th className="px-5 py-3.5">Loại chứng từ</th>
                    <th className="px-5 py-3.5">Dung lượng</th>
                    <th className="px-5 py-3.5">Ngày tải</th>
                    <th className="px-5 py-3.5">Trạng thái</th>
                    <th className="px-5 py-3.5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {documents.map((doc) => {
                    const isDocx = doc.file_name.endsWith(".docx") || doc.mime_type.includes("word");
                    return (
                      <tr key={doc.id} className="hover:bg-slate-50/80 transition">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                isDocx
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-red-100 text-red-700"
                              }`}
                            >
                              <FileText className="h-4 w-4" />
                            </div>
                            <span className="font-semibold text-slate-900 truncate max-w-[220px]" title={doc.file_name}>
                              {doc.file_name}
                            </span>
                          </div>
                        </td>

                        {/* Dropdown chỉnh sửa loại chứng từ */}
                        <td className="px-5 py-4">
                          <select
                            value={doc.doc_type}
                            onChange={(e) => handleTypeChange(doc.id, e.target.value)}
                            className="h-8 max-w-[220px] rounded-md border border-slate-300 bg-white px-2 py-1 text-xs shadow-xs focus:border-blue-600 focus:outline-none"
                          >
                            {DOCUMENT_TYPES.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        <td className="px-5 py-4 text-xs font-mono text-slate-600">
                          {formatFileSize(doc.file_size)}
                        </td>

                        <td className="px-5 py-4 text-xs text-slate-600">
                          {formatDateTime(doc.created_at)}
                        </td>

                        <td className="px-5 py-4">
                          {doc.status === "extracted" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                              <CheckCircle2 className="h-3 w-3" />
                              Đã trích xuất
                            </span>
                          ) : doc.status === "extracting" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                              <span className="h-2 w-2 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                              Đang xử lý
                            </span>
                          ) : doc.status === "error" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-xs font-medium text-red-700" title={doc.error_message || "Lỗi"}>
                              <AlertCircle className="h-3 w-3" />
                              Lỗi
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                              <Clock className="h-3 w-3" />
                              Chờ trích xuất
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handlePreview(doc)}
                              className="h-8 gap-1 text-xs"
                              title="Xem trước tài liệu"
                            >
                              <Eye className="h-3.5 w-3.5" />
                              Xem
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setReplacingDocId(doc.id);
                                replaceInputRef.current?.click();
                              }}
                              className="h-8 gap-1 text-xs text-slate-600 hover:text-slate-900"
                              title="Thay thế file khác"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              Thay thế
                            </Button>

                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => setDeletingDoc(doc)}
                              className="h-8 w-8 text-red-600 hover:bg-red-50 hover:border-red-200"
                              title="Xóa chứng từ"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preview Modal */}
      {previewDoc && (
        <Modal
          isOpen={!!previewDoc}
          onClose={() => setPreviewDoc(null)}
          title={`Xem trước: ${previewDoc.file_name}`}
          description={`Loại chứng từ: ${getDocumentTypeById(previewDoc.doc_type).name}`}
          maxWidth="4xl"
        >
          <div className="mt-4 max-h-[75vh] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4">
            {previewLoading ? (
              <div className="py-12 text-center">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                <p className="mt-2 text-xs text-slate-500">Đang nạp xem trước...</p>
              </div>
            ) : previewType === "pdf" && previewContent ? (
              <iframe
                src={previewContent}
                className="h-[65vh] w-full rounded-md border border-slate-300"
                title={previewDoc.file_name}
              />
            ) : previewType === "docx" && previewContent ? (
              <div
                className="prose prose-sm max-w-none rounded-md bg-white p-6 shadow-xs leading-relaxed"
                dangerouslySetInnerHTML={{ __html: previewContent }}
              />
            ) : (
              <div className="py-12 text-center text-sm text-slate-500">
                Không thể hiển thị xem trước trực tiếp. Bạn có thể thay thế hoặc tiến hành trích xuất dữ liệu.
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Delete Confirmation Modal */}
      {deletingDoc && (
        <ConfirmDialog
          isOpen={!!deletingDoc}
          onClose={() => setDeletingDoc(null)}
          onConfirm={handleDelete}
          title="Xác nhận xóa chứng từ?"
          description={`Bạn có chắc chắn muốn xóa file "${deletingDoc.file_name}"? Mọi kết quả trích xuất liên quan đến file này cũng sẽ bị xóa bỏ.`}
          confirmText="Xóa file"
          cancelText="Hủy bỏ"
          variant="destructive"
        />
      )}
    </div>
  );
}
