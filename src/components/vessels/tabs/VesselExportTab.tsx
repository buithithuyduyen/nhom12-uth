"use client";

import { useState, useEffect, useRef } from "react";
import {
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  Clock,
  History,
  AlertTriangle,
  FileDown,
  Layers,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { ConfirmedDataRecord, ExportRecord, VesselFile } from "@/types/database";
import { DEFAULT_EXCEL_TEMPLATE, ExcelTemplateConfig } from "@/config/excelMapping";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/utils";
import { vesselStore } from "@/lib/store/vesselStore";
import ExcelJS from "exceljs";

interface Props {
  vessel: VesselFile;
  onRefresh: () => void;
}

export function VesselExportTab({ vessel, onRefresh }: Props) {
  const { toast } = useToast();
  const templateUploadRef = useRef<HTMLInputElement>(null);

  const [confirmedData, setConfirmedData] = useState<ConfirmedDataRecord | null>(null);
  const [exportsHistory, setExportsHistory] = useState<ExportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [customTemplateFile, setCustomTemplateFile] = useState<File | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const conf = await vesselStore.getConfirmedData(vessel.id);
      setConfirmedData(conf);

      const history = await vesselStore.getExports(vessel.id);
      setExportsHistory(history);
    } catch {
      toast("Không thể tải thông tin xuất Excel", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [vessel.id]);

  const isConfirmed = Boolean(confirmedData && Object.keys(confirmedData.data || {}).length > 0);

  // Tạo file Excel hoàn chỉnh bằng ExcelJS
  const generateAndDownloadExcel = async () => {
    if (!confirmedData) {
      toast("Chỉ được xuất file khi hồ sơ đã được xác nhận ở Bước 4", "error");
      return;
    }

    setExporting(true);

    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Hệ thống Khai báo tàu nhập cảnh";
      workbook.lastModifiedBy = confirmedData.confirmed_by || "Đại lý tàu";
      workbook.created = new Date();
      workbook.modified = new Date();

      let worksheet: ExcelJS.Worksheet;

      if (customTemplateFile) {
        // Nếu người dùng tải lên mẫu riêng, đọc và điền giữ nguyên format
        const arrayBuffer = await customTemplateFile.arrayBuffer();
        await workbook.xlsx.load(arrayBuffer);
        worksheet = workbook.getWorksheet(1) || workbook.addWorksheet("Bản khai chung");
      } else {
        // Tạo bảng mẫu chuẩn IMO FAL Form 1 đẹp mắt
        worksheet = workbook.addWorksheet("Bản khai chung");

        worksheet.columns = [
          { width: 5 },  // A
          { width: 22 }, // B: Label 1
          { width: 28 }, // C: Value 1
          { width: 5 },  // D
          { width: 5 },  // E
          { width: 22 }, // F: Label 2
          { width: 28 }, // G: Value 2
        ];

        // Tiêu đề
        worksheet.mergeCells("B2:G2");
        const titleCell = worksheet.getCell("B2");
        titleCell.value = "IMO GENERAL DECLARATION - BẢN KHAI CHUNG HÀNG HẢI";
        titleCell.font = { name: "Arial", size: 14, bold: true, color: { argb: "FF0F2E5C" } };
        titleCell.alignment = { horizontal: "center", vertical: "middle" };
        worksheet.getRow(2).height = 30;

        // Header labels
        worksheet.getCell("B4").value = "1. Tên tàu (Name of Ship):";
        worksheet.getCell("B5").value = "2. Số IMO (IMO Number):";
        worksheet.getCell("B6").value = "3. Quốc tịch tàu (Flag State):";
        worksheet.getCell("B8").value = "4. Cảng đến (Port of Arrival):";
        worksheet.getCell("B10").value = "5. Dung tích toàn phần (GT):";
        worksheet.getCell("B12").value = "6. Tổng số thuyền viên:";

        worksheet.getCell("F4").value = "Hô hiệu (Call Sign):";
        worksheet.getCell("F5").value = "Số chuyến (Voyage No):";
        worksheet.getCell("F6").value = "Thuyền trưởng (Master):";
        worksheet.getCell("F8").value = "Thời gian đến (ETA):";
        worksheet.getCell("F10").value = "Dung tích hữu dụng (NT):";

        // Định dạng nhãn
        ["B4", "B5", "B6", "B8", "B10", "B12", "F4", "F5", "F6", "F8", "F10"].forEach((ref) => {
          const cell = worksheet.getCell(ref);
          cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FF334155" } };
        });
      }

      // Điền dữ liệu đã xác nhận vào các ô theo cấu hình ánh xạ
      DEFAULT_EXCEL_TEMPLATE.mappings.forEach((m) => {
        const val = confirmedData.data[m.sourceKey];
        if (val !== undefined && val !== null) {
          const cell = worksheet.getCell(m.cellCoordinate);
          cell.value = val;
          cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FF0F172A" } };
          cell.border = {
            bottom: { style: "thin", color: { argb: "FF94A3B8" } },
          };
        }
      });

      // Xuất file ra Buffer và tải xuống trình duyệt
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const fileName = `KhaiBao_${vessel.vessel_name}_${vessel.imo_number}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Lưu lịch sử xuất
      const savedExp = await vesselStore.saveExport({
        vessel_file_id: vessel.id,
        template_name: customTemplateFile ? customTemplateFile.name : DEFAULT_EXCEL_TEMPLATE.templateName,
        file_name: fileName,
        file_path: `exports/${vessel.id}/${fileName}`,
        exported_at: new Date().toISOString(),
      });

      setExportsHistory((prev) => [savedExp, ...prev]);

      // Cập nhật trạng thái tàu thành 'excel_exported'
      await vesselStore.updateVesselStatus(vessel.id, "excel_exported");
      toast("Đã xuất file Excel thành công!", "success");
      onRefresh();
    } catch (err: any) {
      toast(`Lỗi khi tạo file Excel: ${err?.message}`, "error");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Cảnh báo nếu chưa xác nhận */}
      {!isConfirmed && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-amber-900">
                Chưa thể xuất Excel: Hồ sơ chưa được xác nhận dữ liệu
              </h4>
              <p className="text-xs text-amber-800">
                Theo quy trình an toàn, bạn cần đối chiếu dữ liệu giữa các chứng từ và bấm <strong>"Xác nhận dữ liệu khai báo"</strong> tại bước 4 trước khi xuất file.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Export Card */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
                Xuất file Excel khai báo chuẩn hải quan & cảng vụ
              </CardTitle>
              <CardDescription>
                Hệ thống tự động điền các trường đã xác nhận vào đúng tọa độ ô trong file mẫu .xlsx
              </CardDescription>
            </div>

            <div className="flex items-center gap-2.5">
              <input
                type="file"
                ref={templateUploadRef}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setCustomTemplateFile(e.target.files[0]);
                    toast(`Đã nạp file mẫu riêng: ${e.target.files[0].name}`, "info");
                  }
                }}
                accept=".xlsx"
                className="hidden"
              />

              <Button
                variant="outline"
                size="sm"
                onClick={() => templateUploadRef.current?.click()}
                className="gap-1.5 text-xs h-9"
              >
                <Upload className="h-4 w-4" />
                {customTemplateFile ? "Đổi file mẫu .xlsx" : "Tải mẫu Excel khác"}
              </Button>

              <Button
                onClick={generateAndDownloadExcel}
                disabled={!isConfirmed || exporting}
                className="gap-2 text-xs font-bold h-9 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
              >
                <Download className="h-4 w-4" />
                {exporting ? "Đang xuất file..." : "Tải file Excel (.xlsx)"}
              </Button>
            </div>
          </div>

          {customTemplateFile && (
            <div className="mt-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center justify-between">
              <span>Đang áp dụng mẫu tùy chỉnh: <strong>{customTemplateFile.name}</strong></span>
              <button
                onClick={() => setCustomTemplateFile(null)}
                className="text-red-600 hover:underline font-semibold"
              >
                Dùng lại mẫu mặc định
              </button>
            </div>
          )}
        </CardHeader>

        {/* Xem trước bảng nội dung sẽ điền theo yêu cầu */}
        <CardContent className="space-y-4">
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>Xem trước ánh xạ dữ liệu vào ô Excel</span>
              <span className="text-[11px] font-normal text-slate-500">
                Cấu hình: <code className="font-mono text-blue-700">src/config/excelMapping.ts</code>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100/60 text-slate-600 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-2.5">Tên trường dữ liệu</th>
                    <th className="px-4 py-2.5">Tọa độ ô mẫu Excel</th>
                    <th className="px-4 py-2.5">Trang tính (Sheet)</th>
                    <th className="px-4 py-2.5">Giá trị sẽ điền</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {DEFAULT_EXCEL_TEMPLATE.mappings.map((m) => {
                    const val = confirmedData?.data ? confirmedData.data[m.sourceKey] : "-";
                    return (
                      <tr key={m.fieldKey} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-900">
                          {m.fieldLabel}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-blue-700">
                          {m.cellCoordinate}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 font-mono text-[11px]">
                          {m.sheetName}
                        </td>
                        <td className="px-4 py-2.5 font-semibold text-slate-900">
                          {val || <span className="text-slate-400 italic">Trống</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lịch sử xuất file Excel */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-5 w-5 text-slate-600" />
            Lịch sử các lần xuất file Excel ({exportsHistory.length})
          </CardTitle>
          <CardDescription>
            Danh sách các file Excel đã tạo cho chuyến tàu này
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {exportsHistory.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Chưa có lần xuất file nào cho hồ sơ tàu này. Bấm <strong>"Tải file Excel (.xlsx)"</strong> ở trên để tạo file đầu tiên.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-semibold border-y border-slate-200">
                  <tr>
                    <th className="px-5 py-3">Tên file đã xuất</th>
                    <th className="px-5 py-3">Tên mẫu áp dụng</th>
                    <th className="px-5 py-3">Thời gian xuất</th>
                    <th className="px-5 py-3 text-right">Tải lại</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {exportsHistory.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3 font-semibold text-slate-900 flex items-center gap-2">
                        <FileDown className="h-4 w-4 text-emerald-600" />
                        {exp.file_name}
                      </td>
                      <td className="px-5 py-3 text-slate-600">
                        {exp.template_name}
                      </td>
                      <td className="px-5 py-3 text-slate-600 font-mono">
                        {formatDateTime(exp.exported_at)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={generateAndDownloadExcel}
                          className="h-7 text-[11px] gap-1"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Tải về
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
