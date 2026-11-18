# Hồ Sơ Khai Báo Tàu Nhập Cảnh (Inbound Vessel Declaration Dossier)

Hệ thống web app hỗ trợ nhân viên đại lý tàu biển tự động hóa quá trình lập hồ sơ khai báo tàu nhập cảnh: tải chứng từ (PDF, Word .docx), trích xuất thông tin tự động bằng AI (Claude API), đối chiếu dữ liệu giữa các nguồn chứng từ và xuất trực tiếp vào mẫu file Excel khai báo (.xlsx) giữ nguyên định dạng.

---

## 🛠 Công nghệ sử dụng
- **Frontend / Fullstack:** Next.js 16 (App Router) + TypeScript + Tailwind CSS
- **Database & Storage & Auth:** Supabase (PostgreSQL, Storage Buckets, Auth Email/Password, Row Level Security)
- **AI Trích xuất dữ liệu:** Anthropic Claude API (xử lý phía Server, không lộ API key ra trình duyệt)
- **Xử lý Excel:** ExcelJS (điền dữ liệu vào file mẫu `.xlsx`, giữ nguyên format và công thức)

---

## 🚀 Hướng dẫn cài đặt và chạy thử

### 1. Chuẩn bị tài khoản Supabase và chạy SQL Migration
1. Truy cập [https://supabase.com](https://supabase.com) và tạo một dự án mới (New Project).
2. Mở mục **SQL Editor** trong thanh menu bên trái của Dashboard Supabase.
3. Mở file [supabase/migrations/01_initial_schema.sql](file:///e:/webduyen/supabase/migrations/01_initial_schema.sql) trong dự án này, copy toàn bộ nội dung và dán vào SQL Editor trên Supabase, sau đó bấm **Run**.
   - Lệnh này sẽ tạo 5 bảng: `vessel_files`, `documents`, `extractions`, `confirmed_data`, `exports`.
   - Bật Row Level Security (RLS) để mỗi nhân viên chỉ thấy dữ liệu do mình tạo.
   - Thiết lập các bucket lưu trữ: `vessel-documents`, `excel-exports`, `excel-templates`.

### 2. Cấu hình biến môi trường
1. Tạo file `.env.local` tại thư mục gốc của dự án (copy từ `.env.example`):
   ```bash
   cp .env.example .env.local
   ```
2. Điền các giá trị thực tế của bạn vào `.env.local`:
   ```env
   # Lấy tại Supabase Dashboard -> Project Settings -> API
   NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6...

   # Khóa bí mật Claude API (từ https://console.anthropic.com)
   ANTHROPIC_API_KEY=sk-ant-api03-...

   # URL ứng dụng
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

### 3. Cài đặt thư viện và chạy ứng dụng tại máy cá nhân
```bash
# Cài đặt dependencies (nếu chưa cài)
npm install

# Khởi chạy chế độ phát triển
npm run dev
```
Mở trình duyệt tại [http://localhost:3000](http://localhost:3000).

---

## 🌐 Hướng dẫn Deploy lên Vercel
1. Đẩy mã nguồn lên kho chứa GitHub hoặc GitLab của bạn:
   ```bash
   git add .
   git commit -m "feat: setup project and vessel files management"
   git push origin main
   ```
2. Truy cập [https://vercel.com](https://vercel.com) và chọn **Add New...** -> **Project**.
3. Chọn kho chứa vừa tạo và tiến hành cấu hình:
   - Framework Preset: **Next.js**
   - Thêm các biến môi trường tại mục **Environment Variables**:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `ANTHROPIC_API_KEY`
     - `NEXT_PUBLIC_APP_URL` (điền URL domain Vercel cấp)
4. Nhấn **Deploy**.

---

## 📋 Lộ trình triển khai 6 chức năng chính
- [x] **Bước 1: Khung dự án + Đăng nhập + Hồ sơ tàu**
  - Khung Next.js 16 App Router, TypeScript, Tailwind CSS, cấu trúc dữ liệu Supabase + RLS.
  - Form tạo & chỉnh sửa hồ sơ tàu: Tên tàu, số IMO (kiểm tra đúng 7 chữ số), số chuyến, cảng đến, ETA.
  - Vòng đời trạng thái: Nháp → Đã tải chứng từ → Đã trích xuất → Đã xác nhận → Đã xuất Excel.
  - Xóa hồ sơ có hộp thoại xác nhận cảnh báo an toàn.
- [ ] **Bước 2: Tải lên và quản lý chứng từ**
  - Kéo thả nhiều file PDF, DOCX tải thẳng lên Supabase Storage.
  - Bảng tài liệu, xem trước PDF/DOCX, tự động nhận diện và dropdown sửa loại chứng từ.
- [ ] **Bước 3: Tự động trích xuất bằng Claude API**
  - Trích xuất từng file / hàng loạt theo schema tại `config/documentTypes.ts`.
  - Độ tin cậy (confidence score) và trích dẫn bằng chứng nguồn.
- [ ] **Bước 4: Đối chiếu và chỉnh sửa**
  - Bảng ma trận đối chiếu nhiều chứng từ, tô màu cảnh báo (xanh/đỏ/vàng), xác nhận dữ liệu chuẩn.
- [ ] **Bước 5: Xuất Excel theo file mẫu**
  - Sử dụng ExcelJS điền vào ô định sẵn theo config, giữ nguyên format & công thức.
- [ ] **Bước 6: Lưu trữ và tra cứu hồ sơ**
  - Tìm kiếm nâng cao, lọc đa tiêu chí, mở lại hồ sơ cũ để tiếp tục làm việc.
