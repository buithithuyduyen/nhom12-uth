"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Ship, Lock, Mail, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/vessels";
  const { toast } = useToast();

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email || !password) {
      setErrorMessage("Vui lòng nhập đầy đủ Email và Mật khẩu");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          if (error.message.includes("Invalid login credentials")) {
            setErrorMessage("Email hoặc mật khẩu không chính xác.");
          } else {
            setErrorMessage(error.message);
          }
          return;
        }

        if (data.session) {
          toast("Đăng nhập thành công!", "success");
          router.push(redirectTo);
          router.refresh();
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          setErrorMessage(error.message);
          return;
        }

        if (data.user && !data.session) {
          toast("Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản.", "success");
          setMode("signin");
        } else if (data.session) {
          toast("Đăng ký & đăng nhập thành công!", "success");
          router.push(redirectTo);
          router.refresh();
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Đã xảy ra lỗi không xác định khi kết nối dịch vụ.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-slate-200 shadow-md">
      <CardHeader className="space-y-1 pb-4">
        {/* Tabs toggle */}
        <div className="flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => {
              setMode("signin");
              setErrorMessage(null);
            }}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition cursor-pointer ${
              mode === "signin"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("signup");
              setErrorMessage(null);
            }}
            className={`flex-1 rounded-md py-1.5 text-xs font-semibold transition cursor-pointer ${
              mode === "signup"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Đăng ký tài khoản
          </button>
        </div>

        <CardTitle className="pt-2 text-lg">
          {mode === "signin" ? "Đăng nhập hệ thống" : "Đăng ký tài khoản nhân viên"}
        </CardTitle>
        <CardDescription>
          {mode === "signin"
            ? "Nhập tài khoản để quản lý hồ sơ và chứng từ tàu của bạn"
            : "Mỗi nhân viên chỉ xem và xử lý các hồ sơ do chính mình quản lý (RLS)"}
        </CardDescription>
      </CardHeader>

      <CardContent>
        {errorMessage && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email" required>
              Địa chỉ Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                id="email"
                type="email"
                placeholder="nhanvien@shippingagency.vn"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" required>
                Mật khẩu
              </Label>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9"
                required
                minLength={6}
              />
            </div>
            {mode === "signup" && (
              <p className="text-[11px] text-slate-500">Tối thiểu 6 ký tự</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full font-medium"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Đang xử lý...
              </span>
            ) : mode === "signin" ? (
              <span className="flex items-center justify-center gap-2">
                Đăng nhập ngay
                <ArrowRight className="h-4 w-4" />
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                Tạo tài khoản mới
                <ArrowRight className="h-4 w-4" />
              </span>
            )}
          </Button>
        </form>

        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          <span>Dữ liệu được bảo mật bằng Supabase Row Level Security</span>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-md space-y-6">
        {/* App Logo & Welcome */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/30">
            <Ship className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Hồ Sơ Khai Báo Tàu Nhập Cảnh
          </h1>
          <p className="text-sm text-slate-500">
            Hệ thống trích xuất chứng từ & lập báo cáo tự động cho đại lý tàu
          </p>
        </div>

        <Suspense
          fallback={
            <div className="h-64 rounded-xl border border-slate-200 bg-white p-6 shadow-md flex items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          }
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
