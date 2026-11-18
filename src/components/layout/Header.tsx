"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ship, PlusCircle, Search, Sparkles, FolderKanban } from "lucide-react";

export function Header() {
  const pathname = usePathname();

  const navItems = [
    { label: "Hồ sơ tàu", href: "/vessels", icon: FolderKanban },
    { label: "Tạo hồ sơ mới", href: "/vessels/new", icon: PlusCircle },
    { label: "Tra cứu & Lưu trữ", href: "/search", icon: Search },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo & App Title */}
        <div className="flex items-center gap-3">
          <Link href="/vessels" className="flex items-center gap-2.5 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20 group-hover:bg-blue-700 transition">
              <Ship className="h-5 w-5" />
            </div>
            <div>
              <span className="text-base font-bold tracking-tight text-slate-900">
                Khai Báo Tàu Nhập Cảnh
              </span>
              <span className="block text-[11px] font-medium text-slate-500">
                Hệ thống trích xuất chứng từ & lập tờ khai tự động
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="ml-8 hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== "/vessels" && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Quick Action */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700">
            <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
            <span>AI Claude Trích Xuất Sẵn Sàng</span>
          </div>
          <Link
            href="/vessels/new"
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition"
          >
            <PlusCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Tạo hồ sơ mới</span>
            <span className="sm:hidden">Tạo mới</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
