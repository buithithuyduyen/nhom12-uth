import { Suspense } from "react";
import EditVesselContent from "./EditVesselContent";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditVesselPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-16 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="mt-2 text-sm text-slate-500">Đang tải thông tin hồ sơ...</p>
        </div>
      }
    >
      <EditVesselContent id={id} />
    </Suspense>
  );
}
