"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ship,
  Plus,
  Search,
  Filter,
  Calendar,
  Anchor,
  Clock,
  Trash2,
  Edit,
  RefreshCw,
  FolderOpen,
} from "lucide-react";
import { VesselFile } from "@/types/database";
import { VESSEL_STATUS_MAP } from "@/lib/constants/vessel";
import { VesselStatusBadge } from "@/components/vessels/VesselStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/utils";
import { vesselStore } from "@/lib/store/vesselStore";

export default function VesselsListPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [vessels, setVessels] = useState<VesselFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"eta" | "created_at">("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Deletion modal state
  const [deletingVessel, setDeletingVessel] = useState<VesselFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchVessels = async () => {
    setLoading(true);
    try {
      const data = await vesselStore.getVessels();
      setVessels(data || []);
    } catch (err: any) {
      toast(err?.message || "Lỗi tải danh sách hồ sơ tàu", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVessels();
  }, [sortBy, sortOrder]);

  const handleDelete = async () => {
    if (!deletingVessel) return;
    setIsDeleting(true);

    try {
      await vesselStore.deleteVessel(deletingVessel.id);
      toast(`Đã xóa hồ sơ tàu ${deletingVessel.vessel_name}`, "success");
      setVessels((prev) => prev.filter((v) => v.id !== deletingVessel.id));
      setDeletingVessel(null);
    } catch (err: any) {
      toast(err?.message || "Lỗi khi xóa hồ sơ", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered & sorted vessels
  const filteredVessels = useMemo(() => {
    return vessels
      .filter((v) => {
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch =
          !q ||
          v.vessel_name.toLowerCase().includes(q) ||
          v.imo_number.includes(q) ||
          v.voyage_number.toLowerCase().includes(q) ||
          v.arrival_port.toLowerCase().includes(q);

        const matchesStatus =
          statusFilter === "all" || v.status === statusFilter;

        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        const timeA = new Date(a[sortBy]).getTime();
        const timeB = new Date(b[sortBy]).getTime();
        return sortOrder === "asc" ? timeA - timeB : timeB - timeA;
      });
  }, [vessels, searchQuery, statusFilter, sortBy, sortOrder]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Ship className="h-7 w-7 text-blue-600" />
            Hồ Sơ Khai Báo Tàu Nhập Cảnh
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Quản lý các chuyến tàu nhập cảnh, tự động trích xuất chứng từ và xuất mẫu Excel
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchVessels}
            className="flex items-center gap-1.5"
            title="Làm mới danh sách"
          >
            <RefreshCw className="h-4 w-4" />
            Làm mới
          </Button>

          <Link href="/vessels/new">
            <Button className="flex items-center gap-2 shadow-xs">
              <Plus className="h-4 w-4" />
              Tạo hồ sơ tàu mới
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <Card className="border-slate-200 shadow-xs">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Search */}
            <div className="relative sm:col-span-2">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Tìm theo tên tàu, số IMO, số chuyến, cảng đến..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Filter by status */}
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-xs focus:border-blue-600 focus:outline-none"
              >
                <option value="all">Tất cả trạng thái</option>
                {Object.entries(VESSEL_STATUS_MAP).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Sort */}
            <div>
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split("-") as [
                    "eta" | "created_at",
                    "asc" | "desc"
                  ];
                  setSortBy(field);
                  setSortOrder(order);
                }}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-xs focus:border-blue-600 focus:outline-none"
              >
                <option value="created_at-desc">Mới tạo nhất trước</option>
                <option value="created_at-asc">Cũ nhất trước</option>
                <option value="eta-asc">ETA gần nhất trước</option>
                <option value="eta-desc">ETA xa nhất trước</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Vessel List Table */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 w-full animate-pulse rounded-xl bg-white border border-slate-200"
            />
          ))}
        </div>
      ) : filteredVessels.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-300 p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <Anchor className="h-7 w-7" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-900">
            {searchQuery || statusFilter !== "all"
              ? "Không tìm thấy hồ sơ phù hợp"
              : "Chưa có hồ sơ tàu nào"}
          </h3>
          <p className="mt-1 text-sm text-slate-500 max-w-md mx-auto">
            {searchQuery || statusFilter !== "all"
              ? "Hãy thử thay đổi từ khóa tìm kiếm hoặc bỏ lọc trạng thái để xem lại toàn bộ hồ sơ."
              : "Bắt đầu bằng cách tạo hồ sơ cho chuyến tàu nhập cảnh đầu tiên để tải chứng từ và trích xuất dữ liệu."}
          </p>
          <div className="mt-6">
            <Link href="/vessels/new">
              <Button className="inline-flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Tạo hồ sơ tàu ngay
              </Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-700">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3.5">Tên tàu / IMO</th>
                  <th className="px-5 py-3.5">Số chuyến</th>
                  <th className="px-5 py-3.5">Cảng đến</th>
                  <th className="px-5 py-3.5">ETA (Dự kiến đến)</th>
                  <th className="px-5 py-3.5">Trạng thái</th>
                  <th className="px-5 py-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVessels.map((v) => (
                  <tr
                    key={v.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition">
                          <Ship className="h-5 w-5" />
                        </div>
                        <div>
                          <Link
                            href={`/vessels/${v.id}`}
                            className="font-bold text-slate-900 hover:text-blue-600 hover:underline flex items-center gap-1.5"
                          >
                            {v.vessel_name}
                          </Link>
                          <div className="text-xs text-slate-500 font-mono">
                            IMO: <span className="font-semibold">{v.imo_number}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-4 font-mono font-medium text-slate-800">
                      {v.voyage_number}
                    </td>

                    <td className="px-5 py-4">
                      <div className="text-slate-900 font-medium">{v.arrival_port}</div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1.5 text-slate-900 font-medium">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        {formatDateTime(v.eta)}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <VesselStatusBadge status={v.status} />
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link href={`/vessels/${v.id}`}>
                          <Button
                            variant="default"
                            size="sm"
                            className="h-8 gap-1.5 text-xs font-semibold shadow-xs"
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                            Xử lý hồ sơ
                          </Button>
                        </Link>

                        <Link href={`/vessels/${v.id}/edit`}>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 text-slate-600 hover:text-slate-900"
                            title="Sửa thông tin tàu"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                        </Link>

                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setDeletingVessel(v)}
                          className="h-8 w-8 text-red-600 hover:bg-red-50 hover:border-red-200"
                          title="Xóa hồ sơ"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-3 text-xs text-slate-500 flex justify-between items-center">
            <span>
              Tổng số: <strong>{filteredVessels.length}</strong> hồ sơ tàu
            </span>
            <span>Hệ thống trực tiếp - Dữ liệu tự động đồng bộ</span>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingVessel && (
        <ConfirmDialog
          isOpen={!!deletingVessel}
          onClose={() => setDeletingVessel(null)}
          onConfirm={handleDelete}
          title="Xác nhận xóa hồ sơ tàu?"
          description={`Bạn có chắc chắn muốn xóa hồ sơ tàu "${deletingVessel.vessel_name}" (IMO: ${deletingVessel.imo_number})? Toàn bộ chứng từ, kết quả trích xuất và file xuất liên quan cũng sẽ bị xóa vĩnh viễn. Hành động này không thể hoàn tác.`}
          confirmText="Xóa vĩnh viễn"
          cancelText="Hủy bỏ"
          variant="destructive"
          loading={isDeleting}
        />
      )}
    </div>
  );
}
