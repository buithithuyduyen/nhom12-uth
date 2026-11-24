/**
 * lib/extraction/gemini.ts (server)
 *
 * Gọi Google Gemini qua REST (generateContent), trả JSON (responseMimeType application/json).
 * Nhận text + ảnh (PNG/JPEG) + PDF dạng inline_data.
 * Gói miễn phí: giới hạn số lượt/phút -> gặp 429 thì đợi theo retryDelay; model quá tải (503) thì chuyển model dự phòng.
 */

import type { JsonCallInput, JsonCallResult } from "./llm-types";
import { LlmError } from "./llm-types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";
/** Thứ tự ưu tiên khi không cấu hình GEMINI_MODEL: chính xác trước, nhẹ sau. */
export const GEMINI_DEFAULT_MODELS = ["gemini-3-flash-preview", "gemini-flash-latest", "gemini-3.5-flash-lite", "gemini-flash-lite-latest"];
const MAX_ATTEMPTS = 6;

export function geminiModels(): string[] {
  const configured = process.env.GEMINI_MODEL?.trim();
  if (!configured) return GEMINI_DEFAULT_MODELS;
  return [configured, ...GEMINI_DEFAULT_MODELS.filter((m) => m !== configured)];
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
  inline_data?: { mime_type: string; data: string };
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string; details?: Array<{ "@type"?: string; retryDelay?: string }> };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function retryDelayMs(data: GeminiResponse): number | null {
  const d = data.error?.details?.find((x) => x["@type"]?.includes("RetryInfo"))?.retryDelay;
  if (!d) return null;
  const s = parseFloat(d);
  return Number.isFinite(s) ? Math.ceil(s * 1000) : null;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const m = /\{[\s\S]*\}/.exec(raw);
    if (!m) throw new LlmError(`Model không trả JSON hợp lệ: ${raw.slice(0, 300)}`);
    return JSON.parse(m[0]);
  }
}

export async function geminiCallJson(input: JsonCallInput): Promise<JsonCallResult> {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new LlmError("Chưa cấu hình GEMINI_API_KEY trong .env.local");

  const userParts: GeminiPart[] = [{ text: input.userText }];
  if (input.imageBase64) userParts.push({ inline_data: { mime_type: input.imageMime ?? "image/jpeg", data: input.imageBase64 } });
  if (input.pdfBase64) userParts.push({ inline_data: { mime_type: "application/pdf", data: input.pdfBase64 } });
  const contents: Array<{ role: string; parts: GeminiPart[] }> = [{ role: "user", parts: userParts }];
  if (input.followUp) {
    contents.push({ role: "model", parts: [{ text: input.followUp.assistant }] });
    contents.push({ role: "user", parts: [{ text: input.followUp.user }] });
  }
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: input.system }] },
    contents,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0,
      maxOutputTokens: Math.max(input.maxTokens ?? 32000, 8000),
    },
  });

  const models = geminiModels();
  let modelIdx = 0;
  let lastError = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const model = models[modelIdx % models.length];
    let res: Response;
    try {
      res = await fetch(`${BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(240_000),
      });
    } catch (err) {
      lastError = `Lỗi mạng khi gọi Gemini (${model}): ${err instanceof Error ? err.message : String(err)}`;
      await sleep(2000 * (attempt + 1));
      continue;
    }
    const data = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) {
      lastError = `Gemini ${model} lỗi ${res.status}: ${data.error?.message ?? res.statusText}`;
      if (res.status === 503 || res.status === 500 || res.status === 404) {
        modelIdx++; // quá tải / không có -> thử model dự phòng
        await sleep(1000);
        continue;
      }
      if (res.status === 429) {
        const wait = retryDelayMs(data);
        // hết hạn mức ngày hoặc chờ quá lâu -> đổi model; còn lại đợi rồi thử lại
        if (wait === null || wait > 65_000 || /per day|PerDay/i.test(data.error?.message ?? "")) modelIdx++;
        else await sleep(wait + 500);
        continue;
      }
      throw new LlmError(lastError, res.status);
    }
    if (data.promptFeedback?.blockReason) throw new LlmError(`Gemini từ chối nội dung: ${data.promptFeedback.blockReason}`);
    const cand = data.candidates?.[0];
    const raw = (cand?.content?.parts ?? [])
      .filter((p) => !p.thought && typeof p.text === "string")
      .map((p) => p.text)
      .join("");
    if (!raw.trim() || cand?.finishReason === "MAX_TOKENS") {
      lastError = !raw.trim() ? `Gemini ${model} trả nội dung rỗng (${cand?.finishReason ?? "?"})` : "Kết quả bị cắt do vượt giới hạn token";
      modelIdx++;
      continue;
    }
    return { json: parseJson(raw), raw, model };
  }
  throw new LlmError(lastError || "Gemini không phản hồi");
}
