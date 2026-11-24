export class LlmError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "LlmError";
    this.status = status;
  }
}

export interface JsonCallInput {
  system: string;
  userText: string;
  /** ảnh base64 (không có tiền tố data:) */
  imageBase64?: string;
  imageMime?: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  /** PDF base64 (chỉ Gemini) */
  pdfBase64?: string;
  followUp?: { assistant: string; user: string };
  maxTokens?: number;
}

export interface JsonCallResult {
  json: unknown;
  raw: string;
  model: string;
}
