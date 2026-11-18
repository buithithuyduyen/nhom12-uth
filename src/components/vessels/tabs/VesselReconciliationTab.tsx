"use client";

import { useState, useEffect, useMemo } from "react";
import {
  GitCompare,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Save,
  ArrowRight,
  ShieldCheck,
  UserCheck,
  Edit2,
  Check,
} from "lucide-react";
import { DocumentRecord, ExtractionRecord, VesselFile, ConfirmedDataRecord } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { vesselStore } from "@/lib/store/vesselStore";

interface Props {
  vessel: VesselFile;
  onNextStep: () => void;
  onRefresh: () => void;
}

// Hàm chuẩn hóa chuỗi để so sánh chính xác
function normalizeString(val: any): string {
  if (val === null || val === undefined) return "";
  return String(val)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9]/g, "");
}

// Chuẩn hóa ngày giờ để so sánh
function normalizeDate(val: any): string {
  if (!val) return "";
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return normalizeString(val);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  } catch {
    return normalizeString(val);
  }
}

interface FieldComparison {
  key: string;
  label: string;
  dossierValue: string;
  docValues: Record<string, string>; // docId -> value
  status: "match" | "mismatch" | "missing";
  warningText?: string;
  recommendedValue: string;
}

export function VesselReconciliationTab({ vessel, onNextStep, onRefresh }: Props) {
  const { toast } = useToast();

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [extractions, setExtractions] = useState<Record<string, ExtractionRecord>>({});
  const [confirmedRecord, setConfirmedRecord] = useState<ConfirmedDataRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form values sau khi người dùng chọn hoặc sửa tay
  const [finalValues, setFinalValues] = useState<Record<string, string>>({});
  const [confirmedByName, setConfirmedByName] = useState<string>("Nhân viên đại lý hải quan");

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

      const confirmed = await vesselStore.getConfirmedData(vessel.id);
      setConfirmedRecord(confirmed);

      if (confirmed && confirmed.data) {
        setFinalValues(confirmed.data);
        if (confirmed.confirmed_by) setConfirmedByName(confirmed.confirmed_by);
      }
    } catch {
      toast("Không thể tải dữ liệu đối chiếu", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [vessel.id]);

  // Danh sách các trường cần đối chiếu bắt buộc
  const compareFields = useMemo(() => {
    const fields = [
      { key: "vessel_name", label: "Tên tàu (Vessel Name)", dossierVal: vessel.vessel_name, isDate: false },
      { key: "imo_number", label: "Số IMO (IMO Number)", dossierVal: vessel.imo_number, isDate: false },
      { key: "voyage_number", label: "Số chuyến (Voyage No.)", dossierVal: vessel.voyage_number, isDate: false },
      { key: "arrival_port", label: "Cảng đến (Port of Arrival)", dossierVal: vessel.arrival_port, isDate: false },
      { key: "eta", label: "Thời gian đến dự kiến (ETA)", dossierVal: vessel.eta, isDate: true },
      { key: "call_sign", label: "Hô hiệu (Call Sign)", dossierVal: "", isDate: false },
      { key: "flag_state", label: "Quốc tịch tàu (Flag State)", dossierVal: "", isDate: false },
      { key: "master_name", label: "Tên thuyền trưởng", dossierVal: "", isDate: false },
      { key: "gross_tonnage", label: "Dung tích toàn phần (GT)", dossierVal: "", isDate: false },
      { key: "net_tonnage", label: "Dung tích hữu dụng (NT)", dossierVal: "", isDate: false },
      { key: "total_crew", label: "Tổng số thuyền viên", dossierVal: "", isDate: false },
    ];

    const results: FieldComparison[] = [];

    fields.forEach((f) => {
      const docVals: Record<string, string> = {};
      const presentNormValues: string[] = [];

      if (f.dossierVal) {
        presentNormValues.push(f.isDate ? normalizeDate(f.dossierVal) : normalizeString(f.dossierVal));
      }

      documents.forEach((doc) => {
        const ext = extractions[doc.id];
        if (ext && ext.raw_json && ext.raw_json[f.key] && ext.raw_json[f.key].value !== null) {
          const rawVal = String(ext.raw_json[f.key].value);
          docVals[doc.id] = rawVal;
          presentNormValues.push(f.isDate ? normalizeDate(rawVal) : normalizeString(rawVal));
        }
      });

      // So sánh các giá trị đã chuẩn hóa
      let status: "match" | "mismatch" | "missing" = "match";
      let warningText: string | undefined = undefined;

      if (presentNormValues.length === 0) {
        status = "missing";
        warningText = `Thiếu dữ liệu: Chưa có nguồn nào cung cấp trường "${f.label}"`;
      } else {
        const firstVal = presentNormValues[0];
        const hasDiff = presentNormValues.some((v) => v !== firstVal);

        if (hasDiff) {
          status = "mismatch";
          warningText = `Cảnh báo không khớp: Dữ liệu "${f.label}" khác nhau giữa hồ sơ đã nhập và các chứng từ`;
        } else if (presentNormValues.length < 2 && ["vessel_name", "imo_number", "voyage_number"].includes(f.key)) {
          status = "missing";
          warningText = `Dữ liệu "${f.label}" chỉ có 1 nguồn, chưa được xác nhận chéo từ chứng từ`;
        }
      }

      const recommended =
        docVals[Object.keys(docVals)[0]] ||
        f.dossierVal ||
        "";

      results.push({
        key: f.key,
        label: f.label,
        dossierValue: f.dossierVal,
        docValues: docVals,
        status,
        warningText,
        recommendedValue: recommended,
      });
    });

    return results;
  }, [vessel, documents, extractions]);

  // Khởi tạo finalValues ban đầu từ các giá trị đối chiếu nếu chưa có confirmed
  useEffect(() => {
    if (!confirmedRecord) {
      const initials: Record<string, string> = {};
      compareFields.forEach((cf) => {
        initials[cf.key] = cf.recommendedValue;
      });
      setFinalValues(initials);
    }
  }, [compareFields, confirmedRecord]);

  // Danh sách cảnh báo tổng hợp ở đầu trang
  const warnings = useMemo(() => {
    return compareFields.filter((cf) => cf.status !== "match" && cf.warningText);
  }, [compareFields]);

  // Bấm chọn nhanh 1 giá trị vào ô giá trị cuối cùng
  const handleSelectValue = (key: string, val: string) => {
    setFinalValues((prev) => ({ ...prev, [key]: val }));
    toast(`Đã chọn giá trị cho "${key}"`, "info");
  };

  // Xác nhận dữ liệu
  const handleConfirm = async () => {
    setSaving(true);
    try {
      const saved = await vesselStore.saveConfirmedData(
        vessel.id,
        finalValues,
        confirmedByName.trim() || "Nhân viên đại lý"
      );

      // Cập nhật trạng thái tàu thành 'confirmed'
      await vesselStore.updateVesselStatus(vessel.id, "confirmed");

      setConfirmedRecord(saved);
      toast("Đã lưu và xác nhận bộ dữ liệu khai báo thành công!", "success");
      onRefresh();
    } catch {
      toast("Lỗi khi lưu dữ liệu xác nhận", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Warning Summary Banner ở đầu trang theo yêu cầu */}
      {warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" />
            <div className="flex-1 space-y-2">
              <h4 className="text-sm font-bold text-amber-900">
                Phát hiện {warnings.length} điểm cần lưu ý đối chiếu ({warnings.filter(w => w.status === "mismatch").length} không khớp, {warnings.filter(w => w.status === "missing").length} thiếu dữ liệu)
              </h4>
              <ul className="list-disc pl-5 text-xs text-amber-800 space-y-1">
                {warnings.map((w) => (
                  <li key={w.key}>
                    <strong>{w.label}:</strong> {w.warningText}
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-amber-700 italic">
                * Bấm trực tiếp vào giá trị ở các cột chứng từ để chọn hoặc gõ sửa tay ở cột "Giá trị chốt cuối cùng".
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 shadow-xs flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-emerald-900">Dữ liệu đối chiếu hoàn toàn khớp!</h4>
            <p className="text-xs text-emerald-700">Các thông tin then chốt giữa hồ sơ tàu và chứng từ đều đồng nhất.</p>
          </div>
        </div>
      )}

      {/* Confirmation Status Banner (nếu đã xác nhận) */}
      {confirmedRecord && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-900">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <span>
              Hồ sơ đã được xác nhận bởi: <strong>{confirmedRecord.confirmed_by}</strong> lúc{" "}
              <strong>{new Date(confirmedRecord.confirmed_at).toLocaleString("vi-VN")}</strong>
            </span>
          </div>

          <Button
            size="sm"
            onClick={onNextStep}
            className="gap-1.5 shadow-xs bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            Tiến hành xuất file Excel
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Reconciliation Matrix Table */}
      <Card className="shadow-xs border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <GitCompare className="h-5 w-5 text-blue-600" />
              Bảng ma trận đối chiếu đa nguồn
            </CardTitle>
            <CardDescription>
              So sánh đối soát từng trường dữ liệu giữa Hồ sơ đã nhập và từng file chứng từ
            </CardDescription>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 font-medium text-emerald-700">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Khớp
            </span>
            <span className="flex items-center gap-1 font-medium text-red-700">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Không khớp
            </span>
            <span className="flex items-center gap-1 font-medium text-amber-700">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Thiếu dữ liệu
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/80 text-slate-700 uppercase font-semibold border-y border-slate-200">
                <tr>
                  <th className="px-4 py-3 min-w-[170px] bg-slate-100">Trường dữ liệu</th>
                  <th className="px-4 py-3 min-w-[150px] bg-blue-50/70 border-x border-slate-200 text-blue-900">
                    Nguồn: Hồ sơ tàu đã nhập
                  </th>
                  {documents.map((doc) => (
                    <th key={doc.id} className="px-4 py-3 min-w-[180px] border-r border-slate-200 truncate" title={doc.file_name}>
                      Chứng từ: {doc.file_name}
                    </th>
                  ))}
                  <th className="px-4 py-3 min-w-[220px] bg-emerald-50/80 text-emerald-950 font-bold border-l border-emerald-200">
                    Giá trị chốt cuối cùng (Duyệt)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {compareFields.map((cf) => {
                  const isMatch = cf.status === "match";
                  const isMismatch = cf.status === "mismatch";
                  const isMissing = cf.status === "missing";

                  const rowBg = isMismatch
                    ? "bg-red-50/30"
                    : isMissing
                    ? "bg-amber-50/20"
                    : "hover:bg-slate-50/50";

                  return (
                    <tr key={cf.key} className={rowBg}>
                      {/* Tên trường & nhãn cảnh báo */}
                      <td className="px-4 py-3 font-semibold text-slate-900 bg-white/60">
                        <div className="flex items-center gap-1.5">
                          {isMismatch ? (
                            <AlertCircle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                          ) : isMissing ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                          ) : (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          )}
                          <span>{cf.label}</span>
                        </div>
                        <span className="block text-[10px] text-slate-400 font-mono pl-5">
                          {cf.key}
                        </span>
                      </td>

                      {/* Cột Hồ sơ tàu */}
                      <td
                        className={`px-4 py-3 border-x border-slate-200 bg-blue-50/20 cursor-pointer hover:bg-blue-100/40 transition ${
                          cf.dossierValue ? "font-medium text-slate-900" : "text-slate-400 italic"
                        }`}
                        onClick={() => cf.dossierValue && handleSelectValue(cf.key, cf.dossierValue)}
                        title="Bấm để chọn giá trị này"
                      >
                        {cf.dossierValue || "-"}
                      </td>

                      {/* Các cột từng chứng từ */}
                      {documents.map((doc) => {
                        const val = cf.docValues[doc.id];
                        return (
                          <td
                            key={doc.id}
                            className={`px-4 py-3 border-r border-slate-200 cursor-pointer hover:bg-slate-100 transition ${
                              val ? "font-medium text-slate-900" : "text-slate-400 italic"
                            }`}
                            onClick={() => val && handleSelectValue(cf.key, val)}
                            title="Bấm để chọn giá trị này"
                          >
                            {val || "-"}
                          </td>
                        );
                      })}

                      {/* Cột giá trị chốt (cho phép sửa tay) */}
                      <td className="px-4 py-2.5 bg-emerald-50/30 border-l border-emerald-200">
                        <Input
                          value={finalValues[cf.key] ?? ""}
                          onChange={(e) =>
                            setFinalValues((prev) => ({ ...prev, [cf.key]: e.target.value }))
                          }
                          placeholder="Nhập giá trị chuẩn..."
                          className="h-8 text-xs font-semibold bg-white border-emerald-300 focus-visible:ring-emerald-500"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation Actions Bar */}
      <Card className="shadow-xs border-slate-200">
        <CardContent className="p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <UserCheck className="h-5 w-5 text-blue-600" />
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 block">
                Họ tên người xác nhận hồ sơ:
              </label>
              <Input
                value={confirmedByName}
                onChange={(e) => setConfirmedByName(e.target.value)}
                placeholder="Nhập họ tên nhân viên..."
                className="h-8 w-64 text-xs font-medium"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleConfirm}
              disabled={saving}
              className="gap-2 shadow-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              <Save className="h-4 w-4" />
              {saving ? "Đang lưu..." : "Xác nhận dữ liệu khai báo"}
            </Button>

            {confirmedRecord && (
              <Button onClick={onNextStep} className="gap-2 shadow-xs">
                Sang bước xuất Excel
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
