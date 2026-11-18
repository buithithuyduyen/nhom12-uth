"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ship, Save, AlertCircle, ArrowLeft } from "lucide-react";
import { VesselFile, VesselFileStatus } from "@/types/database";
import { VIETNAM_SEAPORTS, validateImoNumber, VESSEL_STATUS_MAP } from "@/lib/constants/vessel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { vesselStore } from "@/lib/store/vesselStore";

interface Props {
  initialData?: VesselFile;
  isEdit?: boolean;
}

export function VesselForm({ initialData, isEdit = false }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const [vesselName, setVesselName] = useState(initialData?.vessel_name || "");
  const [imoNumber, setImoNumber] = useState(initialData?.imo_number || "");
  const [voyageNumber, setVoyageNumber] = useState(initialData?.voyage_number || "");
  const [arrivalPort, setArrivalPort] = useState(
    initialData?.arrival_port || VIETNAM_SEAPORTS[0]
  );
  const [customPort, setCustomPort] = useState("");
  const [isCustomPort, setIsCustomPort] = useState(
    initialData ? !VIETNAM_SEAPORTS.includes(initialData.arrival_port) : false
  );

  const formatForInput = (iso?: string) => {
    if (!iso) {
      const now = new Date();
      now.setHours(now.getHours() + 24);
      return now.toISOString().slice(0, 16);
    }
    try {
      const d = new Date(iso);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    } catch {
      return "";
    }
  };

  const [eta, setEta] = useState(formatForInput(initialData?.eta));
  const [status, setStatus] = useState<VesselFileStatus>(
    initialData?.status || "draft"
  );
  const [notes, setNotes] = useState(initialData?.notes || "");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const handleImoChange = (val: string) => {
    const numeric = val.replace(/\D/g, "").slice(0, 7);
    setImoNumber(numeric);
    if (errors.imoNumber) {
      setErrors((prev) => ({ ...prev, imoNumber: "" }));
    }
  };

  const validate = () => {
    const errs: Record<string, string> = {};

    if (!vesselName.trim()) {
      errs.vesselName = "Vui lòng nhập tên tàu";
    }

    const imoValidation = validateImoNumber(imoNumber);
    if (!imoValidation.isValid) {
      errs.imoNumber = imoValidation.error || "Số IMO không hợp lệ";
    }

    if (!voyageNumber.trim()) {
      errs.voyageNumber = "Vui lòng nhập số chuyến";
    }

    const finalPort = isCustomPort ? customPort.trim() : arrivalPort.trim();
    if (!finalPort) {
      errs.arrivalPort = "Vui lòng chọn hoặc nhập cảng đến";
    }

    if (!eta) {
      errs.eta = "Vui lòng chọn thời gian dự kiến đến (ETA)";
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast("Vui lòng kiểm tra lại các trường thông tin bị lỗi", "error");
      return;
    }

    setLoading(true);

    try {
      const finalPort = isCustomPort ? customPort.trim() : arrivalPort.trim();
      const payload = {
        id: initialData?.id,
        vessel_name: vesselName.trim().toUpperCase(),
        imo_number: imoNumber.trim(),
        voyage_number: voyageNumber.trim().toUpperCase(),
        arrival_port: finalPort,
        eta: new Date(eta).toISOString(),
        status,
        notes: notes.trim() || null,
      };

      const saved = await vesselStore.saveVessel(payload);

      toast(
        isEdit
          ? "Cập nhật thông tin hồ sơ tàu thành công!"
          : "Tạo hồ sơ tàu mới thành công!",
        "success"
      );

      router.push(`/vessels/${saved.id}`);
      router.refresh();
    } catch (err: any) {
      toast(err?.message || "Lỗi lưu hồ sơ tàu", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="max-w-3xl mx-auto shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <Ship className="h-5 w-5 text-blue-600" />
              {isEdit ? "Chỉnh sửa thông tin hồ sơ tàu" : "Tạo hồ sơ tàu nhập cảnh mới"}
            </CardTitle>
            <CardDescription className="mt-1">
              Điền các thông tin cơ bản về tàu và chuyến nhập cảnh theo chuẩn khai báo hàng hải
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.back()}
            className="flex items-center gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            Quay lại
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Tên tàu */}
            <div className="space-y-1.5">
              <Label htmlFor="vesselName" required>
                Tên tàu (Vessel Name)
              </Label>
              <Input
                id="vesselName"
                placeholder="VD: EVER GIVEN, MAERSK MC-KINNEY"
                value={vesselName}
                onChange={(e) => {
                  setVesselName(e.target.value);
                  if (errors.vesselName) setErrors((p) => ({ ...p, vesselName: "" }));
                }}
                className={errors.vesselName ? "border-red-500" : ""}
              />
              {errors.vesselName && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {errors.vesselName}
                </p>
              )}
            </div>

            {/* Số IMO */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="imoNumber" required>
                  Số IMO (7 chữ số)
                </Label>
                <span className="text-[11px] text-slate-500">
                  {imoNumber.length}/7 chữ số
                </span>
              </div>
              <Input
                id="imoNumber"
                placeholder="VD: 9811000"
                value={imoNumber}
                onChange={(e) => handleImoChange(e.target.value)}
                maxLength={7}
                className={errors.imoNumber ? "border-red-500 font-mono tracking-wider" : "font-mono tracking-wider"}
              />
              {errors.imoNumber ? (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {errors.imoNumber}
                </p>
              ) : (
                <p className="text-[11px] text-slate-500">
                  Mã định danh duy nhất gồm đúng 7 số
                </p>
              )}
            </div>

            {/* Số chuyến */}
            <div className="space-y-1.5">
              <Label htmlFor="voyageNumber" required>
                Số chuyến (Voyage No.)
              </Label>
              <Input
                id="voyageNumber"
                placeholder="VD: V.2408N, 042S"
                value={voyageNumber}
                onChange={(e) => {
                  setVoyageNumber(e.target.value);
                  if (errors.voyageNumber) setErrors((p) => ({ ...p, voyageNumber: "" }));
                }}
                className={errors.voyageNumber ? "border-red-500 font-mono" : "font-mono"}
              />
              {errors.voyageNumber && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {errors.voyageNumber}
                </p>
              )}
            </div>

            {/* ETA */}
            <div className="space-y-1.5">
              <Label htmlFor="eta" required>
                Thời gian dự kiến đến (ETA)
              </Label>
              <Input
                id="eta"
                type="datetime-local"
                value={eta}
                onChange={(e) => {
                  setEta(e.target.value);
                  if (errors.eta) setErrors((p) => ({ ...p, eta: "" }));
                }}
                className={errors.eta ? "border-red-500" : ""}
              />
              {errors.eta && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {errors.eta}
                </p>
              )}
            </div>

            {/* Cảng đến */}
            <div className="sm:col-span-2 space-y-2">
              <Label htmlFor="arrivalPort" required>
                Cảng đến tại Việt Nam
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  id="arrivalPort"
                  value={isCustomPort ? "custom" : arrivalPort}
                  onChange={(e) => {
                    if (e.target.value === "custom") {
                      setIsCustomPort(true);
                    } else {
                      setIsCustomPort(false);
                      setArrivalPort(e.target.value);
                    }
                    if (errors.arrivalPort) setErrors((p) => ({ ...p, arrivalPort: "" }));
                  }}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  {VIETNAM_SEAPORTS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  <option value="custom">-- Cảng khác (Tự nhập tay) --</option>
                </select>

                {isCustomPort && (
                  <Input
                    placeholder="Nhập tên cảng biển..."
                    value={customPort}
                    onChange={(e) => setCustomPort(e.target.value)}
                    className={errors.arrivalPort ? "border-red-500" : ""}
                  />
                )}
              </div>
              {errors.arrivalPort && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {errors.arrivalPort}
                </p>
              )}
            </div>

            {/* Trạng thái hồ sơ (Chỉ hiện khi edit) */}
            {isEdit && (
              <div className="sm:col-span-2 space-y-1.5">
                <Label htmlFor="status">Trạng thái xử lý hồ sơ</Label>
                <select
                  id="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as VesselFileStatus)}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-sm focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
                >
                  {Object.entries(VESSEL_STATUS_MAP).map(([key, meta]) => (
                    <option key={key} value={key}>
                      Bước {meta.stepNumber}: {meta.label} - {meta.description}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Ghi chú */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="notes">Ghi chú nội bộ cho chuyến tàu (Tùy chọn)</Label>
              <textarea
                id="notes"
                rows={3}
                placeholder="Nhập ghi chú đặc biệt: cầu bến dự kiến, đại lý phụ, hoa tiêu, tiếp nhận nhiên liệu..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-white p-3 text-sm shadow-sm placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              disabled={loading}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2"
            >
              <Save className="h-4 w-4" />
              {loading
                ? "Đang lưu..."
                : isEdit
                ? "Lưu thay đổi"
                : "Tạo hồ sơ và tiếp tục"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
