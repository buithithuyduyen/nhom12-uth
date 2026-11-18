import { VesselFileStatus } from "@/types/database";
import { VESSEL_STATUS_MAP } from "@/lib/constants/vessel";
import { Badge } from "@/components/ui/badge";

interface Props {
  status: VesselFileStatus;
  className?: string;
}

export function VesselStatusBadge({ status, className }: Props) {
  const meta = VESSEL_STATUS_MAP[status] || VESSEL_STATUS_MAP.draft;

  return (
    <Badge variant={meta.variant} className={className}>
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {meta.label}
    </Badge>
  );
}
