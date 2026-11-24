/**
 * lib/extraction/llm.ts (server)
 *
 * Chọn nhà cung cấp AI theo .env.local:
 *   LLM_PROVIDER=gemini  (mặc định nếu có GEMINI_API_KEY)  -> GEMINI_API_KEY, GEMINI_MODEL (để trống = tự chọn)
 *   LLM_PROVIDER=groq      -> GROQ_API_KEY, GROQ_MODEL (mặc định qwen/qwen3.8-27b)
 *   LLM_PROVIDER=deepseek                                   -> DEEPSEEK_API_KEY, DEEPSEEK_MODEL
 * Giới hạn số lời gọi song song (gói miễn phí Gemini giới hạn lượt/phút).
 */

import { geminiCallJson, geminiModels } from "./gemini";
import { groqCallJson, groqModel } from "./groq";
import { callJson as deepseekCallJson, pickDeepSeekModel } from "./deepseek";
import type { JsonCallInput, JsonCallResult } from "./llm-types";

export { LlmError } from "./llm-types";
export type { JsonCallInput, JsonCallResult } from "./llm-types";

export type Provider = "groq" | "gemini" | "deepseek";

export function getProvider(): Provider {
  const p = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (p === "deepseek") return "deepseek";
  if (p === "gemini") return "gemini";
  if (p === "groq") return "groq";
  if (process.env.GROQ_API_KEY?.trim()) return "groq";
  return process.env.GEMINI_API_KEY?.trim() ? "gemini" : "deepseek";
}

export function getLlmConfig(): { provider: Provider; configured: boolean; model: string } {
  const provider = getProvider();
  if (provider === "groq") {
    return { provider, configured: !!process.env.GROQ_API_KEY?.trim(), model: groqModel() };
  }
  if (provider === "gemini") {
    return { provider, configured: !!process.env.GEMINI_API_KEY?.trim(), model: geminiModels()[0] };
  }
  return {
    provider,
    configured: !!process.env.DEEPSEEK_API_KEY?.trim(),
    model: `${pickDeepSeekModel(false)} (chữ) + ${pickDeepSeekModel(true)} (ảnh)`,
  };
}

export function missingKeyMessage(): string {
  const p = getProvider();
  return `Chưa cấu hình ${p === "groq" ? "GROQ_API_KEY" : p === "gemini" ? "GEMINI_API_KEY" : "DEEPSEEK_API_KEY"} trong .env.local`;
}

// Giới hạn song song (Gemini free: 2; DeepSeek đã tự giới hạn 3 bên trong)
const g = globalThis as typeof globalThis & { __marinedocLlmSem?: { active: number; queue: Array<() => void> } };
g.__marinedocLlmSem ??= { active: 0, queue: [] };
const sem = g.__marinedocLlmSem;

async function withSlot<T>(limit: number, fn: () => Promise<T>): Promise<T> {
  if (sem.active >= limit) await new Promise<void>((resolve) => sem.queue.push(resolve));
  sem.active++;
  try {
    return await fn();
  } finally {
    sem.active--;
    sem.queue.shift()?.();
  }
}

export async function callJson(input: JsonCallInput): Promise<JsonCallResult> {
  const p = getProvider();
  if (p === "groq") return withSlot(3, () => groqCallJson(input));
  if (p === "gemini") return withSlot(2, () => geminiCallJson(input));
  return deepseekCallJson(input);
}
