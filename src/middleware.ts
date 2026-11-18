import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Không bắt buộc đăng nhập - cho phép tất cả người dùng truy cập trực tiếp
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
