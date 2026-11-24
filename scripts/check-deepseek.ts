/**
 * Kiểm tra DeepSeek API: (1) text + json_object, (2) ảnh + json_object (nếu truyền đường dẫn ảnh).
 *   npx tsx scripts/check-deepseek.ts [./samples/<ảnh>.png]
 */

import path from "node:path";
import { LocalFsProvider } from "@/lib/storage";

try {
  process.loadEnvFile(".env.local");
} catch {
  // không có .env.local
}

async function main(): Promise<void> {
  const { callJson, getLlmConfig } = await import("@/lib/extraction/llm");
  const cfg = getLlmConfig();
  console.log(`AI: ${cfg.provider} | Model: ${cfg.model} | key: ${cfg.configured ? "có" : "THIẾU"}`);

  try {
    const r = await callJson({ system: 'Trả về JSON {"ok": true, "echo": "<chuỗi người dùng gửi>"}', userText: "xin chao", maxTokens: 100 });
    console.log("PASS  (1) text + json_object:", r.raw);
  } catch (err) {
    console.log("FAIL  (1) text + json_object:", err instanceof Error ? err.message : err);
  }

  const img = process.argv[2];
  if (!img) {
    console.log("SKIP  (2) ảnh: chưa truyền đường dẫn ảnh");
    return;
  }
  try {
    const abs = path.resolve(img);
    const buf = await new LocalFsProvider(path.dirname(abs)).readFile(path.basename(abs));
    const mime = /\.jpe?g$/i.test(img) ? "image/jpeg" : "image/png";
    const r = await callJson({
      system: 'Trả về JSON {"title": "<tiêu đề chính của tài liệu trong ảnh hoặc null>"}',
      userText: "Đọc tiêu đề của tài liệu trong ảnh.",
      imageBase64: buf.toString("base64"),
      imageMime: mime,
      maxTokens: 200,
    });
    console.log("PASS  (2) ảnh + json_object:", r.raw);
  } catch (err) {
    console.log("FAIL  (2) ảnh + json_object:", err instanceof Error ? err.message : err);
  }
}

void main();
