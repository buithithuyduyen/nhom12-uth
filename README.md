# MarineDoc AI

Upload chứng từ hàng hải (PDF scan, DOCX, ảnh) → AI bóc tách → điền vào file mẫu NSW → kiểm tra chéo → tải Excel.

## Chạy

```bash
npm install
# tạo file .env.local:
#   LLM_PROVIDER=deepseek          # hoặc gemini
#   DEEPSEEK_API_KEY=sk-...
#   DEEPSEEK_MODEL=deepseek-flash
#   GEMINI_API_KEY=...             # nếu dùng gemini
#   GEMINI_MODEL=gemini-3.5-flash-lite
npm run dev
```

Mở http://localhost:3000.

1. Kéo thả chứng từ → hệ thống tách theo từng trang/phần.
2. Bấm **Bóc tách bằng AI** → dữ liệu tự điền vào các sheet.
3. Xem mục **Kiểm tra chéo**: chọn giá trị đúng khi các chứng từ ghi khác nhau.
4. Sửa ô tô vàng/đỏ (di chuột để xem lý do) → **Tải Excel**.

Chưa có API key: vẫn upload, nhập tay và tải Excel được, chỉ nút bóc tách báo lỗi.

## Kiểm tra

```bash
npx tsx scripts/verify-export.ts       # kiểm tra file Excel xuất gần nhất (PASS/FAIL)
npx tsx scripts/inspect-template.ts    # xem cấu trúc template
```

## Ghi chú

- Trang scan: AI đọc ảnh; OCR chạy trên máy (tesseract.js) đối chiếu lại các ô có chữ số
  (số hộ chiếu, ngày, số B/L...). Ô không khớp OCR được tô vàng. Lần đầu cần Internet để tải dữ liệu OCR.

- Template: `templates/TemplateNSW.xlsx`. Mapping ô: `lib/mapping/nsw.ts`.
- Dữ liệu lưu trong `./data` (đã gitignore).
- Mã cảng: thêm vào `data/ports.json` dạng `[{"code":"VNSGN","name":"HO CHI MINH","aliases":["SAIGON"]}]`.

## Deploy lên Vercel (bản demo)

Trên Vercel, ứng dụng tự chạy ở **chế độ demo (stateless)**:
- Server không lưu gì. Dữ liệu chuyến tàu nằm trong trình duyệt, **tải lại trang sẽ mất**. Nhớ tải Excel trước khi đóng.
- File tải lên tối đa **4,4 MB / file** (giới hạn của Vercel). Không có OCR kiểm tra phụ.
- Thử chế độ này trên máy: `npm run build` rồi `APP_MODE=stateless npx next start`.

Các bước (chạy trong thư mục dự án):

```bash
npx vercel login                 # đăng nhập (mở trình duyệt)
npx vercel                       # lần đầu: tạo project, deploy bản xem thử
npx vercel env add DEEPSEEK_API_KEY production      # dán API key khi được hỏi
npx vercel env add LLM_PROVIDER production          # nhập: deepseek
npx vercel env add DEEPSEEK_MODEL production        # nhập: deepseek-flash
npx vercel --prod                # deploy bản chính thức (lấy link)
```

Nếu Vercel báo lỗi `maxDuration` vượt giới hạn gói: giảm `export const maxDuration` trong
`app/api/stateless/page/route.ts` và `app/api/upload/route.ts` xuống `60`.
