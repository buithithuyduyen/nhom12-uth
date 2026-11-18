import { VesselFileStatus } from "@/types/database";
import { VESSEL_STATUS_MAP } from "@/lib/constants/vessel";
import { Check, Ship, UploadCloud, Cpu, GitCompare, FileSpreadsheet } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  currentStatus: VesselFileStatus;
  activeTab: string;
  onTabChange?: (tab: string) => void;
}

const STEPS = [
  { id: "info", stepNumber: 1, label: "1. Thông tin tàu", icon: Ship, statusKey: "draft" as VesselFileStatus },
  { id: "documents", stepNumber: 2, label: "2. Tải chứng từ", icon: UploadCloud, statusKey: "documents_uploaded" as VesselFileStatus },
  { id: "extraction", stepNumber: 3, label: "3. Trích xuất AI", icon: Cpu, statusKey: "extracted" as VesselFileStatus },
  { id: "reconciliation", stepNumber: 4, label: "4. Đối chiếu & Duyệt", icon: GitCompare, statusKey: "confirmed" as VesselFileStatus },
  { id: "export", stepNumber: 5, label: "5. Xuất file Excel", icon: FileSpreadsheet, statusKey: "excel_exported" as VesselFileStatus },
];

export function VesselWorkflowSteps({ currentStatus, activeTab, onTabChange }: Props) {
  const currentStepNum = VESSEL_STATUS_MAP[currentStatus]?.stepNumber || 1;

  return (
    <div className="w-full bg-white border border-slate-200 rounded-xl p-3 shadow-xs">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {STEPS.map((step) => {
          const isPassed = currentStepNum > step.stepNumber;
          const isCurrentStatus = currentStepNum === step.stepNumber;
          const isActiveTab = activeTab === step.id;
          const Icon = step.icon;

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => onTabChange && onTabChange(step.id)}
              className={cn(
                "flex items-center gap-2.5 p-2.5 rounded-lg text-left transition text-xs font-medium border cursor-pointer",
                isActiveTab
                  ? "border-blue-500 bg-blue-50 text-blue-900 shadow-xs ring-1 ring-blue-500"
                  : "border-slate-100 hover:border-slate-200 hover:bg-slate-50 text-slate-700"
              )}
            >
              <div
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  isPassed
                    ? "bg-emerald-500 text-white"
                    : isCurrentStatus
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-500"
                )}
              >
                {isPassed ? <Check className="h-3.5 w-3.5 stroke-[3]" /> : <Icon className="h-3.5 w-3.5" />}
              </div>
              <div className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{step.label}</span>
                <span className="block truncate text-[10px] text-slate-500">
                  {isPassed ? "Hoàn thành" : isCurrentStatus ? "Đang xử lý" : "Chờ xử lý"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
