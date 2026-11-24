/**
 * lib/server-data.ts (server)
 *
 * Đọc dữ liệu cấu hình của người dùng qua lớp storage: data/ports.json, data/settings.json.
 */

import type { AppSettings, PortEntry } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { getStorage, paths } from "@/lib/storage";
import { isValidPortList } from "@/lib/ports";

let portCache: { mtime: number | null; ports: PortEntry[]; error: string | null } | null = null;

/** Đọc data/ports.json (tạo file rỗng "[]" nếu chưa có). Cache theo thời điểm sửa file. */
export async function loadPorts(): Promise<{ ports: PortEntry[]; error: string | null }> {
  const storage = getStorage();
  if (!(await storage.exists(paths.ports()))) {
    await storage.saveFile(paths.ports(), "[]\n");
  }
  const mtime = await storage.modifiedAt(paths.ports());
  if (portCache && portCache.mtime === mtime) return { ports: portCache.ports, error: portCache.error };
  let ports: PortEntry[] = [];
  let error: string | null = null;
  try {
    const parsed: unknown = JSON.parse((await storage.readFile(paths.ports())).toString("utf-8"));
    if (isValidPortList(parsed)) ports = parsed;
    else error = "data/ports.json phải là mảng {code, name, aliases?}";
  } catch (e) {
    error = `Không đọc được data/ports.json: ${e instanceof Error ? e.message : String(e)}`;
  }
  portCache = { mtime, ports, error };
  return { ports, error };
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await getStorage().readFile(paths.settings());
    const parsed = JSON.parse(raw.toString("utf-8")) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  const merged = { ...DEFAULT_SETTINGS, ...settings };
  await getStorage().saveFile(paths.settings(), JSON.stringify(merged, null, 2));
  return merged;
}
