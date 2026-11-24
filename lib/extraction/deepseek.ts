/**
 * lib/extraction/deepseek.ts (server)
 *
 * Client DeepSeek qua package `openai` (API tương thích OpenAI).
 *  - baseURL https://api.deepseek.com, model từ DEEPSEEK_MODEL (mặc định "deepseek-flash"), key DEEPSEEK_API_KEY
 *  - deepseek-flash nhận text + ẢNH (JPEG/PNG/GIF/WebP), không nhận PDF gốc.
 *  - Ảnh chỉ đặt trong message role "user": [{type:"text"},{type:"image_url"}]
 *  - Đầu ra JSON: response_format {type:"json_object"}
 *  - Retry backoff cho 429/5xx; tối đa 3 lời gọi song song.
 */

import OpenAI from "openai";

export const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_MODEL = "deepseek-v4-pro";
/** Model đọc ảnh (v4-pro không nhận ảnh) */
export const DEFAULT_VISION_MODEL = "deepseek-flash";
/** Mức suy luận: low | high | max */
export const DEFAULT_EFFORT = "max";
export const MISSING_KEY_MESSAGE = "Chưa cấu hình DEEPSEEK_API_KEY trong .env.local";
const MAX_CONCURRENT = 3;
const MAX_RETRIES = 4;

export class DeepSeekError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "DeepSeekError";
    this.status = status;
  }
}

export function getDeepSeekConfig(): { configured: boolean; model: string } {
  return { configured: !!process.env.DEEPSEEK_API_KEY?.trim(), model: process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL };
}

/** Trang có ảnh -> model đọc ảnh; chỉ có chữ -> model mạnh hơn. */
export function pickDeepSeekModel(hasImage: boolean): string {
  if (hasImage) return process.env.DEEPSEEK_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL;
  return process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL;
}

let client: OpenAI | null = null;
let clientKey = "";

function getClient(): OpenAI {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) throw new DeepSeekError(MISSING_KEY_MESSAGE);
  if (!client || clientKey !== key) {
    client = new OpenAI({ apiKey: key, baseURL: DEEPSEEK_BASE_URL, maxRetries: 0, timeout: 180_000 });
    clientKey = key;
  }
  return client;
}

// ---------------------------------------------------------------------------
// Giới hạn song song
// ---------------------------------------------------------------------------

const g = globalThis as typeof globalThis & { __marinedocSem?: { active: number; queue: Array<() => void> } };
g.__marinedocSem ??= { active: 0, queue: [] };
const sem = g.__marinedocSem;

async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (sem.active >= MAX_CONCURRENT) {
    await new Promise<void>((resolve) => sem.queue.push(resolve));
  }
  sem.active++;
  try {
    return await fn();
  } finally {
    sem.active--;
    const next = sem.queue.shift();
    if (next) next();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function errorStatus(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status?: unknown }).status;
    if (typeof s === "number") return s;
  }
  return undefined;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// Gọi model trả JSON
// ---------------------------------------------------------------------------

export interface JsonCallInput {
  system: string;
  userText: string;
  /** PNG base64 (không có tiền tố data:) */
  imageBase64?: string;
  imageMime?: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  /** Tin nhắn bổ sung (vd. lỗi validate lần trước) */
  followUp?: { assistant: string; user: string };
  maxTokens?: number;
}

export interface JsonCallResult {
  json: unknown;
  raw: string;
  model: string;
}

export async function callJson(input: JsonCallInput): Promise<JsonCallResult> {
  const openai = getClient();
  const model = pickDeepSeekModel(!!input.imageBase64);
  const effort = process.env.DEEPSEEK_EFFORT?.trim() || DEFAULT_EFFORT;

  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [{ type: "text", text: input.userText }];
  if (input.imageBase64) {
    userContent.push({ type: "image_url", image_url: { url: `data:${input.imageMime ?? "image/jpeg"};base64,${input.imageBase64}` } });
  }
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: input.system },
    { role: "user", content: input.imageBase64 ? userContent : input.userText },
  ];
  if (input.followUp) {
    messages.push({ role: "assistant", content: input.followUp.assistant });
    messages.push({ role: "user", content: input.followUp.user });
  }

  return withSlot(async () => {
    let lastErr: unknown = null;
    // Model suy luận (reasoning) tính cả token "suy nghĩ" vào max_tokens -> hết token thì nội dung rỗng.
    let budget = Math.max(input.maxTokens ?? 16000, 4000);
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await openai.chat.completions.create({
          model,
          messages,
          response_format: { type: "json_object" },
          temperature: 0,
          max_tokens: budget,
          // tham số riêng của DeepSeek (low | high | max)
          ...({ reasoning_effort: effort } as Record<string, unknown>),
        });
        const choice = res.choices[0];
        const raw = choice?.message?.content ?? "";
        if (!raw.trim() || choice?.finish_reason === "length") {
          if (attempt < MAX_RETRIES && budget < 64000) {
            budget = Math.min(64000, budget * 2);
            continue;
          }
          throw new DeepSeekError(
            !raw.trim() ? "Model trả về nội dung rỗng (hết token khi suy luận)" : "Model trả về JSON bị cắt cụt do vượt giới hạn token",
          );
        }
        let json: unknown;
        try {
          json = JSON.parse(raw);
        } catch {
          // đôi khi có ```json ... ```
          const m = /\{[\s\S]*\}/.exec(raw);
          if (!m) throw new DeepSeekError(`Model không trả JSON hợp lệ: ${raw.slice(0, 300)}`);
          json = JSON.parse(m[0]);
        }
        return { json, raw, model };
      } catch (err) {
        lastErr = err;
        const status = errorStatus(err);
        const retriable = status === 429 || (status !== undefined && status >= 500) || (status === undefined && /ECONNRESET|ETIMEDOUT|socket|network|timeout/i.test(errorMessage(err)));
        if (!retriable || attempt === MAX_RETRIES) break;
        const backoff = Math.min(30_000, 1000 * Math.pow(2, attempt)) + Math.floor(Math.random() * 500);
        await sleep(backoff);
      }
    }
    if (lastErr instanceof DeepSeekError) throw lastErr;
    const status = errorStatus(lastErr);
    throw new DeepSeekError(`DeepSeek API lỗi${status ? ` ${status}` : ""}: ${errorMessage(lastErr)}`, status);
  });
}
