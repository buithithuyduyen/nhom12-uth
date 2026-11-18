"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ship,
  Edit,
  ArrowLeft,
  Calendar,
  Clock,
  ArrowRight,
  Info,
  RefreshCw,
} from "lucide-react";
import { VesselFile } from "@/types/database";
import { VesselStatusBadge } from "@/components/vessels/VesselStatusBadge";
import { VesselWorkflowSteps } from "@/components/vessels/VesselWorkflowSteps";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/utils";
import { vesselStore } from "@/lib/store/vesselStore";

import { VesselDocumentsTab } from "@/components/vessels/tabs/VesselDocumentsTab";
import { VesselExtractionTab } from "@/components/vessels/tabs/VesselExtractionTab";
import { VesselReconciliationTab } from "@/components/vessels/tabs/VesselReconciliationTab";
import { VesselExportTab } from "@/components/vessels/tabs/VesselExportTab";

interface Props {
  id: string;
}

export default function VesselDetailContent({ id }: Props) {
  const router = useRouter();
  const { toast } = useToast();

  const [vessel, setVessel] = useState<VesselFile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("info");

  const fetchVessel = async () => {
    setLoading(true);
    try {
      const data = await vesselStore.getVesselById(id);
      if (!data) {
        toast("Không tìm thấy hồ sơ tàu", "error");
        router.push("/vessels");
        return;
      }
      setVessel(data);
    } catch (err: any) {
      toast(err?.message || "Lỗi tải thông tin hồ sơ tàu", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVessel();
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="mt-2 text-sm text-slate-500">Đang nạp hồ sơ tàu...</p>
      </div>
    );
  }

  if (!vessel) return null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Breadcrumb & Navigation */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link
            href="/vessels"
            className="flex items-center gap-1 hover:text-slate-900 transition"
          >
            <ArrowLeft className="h-4 w-4" />
            Danh sách hồ sơ
          </Link>
          <span>/</span>
          <span className="font-semibold text-slate-900 truncate">
            {vessel.vessel_name} (IMO: {vessel.imo_number})
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchVessel}
            className="gap-1.5"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Làm mới
          </Button>

          <Link href={`/vessels/${vessel.id}/edit`}>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Edit className="h-3.5 w-3.5" />
              Sửa hồ sơ
            </Button>
          </Link>
        </div>
      </div>

      {/* Vessel Header Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Ship className="h-8 w-8" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  {vessel.vessel_name}
                </h1>
                <VesselStatusBadge status={vessel.status} />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-600">
                <span className="font-mono">
                  IMO: <strong className="text-slate-900">{vessel.imo_number}</strong>
                </span>
                <span>•</span>
                <span>
                  Chuyến: <strong className="text-slate-900">{vessel.voyage_number}</strong>
                </span>
                <span>•</span>
                <span>
                  Cảng đến: <strong className="text-slate-900">{vessel.arrival_port}</strong>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  ETA: <strong className="text-slate-900">{formatDateTime(vessel.eta)}</strong>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5-Step Stepper Bar */}
      <VesselWorkflowSteps
        currentStatus={vessel.status}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
      />

      {/* Tab 1: Thông tin hồ sơ tàu */}
      {activeTab === "info" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 shadow-xs">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-600" />
                Chi tiết khai báo hồ sơ tàu
              </CardTitle>
              <CardDescription>
                Thông tin cơ bản về chuyến tàu nhập cảnh đã được đăng ký trong hệ thống
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl bg-slate-50 p-4 border border-slate-100">
                <div>
                  <span className="text-xs text-slate-500 block">Tên tàu</span>
                  <span className="text-sm font-bold text-slate-900">
                    {vessel.vessel_name}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Số IMO (7 chữ số)</span>
                  <span className="text-sm font-mono font-bold text-blue-700">
                    {vessel.imo_number}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Số chuyến</span>
                  <span className="text-sm font-mono font-semibold text-slate-900">
                    {vessel.voyage_number}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Cảng đến</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {vessel.arrival_port}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Thời gian dự kiến đến (ETA)</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {formatDateTime(vessel.eta)}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-slate-500 block">Thời điểm tạo hồ sơ</span>
                  <span className="text-sm text-slate-700">
                    {formatDateTime(vessel.created_at)}
                  </span>
                </div>
              </div>

              {vessel.notes && (
                <div className="rounded-xl border border-slate-200 p-4">
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Ghi chú nội bộ
                  </h4>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">
                    {vessel.notes}
                  </p>
                </div>
              )}

              {/* Next step CTA */}
              <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                <div className="space-y-0.5">
                  <h4 className="text-sm font-semibold text-blue-950">
                    Bước tiếp theo: Tải lên chứng từ
                  </h4>
                  <p className="text-xs text-blue-700">
                    Kéo thả Bản khai chung, Danh sách thuyền viên, Bản khai hàng hóa... dạng PDF hoặc Word.
                  </p>
                </div>
                <Button
                  onClick={() => setActiveTab("documents")}
                  className="gap-1.5 shadow-xs"
                >
                  Tải chứng từ
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quy trình khai báo */}
          <Card className="shadow-xs">
            <CardHeader>
              <CardTitle className="text-base">Quy trình 5 bước</CardTitle>
              <CardDescription>
                Luồng chuẩn xử lý hồ sơ tàu nhập cảnh
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                {
                  title: "1. Tạo hồ sơ tàu",
                  desc: "Nhập tên tàu, số IMO chuẩn 7 số, số chuyến, cảng đến, ETA.",
                  done: true,
                },
                {
                  title: "2. Tải chứng từ",
                  desc: "Kéo thả file PDF, DOCX chứng từ liên quan của tàu.",
                  done: vessel.status !== "draft",
                },
                {
                  title: "3. Tự động trích xuất AI",
                  desc: "Claude trích xuất thông tin có độ tin cậy và trích dẫn.",
                  done: ["extracted", "confirmed", "excel_exported"].includes(vessel.status),
                },
                {
                  title: "4. Đối chiếu & Xác nhận",
                  desc: "Bảng đối chiếu màu sắc phát hiện lệch dữ liệu, nhân viên duyệt.",
                  done: ["confirmed", "excel_exported"].includes(vessel.status),
                },
                {
                  title: "5. Xuất Excel mẫu",
                  desc: "Điền dữ liệu đã duyệt vào file mẫu Excel chuẩn không đổi format.",
                  done: vessel.status === "excel_exported",
                },
              ].map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2.5 rounded-lg border border-slate-100 p-2.5 bg-slate-50/50"
                >
                  <div
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                      s.done
                        ? "bg-emerald-600 text-white"
                        : "border border-slate-300 text-slate-400"
                    }`}
                  >
                    {s.done ? "✓" : idx + 1}
                  </div>
                  <div>
                    <h5 className="text-xs font-semibold text-slate-800">
                      {s.title}
                    </h5>
                    <p className="text-[11px] text-slate-500 mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab 2: Tải lên và quản lý chứng từ */}
      {activeTab === "documents" && (
        <VesselDocumentsTab
          vessel={vessel}
          onNextStep={() => setActiveTab("extraction")}
          onRefresh={fetchVessel}
        />
      )}

      {/* Tab 3: Tự động trích xuất bằng Claude API */}
      {activeTab === "extraction" && (
        <VesselExtractionTab
          vessel={vessel}
          onNextStep={() => setActiveTab("reconciliation")}
          onRefresh={fetchVessel}
        />
      )}

      {/* Tab 4: Đối chiếu và chỉnh sửa */}
      {activeTab === "reconciliation" && (
        <VesselReconciliationTab
          vessel={vessel}
          onNextStep={() => setActiveTab("export")}
          onRefresh={fetchVessel}
        />
      )}

      {/* Tab 5: Xuất Excel theo file mẫu */}
      {activeTab === "export" && (
        <VesselExportTab
          vessel={vessel}
          onRefresh={fetchVessel}
        />
      )}
    </div>
  );
}
