/**
 * lib/templates.ts (server)
 *
 * Quản lý template: template gốc trong ./templates/TemplateNSW.xlsx (id "builtin")
 * và template người dùng upload trong ./data/templates/<id>.xlsx.
 * Danh mục mã & ràng buộc ô được đọc từ template và cache trong bộ nhớ.
 */

import crypto from "crypto";
import type { CodeTables, TemplateInfo } from "@/lib/types";
import { getProjectStorage, getStorage, paths } from "@/lib/storage";
import { loadXlsx, readCodeTables, readMappingRules, type CellRule } from "@/lib/excel/template-reader";

export const BUILTIN_TEMPLATE_ID = "builtin";

interface TemplateIndex {
  defaultId: string;
  items: Array<{ id: string; name: string; uploadedAt: string }>;
}

async function readIndex(): Promise<TemplateIndex> {
  const storage = getStorage();
  try {
    const raw = await storage.readFile(paths.templateIndex());
    const parsed = JSON.parse(raw.toString("utf-8")) as TemplateIndex;
    return { defaultId: parsed.defaultId ?? BUILTIN_TEMPLATE_ID, items: parsed.items ?? [] };
  } catch {
    return { defaultId: BUILTIN_TEMPLATE_ID, items: [] };
  }
}

async function writeIndex(index: TemplateIndex): Promise<void> {
  await getStorage().saveFile(paths.templateIndex(), JSON.stringify(index, null, 2));
}

export async function listTemplates(): Promise<TemplateInfo[]> {
  const index = await readIndex();
  const builtinExists = await getProjectStorage().exists(paths.builtinTemplate());
  const list: TemplateInfo[] = [];
  if (builtinExists) {
    list.push({ id: BUILTIN_TEMPLATE_ID, name: "TemplateNSW.xlsx (mặc định của hệ thống)", uploadedAt: null, builtin: true, isDefault: index.defaultId === BUILTIN_TEMPLATE_ID });
  }
  for (const item of index.items) {
    list.push({ id: item.id, name: item.name, uploadedAt: item.uploadedAt, builtin: false, isDefault: index.defaultId === item.id });
  }
  if (!list.some((t) => t.isDefault) && list.length > 0) list[0].isDefault = true;
  return list;
}

export async function getDefaultTemplateId(): Promise<string> {
  const list = await listTemplates();
  return list.find((t) => t.isDefault)?.id ?? BUILTIN_TEMPLATE_ID;
}

export async function getTemplateBuffer(id: string): Promise<Buffer> {
  if (id === BUILTIN_TEMPLATE_ID) {
    try {
      return await getProjectStorage().readFile(paths.builtinTemplate());
    } catch {
      throw new Error("Không tìm thấy templates/TemplateNSW.xlsx");
    }
  }
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error("Mã template không hợp lệ");
  try {
    return await getStorage().readFile(paths.templateFile(id));
  } catch {
    throw new Error(`Không tìm thấy template ${id}`);
  }
}

export async function getTemplateName(id: string): Promise<string> {
  const list = await listTemplates();
  return list.find((t) => t.id === id)?.name ?? id;
}

export async function saveUploadedTemplate(name: string, data: Buffer): Promise<TemplateInfo> {
  // Kiểm tra là file xlsx đọc được
  await loadXlsx(data);
  const id = crypto.randomUUID();
  await getStorage().saveFile(paths.templateFile(id), data);
  const index = await readIndex();
  const uploadedAt = new Date().toISOString();
  index.items.push({ id, name, uploadedAt });
  await writeIndex(index);
  return { id, name, uploadedAt, builtin: false, isDefault: false };
}

export async function setDefaultTemplate(id: string): Promise<void> {
  await getTemplateBuffer(id);
  const index = await readIndex();
  index.defaultId = id;
  await writeIndex(index);
}

export async function deleteTemplate(id: string): Promise<void> {
  if (id === BUILTIN_TEMPLATE_ID) throw new Error("Không thể xóa template mặc định của hệ thống");
  const index = await readIndex();
  index.items = index.items.filter((t) => t.id !== id);
  if (index.defaultId === id) index.defaultId = BUILTIN_TEMPLATE_ID;
  await writeIndex(index);
  await getStorage().deleteFile(paths.templateFile(id));
  codeCache.delete(id);
  ruleCache.delete(id);
}

// ---------------------------------------------------------------------------
// Cache danh mục mã & ràng buộc
// ---------------------------------------------------------------------------

const g = globalThis as typeof globalThis & {
  __marinedocCodeCache?: Map<string, Promise<CodeTables>>;
  __marinedocRuleCache?: Map<string, Promise<Record<string, CellRule>>>;
};
g.__marinedocCodeCache ??= new Map();
g.__marinedocRuleCache ??= new Map();
const codeCache = g.__marinedocCodeCache;
const ruleCache = g.__marinedocRuleCache;

export function getCodeTables(templateId: string): Promise<CodeTables> {
  let p = codeCache.get(templateId);
  if (!p) {
    p = getTemplateBuffer(templateId).then(loadXlsx).then(readCodeTables);
    p.catch(() => codeCache.delete(templateId));
    codeCache.set(templateId, p);
  }
  return p;
}

export function getCellRules(templateId: string): Promise<Record<string, CellRule>> {
  let p = ruleCache.get(templateId);
  if (!p) {
    p = getTemplateBuffer(templateId).then(loadXlsx).then(readMappingRules);
    p.catch(() => ruleCache.delete(templateId));
    ruleCache.set(templateId, p);
  }
  return p;
}
