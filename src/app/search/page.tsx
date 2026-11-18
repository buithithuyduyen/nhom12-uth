"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  Search,
  Ship,
  Filter,
  Calendar,
  Clock,
  ArrowRight,
  FolderOpen,
  RefreshCw,
  FileSpreadsheet,
  FileText,
} from "lucide-react";
import { VesselFile, VesselFileStatus } from "@/types/database";
import { VIETNAM_SEAPORTS, VESSEL_STATUS_MAP } from "@/lib/constants/vessel";
import { VesselStatusBadge } from "@/components/vessels/VesselStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { vesselStore } from "@/lib/store/vesselStore";

export default function SearchAndArchivePage() {
  const [vessels, setVessels] = useState<VesselFile[]>([]);
  const [loading, setLoading] = useState(true);

  // Bộ lọc nâng cao
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [portFilter, setPortFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [sortBy, setSortBy] = useState<"eta" | "created_at" | "vessel_name">("created_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const fetchVessels = async () => {
    setLoading(true);
    try {
      const data = await vesselStore.getVessels();
      setVessels(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVessels();
  }, []);

  const handleResetFilters = () => {
    setKeyword("");
    setStatusFilter("all");
    setPortFilter("all");
    setStartDate("");
    setEndDate("");
    setSortBy("created_at");
    setSortOrder("desc");
  };

  // Áp dụng bộ lọc
  const filtered = useMemo(() => {
    return vessels
      .filter((v) => {
        // Từ khóa (Tên tàu, IMO, Số chuyến)
        if (keyword.trim()) {
          const q = keyword.toLowerCase().trim();
          const matches =
            v.vessel_name.toLowerCase().includes(q) ||
            v.imo_number.includes(q) ||
            v.voyage_number.toLowerCase().includes(q);
          if (!matches) return false;
        }

        // Lọc trạng thái
        if (statusFilter !== "all" && v.status !== statusFilter) {
          return false;
        }

        // Lọc cảng đến
        if (portFilter !== "all" && !v.arrival_port.includes(portFilter)) {
          return false;
        }

        // Khoảng ngày ETA
        if (startDate) {
          const vEta = new Date(v.eta).getTime();
          const start = new Date(startDate).getTime();
          if (vEta < start) return false;
        }

        if (endDate) {
          const vEta = new Date(v.eta).getTime();
          const end = new Date(endDate + "T23:59:59").getTime();
          if (vEta > end) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "vessel_name") {
          return sortOrder === "asc"
            ? a.vessel_name.localeCompare(b.vessel_name)
            : b.vessel_name.localeCompare(a.vessel_name);
        }
        const timeA = new Date(a[sortBy]).getTime();
        const timeB = new Date(b[sortBy]).getTime();
        return sortOrder === "asc" ? timeA - timeB : timeB - timeA;
      });
  }, [vessels, keyword, statusFilter, portFilter, startDate, endDate, sortBy, sortOrder]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <Search className="h-7 w-7 text-blue-600" />
            Tra Cứu & Lưu Trữ Hồ Sơ Tàu
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Tra cứu nhanh theo tên tàu, số IMO, cảng đến, lọc theo khoảng thời gian ETA và mở lại hồ sơ để tiếp tục xử lý
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchVessels}
          className="gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className="h-4 w-4" />
          Làm mới
        </Button>
      </div>

      {/* Advanced Filter Box */}
      <Card className="border-slate-200 shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4 text-blue-600" />
            Bộ lọc tìm kiếm nâng cao
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Từ khóa */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="searchKeyword">Từ khóa tìm kiếm</Label>
              <Input
                id="searchKeyword"
                placeholder="Nhập tên tàu, số IMO (7 số), số chuyến..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>

            {/* Trạng thái */}
            <div className="space-y-1.5">
              <Label htmlFor="filterStatus">Trạng thái hồ sơ</Label>
              <select
                id="filterStatus"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-xs focus:border-blue-600 focus:outline-none"
              >
                <option value="all">Tất cả trạng thái</option>
                {Object.entries(VESSEL_STATUS_MAP).map(([k, meta]) => (
                  <option key={k} value={k}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Cảng đến */}
            <div className="space-y-1.5">
              <Label htmlFor="filterPort">Cảng đến</Label>
              <select
                id="filterPort"
                value={portFilter}
                onChange={(e) => setPortFilter(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-xs focus:border-blue-600 focus:outline-none"
              >
                <option value="all">Tất cả cảng đến</option>
                {VIETNAM_SEAPORTS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* ETA từ ngày */}
            <div className="space-y-1.5">
              <Label htmlFor="startDate">ETA từ ngày</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            {/* ETA đến ngày */}
            <div className="space-y-1.5">
              <Label htmlFor="endDate">ETA đến ngày</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>

            {/* Sắp xếp */}
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="sortSetting">Sắp xếp theo</Label>
              <select
                id="sortSetting"
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [field, ord] = e.target.value.split("-") as [
                    "eta" | "created_at" | "vessel_name",
                    "asc" | "desc"
                  ];
                  setSortBy(field);
                  setSortOrder(ord);
                }}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 py-1 text-sm shadow-xs focus:border-blue-600 focus:outline-none"
              >
                <option value="created_at-desc">Ngày tạo: Mới nhất trước</option>
                <option value="created_at-asc">Ngày tạo: Cũ nhất trước</option>
                <option value="eta-asc">ETA: Gần nhất trước</option>
                <option value="eta-desc">ETA: Xa nhất trước</option>
                <option value="vessel_name-asc">Tên tàu: A → Z</option>
                <option value="vessel_name-desc">Tên tàu: Z → A</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <span className="text-xs text-slate-500">
              Tìm thấy <strong>{filtered.length}</strong> kết quả phù hợp
            </span>
            <Button variant="ghost" size="sm" onClick={handleResetFilters} className="text-xs">
              Đặt lại bộ lọc
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card className="border-slate-200 shadow-xs">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Đang tra cứu dữ liệu hồ sơ...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-900">
                Không tìm thấy hồ sơ tàu nào khớp với bộ lọc
              </p>
              <p className="text-xs text-slate-500">
                Hãy thử nới lỏng từ khóa hoặc mở rộng khoảng ngày ETA
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                  <tr>
                    <th className="px-5 py-3.5">Tên tàu / IMO</th>
                    <th className="px-5 py-3.5">Số chuyến</th>
                    <th className="px-5 py-3.5">Cảng đến</th>
                    <th className="px-5 py-3.5">ETA (Thời gian đến)</th>
                    <th className="px-5 py-3.5">Trạng thái hồ sơ</th>
                    <th className="px-5 py-3.5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/80 transition">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                            <Ship className="h-4 w-4" />
                          </div>
                          <div>
                            <Link
                              href={`/vessels/${v.id}`}
                              className="font-bold text-slate-900 hover:text-blue-600 hover:underline"
                            >
                              {v.vessel_name}
                            </Link>
                            <span className="block text-xs font-mono text-slate-500">
                              IMO: {v.imo_number}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4 font-mono font-medium text-slate-800">
                        {v.voyage_number}
                      </td>

                      <td className="px-5 py-4 text-slate-900 font-medium">
                        {v.arrival_port}
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
                        <Link href={`/vessels/${v.id}`}>
                          <Button
                            variant="default"
                            size="sm"
                            className="h-8 gap-1.5 text-xs font-semibold shadow-xs"
                          >
                            <FolderOpen className="h-3.5 w-3.5" />
                            Mở hồ sơ
                          </Button>
                        </Link>
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
