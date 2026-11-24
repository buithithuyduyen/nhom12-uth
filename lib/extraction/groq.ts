/**
 * lib/extraction/groq.ts (server)
 *
 * Gọi Groq (API tương thích OpenAI) – model mặc định qwen/qwen3.8-27b (đọc được cả ảnh).
 * Trả JSON qua response_format json_object. Gặp 429 thì đợi theo retry-after; 5xx thì thử lại.
 */

import type { JsonCallInput, JsonCallResult } from "./llm-types";
import { LlmError } from "./llm-types";

const URL_CHAT = "https://api.groq.com/openai/v1/chat/completions";
export const GROQ_DEFAULT_MODEL = "qwen/qwen3.8-27b";
const MAX_ATTEMPTS = 6;

export function groqModel(): string {
  return process.env.GROQ_MODEL?.trim() || GROQ_DEFAULT_MODEL;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseJson(raw: string): unknown {
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = /\{[\s\S]*\}/.exec(cleaned);
    if (!m) throw new LlmError(`Model không trả JSON hợp lệ: ${cleaned.slice(0, 300)}`);
    return JSON.parse(m[0]);
  }
}

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export async function groqCallJson(input: JsonCallInput): Promise<JsonCallResult> {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) throw new LlmError("Chưa cấu hình GROQ_API_KEY trong .env.local");
  const model = groqModel();

  const userContent: string | Part[] = input.imageBase64
    ? [
        { type: "text", text: input.userText },
        { type: "image_url", image_url: { url: `data:${input.imageMime ?? "image/jpeg"};base64,${input.imageBase64}` } },
      ]
    : input.userText;
  const messages: Array<{ role: string; content: string | Part[] }> = [
    { role: "system", content: input.system },
    { role: "user", content: userContent },
  ];
  if (input.followUp) {
    messages.push({ role: "assistant", content: input.followUp.assistant });
    messages.push({ role: "user", content: input.followUp.user });
  }
  const body = JSON.stringify({
    model,
    messages,
    temperature: 0,
    response_format: { type: "json_object" },
    max_completion_tokens: Math.min(Math.max(input.maxTokens ?? 16000, 4000), 16000),
  });

  let lastError = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(URL_CHAT, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(180_000),
      });
    } catch (err) {
      lastError = `Lỗi mạng khi gọi Groq: ${err instanceof Error ? err.message : String(err)}`;
      await sleep(2000 * (attempt + 1));
      continue;
    }
    const data = (await res.json().catch(() => ({}))) as {
      choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
      error?: { message?: string; code?: string };
    };
    if (!res.ok) {
      lastError = `Groq ${model} lỗi ${res.status}: ${data.error?.message ?? res.statusText}`;
      if (res.status === 429) {
        const retryAfter = parseFloat(res.headers.get("retry-after") ?? "");
        await sleep((Number.isFinite(retryAfter) ? retryAfter * 1000 : 5000 * (attempt + 1)) + 300);
        continue;
      }
      if (res.status >= 500) {
        await sleep(2000 * (attempt + 1));
        continue;
      }
      // json_object đôi khi lỗi "json_validate_failed" -> thử lại
      if (res.status === 400 && /json/i.test(data.error?.code ?? data.error?.message ?? "") && attempt < 2) continue;
      throw new LlmError(lastError, res.status);
    }
    const choice = data.choices?.[0];
    const raw = choice?.message?.content ?? "";
    if (!raw.trim() || choice?.finish_reason === "length") {
      lastError = !raw.trim() ? "Groq trả nội dung rỗng" : "Kết quả bị cắt do vượt giới hạn token";
      continue;
    }
    return { json: parseJson(raw), raw, model };
  }
  throw new LlmError(lastError || "Groq không phản hồi");
}
