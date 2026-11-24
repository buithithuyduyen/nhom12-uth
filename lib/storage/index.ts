/**
 * lib/storage/index.ts
 *
 * MỌI thao tác lưu trữ đi qua lớp này. Không gọi fs ở nơi khác trong ứng dụng.
 *
 * Giai đoạn 1: một cài đặt local duy nhất
 *   - LocalFsProvider: file trong ./data (uploads, pages, exports, templates, settings...)
 *   - LocalShipmentRepo: mỗi chuyến tàu là một file JSON ./data/shipments/<id>.json
 *
 * Khi deploy: thay hai class này bằng cài đặt Supabase Storage + Postgres, giữ nguyên interface.
 */

import fs from "fs/promises";
import os from "os";
import path from "path";
import crypto from "crypto";
import type { Shipment } from "@/lib/types";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface StorageProvider {
  /** Lưu bytes theo đường dẫn logic (tương đối với gốc lưu trữ). */
  saveFile(logicalPath: string, data: Buffer | string): Promise<void>;
  /** Đọc bytes; ném lỗi nếu không tồn tại. */
  readFile(logicalPath: string): Promise<Buffer>;
  /** Xóa file; không lỗi nếu không tồn tại. */
  deleteFile(logicalPath: string): Promise<void>;
  /** Liệt kê file (đệ quy) dưới một tiền tố; trả đường dẫn logic. */
  listFiles(prefix: string): Promise<string[]>;
  /** Kiểm tra tồn tại. */
  exists(logicalPath: string): Promise<boolean>;
  /** Xóa toàn bộ một thư mục logic. */
  deleteDir(prefix: string): Promise<void>;
  /** Thời điểm sửa đổi cuối (ms) hoặc null. */
  modifiedAt(logicalPath: string): Promise<number | null>;
}

export interface ShipmentRepo {
  create(data: Omit<Shipment, "id" | "createdAt" | "updatedAt">): Promise<Shipment>;
  get(id: string): Promise<Shipment | null>;
  update(id: string, patch: Partial<Shipment>): Promise<Shipment>;
  list(): Promise<Shipment[]>;
  delete(id: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Local filesystem
// ---------------------------------------------------------------------------

const PROJECT_ROOT = process.cwd();
// Trên Vercel ổ đĩa dự án chỉ đọc -> dữ liệu tạm ghi vào /tmp (mất khi server khởi động lại)
const DATA_ROOT = process.env.VERCEL ? path.join(os.tmpdir(), "marinedoc-data") : path.join(PROJECT_ROOT, "data");

function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as NodeJS.ErrnoException).code === "ENOENT";
}

export class LocalFsProvider implements StorageProvider {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(logicalPath: string): string {
    const resolved = path.resolve(this.root, logicalPath);
    if (resolved !== this.root && !resolved.startsWith(this.root + path.sep)) {
      throw new Error(`Đường dẫn không hợp lệ: ${logicalPath}`);
    }
    return resolved;
  }

