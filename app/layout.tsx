import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export const metadata: Metadata = {
  title: "MarineDoc AI",
  description: "Trích xuất chứng từ hàng hải và điền vào file Excel mẫu NSW",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className="h-full">
      <body className="h-full bg-[#F8FAFC] text-slate-900 antialiased">
        <TooltipProvider delay={250}>{children}</TooltipProvider>
        <Toaster position="top-right" richColors closeButton duration={5000} />
      </body>
    </html>
  );
}
