import { Suspense } from "react";
import VesselDetailContent from "./VesselDetailContent";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function VesselDetailPage({ params }: PageProps) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-7xl px-4 py-16 text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="mt-2 text-sm text-slate-500">Đang nạp hồ sơ tàu...</p>
        </div>
      }
    >
      <VesselDetailContent id={id} />
    </Suspense>
  );
}
