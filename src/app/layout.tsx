import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { Header } from "@/components/layout/Header";

export const metadata: Metadata = {
  title: "Hồ sơ khai báo tàu nhập cảnh | Hệ thống đại lý tàu",
  description: "Phần mềm hỗ trợ đại lý tàu biển tự động trích xuất chứng từ và lập hồ sơ khai báo tàu nhập cảnh",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 antialiased font-sans">
        <ToastProvider>
          <Suspense fallback={<header className="h-16 border-b border-slate-200 bg-white" />}>
            <Header />
          </Suspense>
          <main className="flex-1 flex flex-col">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