  async saveFile(logicalPath: string, data: Buffer | string): Promise<void> {
    const abs = this.resolve(logicalPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.${crypto.randomBytes(4).toString("hex")}.tmp`;
    await fs.writeFile(tmp, data);
    // Windows: đổi tên đè lên file đang được tiến trình khác đọc sẽ lỗi EPERM/EBUSY tạm thời -> chờ rồi thử lại
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(tmp, abs);
        return;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        const transient = code === "EPERM" || code === "EBUSY" || code === "EACCES";
        if (!transient) {
          await fs.unlink(tmp).catch(() => undefined);
          throw err;
        }
        if (attempt >= 20) {
          // cuối cùng: ghi thẳng (không nguyên tử) để không mất dữ liệu
          try {
            await fs.writeFile(abs, data);
          } finally {
            await fs.unlink(tmp).catch(() => undefined);
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 50 + attempt * 50));
      }
    }
  }

  async readFile(logicalPath: string): Promise<Buffer> {
    return fs.readFile(this.resolve(logicalPath));
  }

  async deleteFile(logicalPath: string): Promise<void> {
    try {
      await fs.unlink(this.resolve(logicalPath));
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  async listFiles(prefix: string): Promise<string[]> {
    const absDir = this.resolve(prefix);
    try {
      const entries = await fs.readdir(absDir, { withFileTypes: true });
      const result: string[] = [];
      for (const entry of entries) {
        const rel = path.posix.join(prefix.replace(/\\/g, "/"), entry.name);
        if (entry.isDirectory()) {
          result.push(...(await this.listFiles(rel)));
        } else if (!entry.name.endsWith(".tmp")) {
          result.push(rel);
        }
      }
      return result;
    } catch (err) {
      if (isNotFound(err)) return [];
      throw err;
    }
  }

  async exists(logicalPath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(logicalPath));
      return true;
    } catch {
      return false;
    }
  }

  async deleteDir(prefix: string): Promise<void> {
    const abs = this.resolve(prefix);
    if (abs === this.root) throw new Error("Không được xóa thư mục gốc");
    await fs.rm(abs, { recursive: true, force: true });
  }

  async modifiedAt(logicalPath: string): Promise<number | null> {
    try {
      const stat = await fs.stat(this.resolve(logicalPath));
      return stat.mtimeMs;
    } catch {
      return null;
    }
  }
}

export class LocalShipmentRepo implements ShipmentRepo {
  constructor(private readonly storage: StorageProvider) {}

  private filePath(id: string): string {
    if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error(`Mã chuyến tàu không hợp lệ: ${id}`);
    return `shipments/${id}.json`;
  }

  async create(data: Omit<Shipment, "id" | "createdAt" | "updatedAt">): Promise<Shipment> {
    const now = new Date().toISOString();
    const shipment: Shipment = { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    await this.storage.saveFile(this.filePath(shipment.id), JSON.stringify(shipment, null, 2));
    return shipment;
  }

  async get(id: string): Promise<Shipment | null> {
    try {
      const raw = await this.storage.readFile(this.filePath(id));
      return JSON.parse(raw.toString("utf-8")) as Shipment;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async update(id: string, patch: Partial<Shipment>): Promise<Shipment> {
    const existing = await this.get(id);
    if (!existing) throw new Error(`Không tìm thấy chuyến tàu: ${id}`);
    const updated: Shipment = { ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() };
    await this.storage.saveFile(this.filePath(id), JSON.stringify(updated, null, 2));
    return updated;
  }

  async list(): Promise<Shipment[]> {
    const files = await this.storage.listFiles("shipments");
    const result: Shipment[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await this.storage.readFile(file);
        result.push(JSON.parse(raw.toString("utf-8")) as Shipment);
      } catch {
        // bỏ qua file hỏng
      }
    }
    result.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1));
    return result;
  }

  async delete(id: string): Promise<void> {
    await this.storage.deleteFile(this.filePath(id));
  }
}

// ---------------------------------------------------------------------------
// Singletons (giữ qua hot-reload trong dev)
// ---------------------------------------------------------------------------

interface StorageGlobals {
  dataStorage?: StorageProvider;
  projectStorage?: StorageProvider;
  shipmentRepo?: ShipmentRepo;
  shipmentLocks?: Map<string, Promise<unknown>>;
}

const g = globalThis as typeof globalThis & { __marinedocStorage?: StorageGlobals };
g.__marinedocStorage ??= {};
const globals = g.__marinedocStorage;

/** Kho dữ liệu người dùng (./data). */
export function getStorage(): StorageProvider {
  globals.dataStorage ??= new LocalFsProvider(DATA_ROOT);
  return globals.dataStorage;
}

/** Kho file đi kèm mã nguồn (chỉ đọc: ./templates). */
export function getProjectStorage(): StorageProvider {
  globals.projectStorage ??= new LocalFsProvider(PROJECT_ROOT);
  return globals.projectStorage;
}

export function getShipmentRepo(): ShipmentRepo {
  globals.shipmentRepo ??= new LocalShipmentRepo(getStorage());
  return globals.shipmentRepo;
}

/**
 * Đọc-sửa-ghi shipment tuần tự theo id (tránh ghi đè khi nhiều trang bóc tách song song).
 */
export async function mutateShipment(id: string, fn: (s: Shipment) => Shipment | Promise<Shipment>): Promise<Shipment> {
  globals.shipmentLocks ??= new Map();
  const locks = globals.shipmentLocks;
  const previous = locks.get(id) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(async () => {
    const repo = getShipmentRepo();
    const current = await repo.get(id);
    if (!current) throw new Error(`Không tìm thấy chuyến tàu: ${id}`);
    const next = await fn(current);
    return repo.update(id, next);
  });
  locks.set(id, run);
  try {
    return await run;
  } finally {
    if (locks.get(id) === run) locks.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Đường dẫn logic chuẩn
// ---------------------------------------------------------------------------

export const paths = {
  upload: (shipmentId: string, fileId: string, ext: string) => `uploads/${shipmentId}/${fileId}.${ext}`,
  uploadsDir: (shipmentId: string) => `uploads/${shipmentId}`,
  pagesDir: (shipmentId: string) => `pages/${shipmentId}`,
  pageImage: (shipmentId: string, fileId: string, page: number) => `pages/${shipmentId}/${fileId}-p${page}.png`,
  pageHtml: (shipmentId: string, fileId: string, page: number) => `pages/${shipmentId}/${fileId}-p${page}.html`,
  pageText: (shipmentId: string, fileId: string, page: number) => `pages/${shipmentId}/${fileId}-p${page}.txt`,
  pageItems: (shipmentId: string, fileId: string, page: number) => `pages/${shipmentId}/${fileId}-p${page}.items.json`,
  exportFile: (fileName: string) => `exports/${fileName}`,
  exportManifest: (fileName: string) => `exports/${fileName.replace(/\.xlsx$/i, "")}.manifest.json`,
  templatesDir: () => "templates",
  templateFile: (id: string) => `templates/${id}.xlsx`,
  templateIndex: () => "templates/index.json",
  settings: () => "settings.json",
  ports: () => "ports.json",
  builtinTemplate: () => "templates/TemplateNSW.xlsx",
};
