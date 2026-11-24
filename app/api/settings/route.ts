import type { AppSettings, NameSplitRule } from "@/lib/types";
import { loadPorts, loadSettings, saveSettings } from "@/lib/server-data";
import { getLlmConfig } from "@/lib/extraction/llm";
import { isStateless } from "@/lib/mode";
import { errorMessage, jsonError } from "@/lib/api";

const RULES: NameSplitRule[] = ["firstTokenIsFamily", "lastTokenIsFamily", "allInGivenName"];

export async function GET(): Promise<Response> {
  try {
    const [settings, ports] = await Promise.all([loadSettings(), loadPorts()]);
    return Response.json({
      settings,
      deepseek: getLlmConfig(),
      stateless: isStateless(),
      ports: { count: ports.ports.length, error: ports.error, list: ports.ports },
    });
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as Partial<AppSettings>;
    const current = await loadSettings();
    const next: AppSettings = { ...current };
    if (body.nameSplitRule && RULES.includes(body.nameSplitRule)) next.nameSplitRule = body.nameSplitRule;
    return Response.json({ settings: await saveSettings(next) });
  } catch (err) {
    return jsonError(errorMessage(err), 500);
  }
}
