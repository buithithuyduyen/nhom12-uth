declare module 'mammoth' {
  export interface ConversionResult {
    value: string;
    messages: Array<{
      type: string;
      message: string;
    }>;
  }

  export interface Options {
    styleMap?: string | string[];
    includeDefaultStyleMap?: boolean;
    convertImage?: any;
    [key: string]: any;
  }

  export function convertToHtml(
    input: { buffer: Buffer } | { path: string } | { arrayBuffer: ArrayBuffer },
    options?: Options
  ): Promise<ConversionResult>;

  export function extractRawText(
    input: { buffer: Buffer } | { path: string } | { arrayBuffer: ArrayBuffer },
    options?: Options
  ): Promise<ConversionResult>;
}
