"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { VesselForm } from "@/components/vessels/VesselForm";
import { VesselFile } from "@/types/database";
import { useToast } from "@/components/ui/toast";
import { vesselStore } from "@/lib/store/vesselStore";

interface Props {
  id: string;
}

export default function EditVesselContent({ id }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [vessel, setVessel] = useState<VesselFile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await vesselStore.getVesselById(id);
      if (!data) {
        toast("Không tìm thấy hồ sơ tàu", "error");
        router.push("/vessels");
        return;
      }
      setVessel(data);
      setLoading(false);
    }
    load();
  }, [id, router, toast]);

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-16 text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="mt-2 text-sm text-slate-500">Đang tải thông tin hồ sơ...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {vessel && <VesselForm initialData={vessel} isEdit={true} />}
    </div>
  );
}
