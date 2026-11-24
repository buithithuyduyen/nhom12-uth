"use client";

/**
 * Trạng thái chuyến tàu đang mở (client): dữ liệu sheets làm việc, tự động lưu (debounce 1,5s),
 * polling tiến độ bóc tách, danh mục mã, đối chiếu chéo chạy lại ở client.
 * Dữ liệu chính luôn nằm ở server (./data); không dùng localStorage.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  AppSettings,
  ExtractedInstance,
  FileRecord,
  PageInfo,
  CodeTables,
  CrosscheckResult,
  Discrepancy,
  FieldValue,
  PortEntry,
  SectionKey,
  SheetsData,
  Shipment,
  TemplateInfo,
} from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/types";
import { aggregate, autoSelectActive, ensureSheets, initialSheets, type AggregateContext } from "@/lib/aggregate";
import { crosscheck, unresolvedCount } from "@/lib/crosscheck";
import { apiJson, downloadBlob, uploadWithProgress } from "@/lib/client";
import type { CellRule } from "@/lib/excel/template-reader";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export interface FocusTarget {
  section: SectionKey;
  field?: string;
  table?: string;
  rowId?: string;
  column?: string;
  nonce: number;
}

export interface SourceViewState {
  fileId: string;
  page: number;
  highlight?: string;
}

export interface UploadItem {
  key: string;
  fileName: string;
  size: number;
  progress: number;
  status: "uploading" | "done" | "error";
  message?: string;
}

interface DeepSeekStatus {
  configured: boolean;
  model: string;
}

interface ShipmentContextValue {
  /** Chế độ demo (Vercel): dữ liệu chỉ nằm trong trình duyệt */
  stateless: boolean;
  shipment: Shipment | null;
  sheets: SheetsData;
  voyageName: string;
  resolvedValues: Record<string, string>;
  saveStatus: SaveStatus;
  extracting: boolean;
  loading: boolean;
  codes: CodeTables | null;
  rules: Record<string, CellRule>;
  ports: PortEntry[];
  settings: AppSettings;
  deepseek: DeepSeekStatus | null;
  templates: TemplateInfo[];
  currentTemplate: TemplateInfo | null;
  check: CrosscheckResult;
  unresolved: number;
  aggregateContext: AggregateContext;
  uploads: UploadItem[];
  focus: FocusTarget | null;
  sourceView: SourceViewState | null;

  setVoyageName: (name: string) => void;
  updateSection: (section: SectionKey, updater: (s: SheetsData[SectionKey]) => SheetsData[SectionKey]) => void;
  setHeaderValue: (section: SectionKey, key: string, value: string, extra?: Partial<FieldValue>) => void;
  resolveDiscrepancy: (d: Discrepancy, field: FieldValue) => void;
  saveNow: () => Promise<void>;
  ensureShipment: () => Promise<string>;
  uploadFiles: (files: File[]) => Promise<void>;
  startExtraction: (target?: { fileId?: string; page?: number; force?: boolean }) => Promise<void>;
  togglePage: (fileId: string, page: number, active: boolean) => Promise<void>;
  removeFile: (fileId: string) => Promise<void>;
  reaggregate: () => Promise<void>;
  openShipment: (id: string) => Promise<void>;
  newShipment: () => void;
  exportExcel: () => Promise<void>;
  changeTemplate: (templateId: string) => Promise<void>;
  refreshMeta: () => Promise<void>;
  jumpTo: (target: Omit<FocusTarget, "nonce">) => void;
  openSource: (view: SourceViewState | null) => void;
}

const Ctx = createContext<ShipmentContextValue | null>(null);

export function useShipment(): ShipmentContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useShipment phải nằm trong ShipmentProvider");
  return v;
}

const AUTOSAVE_MS = 1500;
const POLL_MS = 2000;
/** Vercel giới hạn mỗi lần gửi lên khoảng 4,5 MB */
const STATELESS_MAX_BYTES = 4.4 * 1024 * 1024;

function readIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const id = new URLSearchParams(window.location.search).get("s");
  return id && /^[a-zA-Z0-9-]+$/.test(id) ? id : null;
}

function writeIdToUrl(id: string | null): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("s", id);
  else url.searchParams.delete("s");
  window.history.replaceState(window.history.state, "", url.toString());
}

export function ShipmentProvider({ children }: { children: React.ReactNode }) {
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [sheets, setSheets] = useState<SheetsData>(() => initialSheets());
  const [voyageName, setVoyageNameState] = useState("Chuyến tàu mới");
  const [resolvedValues, setResolvedValues] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [extracting, setExtracting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [codes, setCodes] = useState<CodeTables | null>(null);
  const [rules, setRules] = useState<Record<string, CellRule>>({});
  const [ports, setPorts] = useState<PortEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [deepseek, setDeepseek] = useState<DeepSeekStatus | null>(null);
  const [templates, setTemplates] = useState<TemplateInfo[]>([]);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const [sourceView, setSourceView] = useState<SourceViewState | null>(null);

  const shipmentIdRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ sheets, voyageName, resolvedValues });
  latest.current = { sheets, voyageName, resolvedValues };
  const creatingRef = useRef<Promise<string> | null>(null);
  const loadedCodesFor = useRef<string | null>(null);

  // --- Chế độ stateless (Vercel): dữ liệu chuyến tàu nằm trong trình duyệt ---
  const statelessRef = useRef(false);
  const [stateless, setStateless] = useState(false);
  const localRef = useRef<Shipment | null>(null);
  const assetsRef = useRef(new Map<string, { text: string; image?: string }>());
  const ctxRef = useRef<AggregateContext>({ codes: null, ports: [], settings: DEFAULT_SETTINGS });

  // -------------------------------------------------------------------------
  // Meta: settings, ports, deepseek, templates, codes
  // -------------------------------------------------------------------------
  const refreshMeta = useCallback(async () => {
    try {
      const [s, t] = await Promise.all([
        apiJson<{ settings: AppSettings; deepseek: DeepSeekStatus; stateless?: boolean; ports: { list: PortEntry[]; error: string | null } }>("/api/settings"),
        apiJson<{ templates: TemplateInfo[] }>("/api/templates"),
      ]);
      statelessRef.current = !!s.stateless;
      setStateless(!!s.stateless);
      setSettings(s.settings);
      setDeepseek(s.deepseek);
      setPorts(s.ports.list);
      if (s.ports.error) toast.error(s.ports.error);
      setTemplates(t.templates);
    } catch (err) {
      toast.error(`Không tải được cấu hình: ${(err as Error).message}`);
    }
  }, []);

  const templateId = shipment?.templateId ?? templates.find((t) => t.isDefault)?.id ?? null;
  const currentTemplate = templates.find((t) => t.id === templateId) ?? null;

  useEffect(() => {
    if (!templateId || loadedCodesFor.current === templateId) return;
    loadedCodesFor.current = templateId;
    apiJson<{ codes: CodeTables; rules: Record<string, CellRule> }>(`/api/templates/${templateId}`)
      .then((r) => {
        setCodes(r.codes);
        setRules(r.rules);
      })
      .catch((err: Error) => {
        loadedCodesFor.current = null;
        toast.error(`Không đọc được danh mục mã từ template: ${err.message}`);
      });
  }, [templateId]);

  // -------------------------------------------------------------------------
  // Nạp shipment
  // -------------------------------------------------------------------------
  const applyShipment = useCallback((s: Shipment, opts: { replaceWorking: boolean }) => {
    setShipment(s);
    shipmentIdRef.current = s.id;
    if (opts.replaceWorking) {
      setSheets(ensureSheets(s.extractedData.sheets));
      setVoyageNameState(s.voyageName);
      setResolvedValues(s.resolvedValues ?? {});
      dirtyRef.current = false;
    }
  }, []);

  const openShipment = useCallback(
    async (id: string) => {
      setLoading(true);
      try {
        const r = await apiJson<{ shipment: Shipment; extracting: boolean }>(`/api/shipments/${id}`);
        applyShipment(r.shipment, { replaceWorking: true });
        setExtracting(r.extracting);
        setSaveStatus("saved");
        writeIdToUrl(id);
      } catch (err) {
        toast.error(`Không mở được chuyến tàu: ${(err as Error).message}`);
        writeIdToUrl(null);
      } finally {
        setLoading(false);
      }
    },
    [applyShipment],
  );

  useEffect(() => {
    void (async () => {
      await refreshMeta();
      const id = readIdFromUrl();
      if (id && !statelessRef.current) await openShipment(id);
      else {
        if (statelessRef.current) writeIdToUrl(null);
        setLoading(false);
      }
    })();
  }, [refreshMeta, openShipment]);

  // -------------------------------------------------------------------------
  // Tiện ích chế độ stateless
  // -------------------------------------------------------------------------
  const commitLocal = useCallback((s: Shipment) => {
    localRef.current = s;
    shipmentIdRef.current = s.id;
    setShipment(s);
  }, []);

  const updateLocal = useCallback(
    (fn: (s: Shipment) => Shipment) => {
      if (localRef.current) commitLocal(fn(localRef.current));
    },
    [commitLocal],
  );

  const makeLocal = useCallback(
    (): Shipment => ({
      id: "local",
      voyageName: latest.current.voyageName,
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      templateId: templates.find((t) => t.isDefault)?.id ?? "builtin",
      files: [],
      extractedData: { instances: [], sheets: latest.current.sheets },
      discrepancies: [],
      resolvedValues: {},
      exports: [],
    }),
    [templates],
  );

  /** Tổng hợp lại ngay trong trình duyệt (cùng hàm với server), giữ ô đã sửa tay. */
  const recomputeLocal = useCallback(
    (autoSelect: boolean) => {
      const s = localRef.current;
      if (!s) return;
      const ctx = ctxRef.current;
      const files = autoSelect ? autoSelectActive(s.files, s.extractedData.instances, ctx.ports) : s.files;
      const sheets = aggregate(s.extractedData.instances, files, latest.current.sheets, ctx);
      latest.current = { ...latest.current, sheets };
      setSheets(sheets);
      commitLocal({ ...s, files, extractedData: { ...s.extractedData, sheets }, status: s.extractedData.instances.length ? "extracted" : s.status });
    },
    [commitLocal],
  );

  const newShipment = useCallback(() => {
    localRef.current = null;
    assetsRef.current.clear();
    setShipment(null);
    shipmentIdRef.current = null;
    setSheets(initialSheets());
    setVoyageNameState("Chuyến tàu mới");
    setResolvedValues({});
    setUploads([]);
    setExtracting(false);
    setSaveStatus("idle");
    dirtyRef.current = false;
    writeIdToUrl(null);
  }, []);

  const ensureShipment = useCallback(async (): Promise<string> => {
    if (statelessRef.current) {
      if (!localRef.current) commitLocal(makeLocal());
      return localRef.current!.id;
    }
    if (shipmentIdRef.current) return shipmentIdRef.current;
    if (!creatingRef.current) {
      creatingRef.current = apiJson<{ shipment: Shipment }>("/api/shipments", {
        method: "POST",
        body: JSON.stringify({ voyageName: latest.current.voyageName }),
      })
        .then((r) => {
          applyShipment(r.shipment, { replaceWorking: false });
          writeIdToUrl(r.shipment.id);
          return r.shipment.id;
        })
        .finally(() => {
          creatingRef.current = null;
        });
    }
    return creatingRef.current;
  }, [applyShipment, commitLocal, makeLocal]);

  // -------------------------------------------------------------------------
  // Lưu
  // -------------------------------------------------------------------------
  const saveNow = useCallback(async () => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (statelessRef.current) {
      // Không lưu server ở chế độ stateless – dữ liệu nằm trong trình duyệt
      dirtyRef.current = false;
      setSaveStatus("idle");
      return;
    }
    if (!dirtyRef.current && shipmentIdRef.current) return;
    setSaveStatus("saving");
    try {
      const id = await ensureShipment();
      dirtyRef.current = false;
      const { sheets: sh, voyageName: vn, resolvedValues: rv } = latest.current;
      const r = await apiJson<{ shipment: Shipment }>(`/api/shipments/${id}`, {
        method: "PUT",
        body: JSON.stringify({ sheets: sh, voyageName: vn, resolvedValues: rv }),
      });
      setShipment(r.shipment);
      setSaveStatus(dirtyRef.current ? "dirty" : "saved");
    } catch (err) {
      dirtyRef.current = true;
      setSaveStatus("error");
      toast.error(`Lưu thất bại: ${(err as Error).message}`);
    }
  }, [ensureShipment]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveStatus("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveNow();
    }, AUTOSAVE_MS);
  }, [saveNow]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || (statelessRef.current && (localRef.current?.files.length ?? 0) > 0)) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const setVoyageName = useCallback(
    (name: string) => {
      setVoyageNameState(name);
      markDirty();
    },
    [markDirty],
  );

  const updateSection = useCallback(
    (section: SectionKey, updater: (s: SheetsData[SectionKey]) => SheetsData[SectionKey]) => {
      setSheets((prev) => ({ ...prev, [section]: updater(prev[section]) }));
      markDirty();
    },
    [markDirty],
  );

  const setHeaderValue = useCallback(
    (section: SectionKey, key: string, value: string, extra?: Partial<FieldValue>) => {
      updateSection(section, (s) => {
        const prev = s.header[key];
        const next: FieldValue = {
          ...(prev ?? {}),
          value,
          userEdited: true,
          flags: (prev?.flags ?? []).filter((f) => f.kind === "needsConfirm" && value === "" ),
          ...extra,
        };
        return { ...s, header: { ...s.header, [key]: next } };
      });
    },
    [updateSection],
  );

  const resolveDiscrepancy = useCallback(
    (d: Discrepancy, field: FieldValue) => {
      if (d.target?.section && d.target.field) {
        const section = d.target.section;
        const key = d.target.field;
        setSheets((prev) => ({
          ...prev,
          [section]: { ...prev[section], header: { ...prev[section].header, [key]: { ...field, userEdited: true } } },
        }));
      } else if (d.target?.section && d.target.table && d.target.rowId && d.target.column) {
        // Ô trong bảng (vd. ngày sinh lệch giữa 2 crew list)
        const { section, table, rowId, column } = d.target;
        setSheets((prev) => ({
          ...prev,
          [section]: {
            ...prev[section],
            tables: {
              ...prev[section].tables,
              [table]: (prev[section].tables[table] ?? []).map((r) =>
                r.id === rowId ? { ...r, cells: { ...r.cells, [column]: { ...field, userEdited: true } } } : r,
              ),
            },
          },
        }));
      }
      setResolvedValues((prev) => ({ ...prev, [d.id]: field.value }));
      markDirty();
    },
    [markDirty],
  );

  // -------------------------------------------------------------------------
  // Polling khi đang bóc tách
  // -------------------------------------------------------------------------
  const wasExtracting = useRef(false);
  useEffect(() => {
    if (!extracting || !shipment || statelessRef.current) return;
    wasExtracting.current = true;
    const id = shipment.id;
    const timer = setInterval(async () => {
      try {
        const r = await apiJson<{ shipment: Shipment; extracting: boolean }>(`/api/shipments/${id}`);
        if (shipmentIdRef.current !== id) return;
        if (r.extracting) {
          setShipment((prev) => (prev ? { ...prev, files: r.shipment.files, extractedData: { ...prev.extractedData, instances: r.shipment.extractedData.instances } } : prev));
        } else {
          setExtracting(false);
          // Lưu thay đổi dở dang trước khi lấy dữ liệu tổng hợp mới (ô đã sửa tay được giữ)
          // Luôn tổng hợp lại một lần (không gọi AI) để chắc chắn dữ liệu đã đổ vào các sheet
          if (dirtyRef.current) await saveNow();
          try {
            const again = await apiJson<{ shipment: Shipment }>("/api/aggregate", { method: "POST", body: JSON.stringify({ shipmentId: id }) });
            applyShipment(again.shipment, { replaceWorking: true });
          } catch {
            applyShipment(r.shipment, { replaceWorking: true });
          }
          const errors = r.shipment.files.flatMap((f) => f.pages.filter((p) => p.status === "error"));
          if (errors.length) toast.error(`${errors.length} trang/phần bóc tách lỗi – xem chi tiết và bấm "Thử lại"`);
          else toast.success("Bóc tách xong. Hãy kiểm tra các ô tô vàng/đỏ.");
        }
      } catch {
        // bỏ qua lỗi tạm thời khi polling
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [extracting, shipment, saveNow, applyShipment]);

  // -------------------------------------------------------------------------
  // Thao tác
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // Chế độ stateless: upload / đọc AI / bật tắt trang ngay trong trình duyệt
  // -------------------------------------------------------------------------

  const uploadStateless = useCallback(
    async (files: File[]) => {
      await ensureShipment();
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const key = `${Date.now()}-${i}`;
        setUploads((prev) => [{ key, fileName: f.name, size: f.size, progress: 0, status: "uploading" }, ...prev]);
        const fail = (message: string) => {
          setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, status: "error", message } : u)));
          toast.error(`${f.name}: ${message}`);
        };
        if ((localRef.current?.files.length ?? 0) >= 15) {
          fail("Tối đa 15 file mỗi chuyến");
          continue;
        }
        if (f.size > STATELESS_MAX_BYTES) {
          fail("File vượt quá 4,4 MB (giới hạn của Vercel)");
          continue;
        }
        try {
          const form = new FormData();
          form.set("file", f);
          const r = await uploadWithProgress<{ file: FileRecord; assets: Array<{ page: number; text: string; image?: string }> }>(
            "/api/stateless/read",
            form,
            (fraction) => setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, progress: Math.min(0.9, fraction) } : u))),
          );
          const dup = localRef.current?.files.find((x) => x.sha256 === r.file.sha256 && !x.duplicateOf);
          const record: FileRecord = dup ? { ...r.file, duplicateOf: dup.fileId, pages: [] } : r.file;
          if (!dup) for (const a of r.assets) assetsRef.current.set(`${record.fileId}-${a.page}`, { text: a.text, image: a.image });
          updateLocal((s) => ({ ...s, files: [...s.files, record] }));
          setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, progress: 1, status: "done" } : u)));
          if (dup) toast.warning(`${f.name}: Trùng file với "${dup.fileName}" – chỉ xử lý một bản`);
          setTimeout(() => setUploads((prev) => prev.filter((u) => u.key !== key)), 1200);
        } catch (err) {
          fail((err as Error).message);
        }
      }
    },
    [ensureShipment, updateLocal],
  );

  const runStatelessExtraction = useCallback(
    async (target?: { fileId?: string; page?: number; force?: boolean }) => {
      const s0 = localRef.current;
      if (!s0) return;
      const queue: Array<{ fileId: string; fileName: string; page: PageInfo }> = [];
      for (const f of s0.files) {
        if (f.duplicateOf) continue;
        if (target?.fileId && f.fileId !== target.fileId) continue;
        for (const p of f.pages) {
          if (target?.page !== undefined && p.page !== target.page) continue;
          const needs = target?.fileId || target?.force ? true : p.status !== "done";
          if (needs) queue.push({ fileId: f.fileId, fileName: f.fileName, page: p });
        }
      }
      if (queue.length === 0) return;
      const setPage = (fileId: string, pageNo: number, patch: Partial<PageInfo>) =>
        updateLocal((s) => ({
          ...s,
          files: s.files.map((f) => (f.fileId === fileId ? { ...f, pages: f.pages.map((p) => (p.page === pageNo ? { ...p, ...patch } : p)) } : f)),
        }));
      for (const q of queue) setPage(q.fileId, q.page.page, { status: "pending", error: undefined });
      setExtracting(true);

      let cursor = 0;
      const worker = async () => {
        while (cursor < queue.length) {
          const q = queue[cursor++];
          setPage(q.fileId, q.page.page, { status: "processing" });
          try {
            const asset = assetsRef.current.get(`${q.fileId}-${q.page.page}`);
            if (!asset) throw new Error("Không còn dữ liệu trang (trang web đã tải lại?) – hãy xóa và upload lại file");
            const base = { fileId: q.fileId, fileName: q.fileName, page: q.page.page, kind: q.page.kind, text: asset.text };
            const c = await apiJson<{
              cls: {
                docType: NonNullable<PageInfo["docType"]>;
                mode?: "1-1" | "N-1" | null;
                port?: string | null;
                date?: string | null;
                voyageNo?: string | null;
                confidence?: number;
                title?: string | null;
              };
              rotation: number;
              imageBase64?: string;
            }>("/api/stateless/page", { method: "POST", body: JSON.stringify({ ...base, imageBase64: asset.image, step: "classify" }) });
            if (c.imageBase64) asset.image = c.imageBase64;
            let instance: ExtractedInstance | null = null;
            if (c.cls.docType !== "unknown") {
              const e = await apiJson<{ instance: ExtractedInstance }>("/api/stateless/page", {
                method: "POST",
                body: JSON.stringify({ ...base, imageBase64: asset.image, step: "extract", docType: c.cls.docType }),
              });
              instance = e.instance;
            }
            updateLocal((s) => {
              const instances = s.extractedData.instances.filter((i) => !(i.fileId === q.fileId && i.page === q.page.page));
              if (instance) instances.push(instance);
              return { ...s, extractedData: { ...s.extractedData, instances } };
            });
            setPage(q.fileId, q.page.page, {
              status: "done",
              docType: c.cls.docType,
              mode: c.cls.mode ?? null,
              port: c.cls.port ?? null,
              date: c.cls.date ?? null,
              voyageNo: c.cls.voyageNo ?? null,
              confidence: c.cls.confidence,
              rotation: (q.page.rotation + (c.rotation ?? 0)) % 360,
              title: q.page.title ?? c.cls.title ?? undefined,
              error: undefined,
            });
          } catch (err) {
            setPage(q.fileId, q.page.page, { status: "error", error: (err as Error).message });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
      recomputeLocal(true);
      setExtracting(false);
      const errors = (localRef.current?.files ?? []).flatMap((f) => f.pages.filter((p) => p.status === "error"));
      if (errors.length) toast.error(`${errors.length} trang/phần đọc lỗi – bấm ↻ cạnh file để thử lại`);
      else toast.success("Đọc xong. Hãy kiểm tra các ô tô vàng/đỏ.");
    },
    [updateLocal, recomputeLocal],
  );

  const localAction = useCallback(
    (body: { toggle?: { fileId: string; page: number; active: boolean }; removeFileId?: string }) => {
      const s = localRef.current;
      if (!s) return;
      if (body.toggle) {
        const { fileId, page, active } = body.toggle;
        const target = s.files.find((f) => f.fileId === fileId)?.pages.find((p) => p.page === page);
        const exclusive = active && (target?.docType === "crew_list" || target?.docType === "ship_store") ? target.docType : null;
        commitLocal({
          ...s,
          files: s.files.map((f) => ({
            ...f,
            pages: f.pages.map((p) => {
              if (f.fileId === fileId && p.page === page) return { ...p, active, activeManual: true, activeNote: active ? "Người dùng bật" : "Người dùng tắt" };
              if (exclusive && p.docType === exclusive && p.active) return { ...p, active: false, activeManual: true, activeNote: "Tự tắt vì người dùng chọn bản khác" };
              return p;
            }),
          })),
        });
      } else if (body.removeFileId) {
        const id = body.removeFileId;
        for (const k of [...assetsRef.current.keys()]) if (k.startsWith(`${id}-`)) assetsRef.current.delete(k);
        commitLocal({
          ...s,
          files: s.files.filter((f) => f.fileId !== id && f.duplicateOf !== id),
          extractedData: { ...s.extractedData, instances: s.extractedData.instances.filter((i) => i.fileId !== id) },
        });
      }
      recomputeLocal(false);
    },
    [commitLocal, recomputeLocal],
  );

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      if (statelessRef.current) return uploadStateless(files);
      await saveNow();
      const id = await ensureShipment();
      const batchKey = `${Date.now()}`;
      const items: UploadItem[] = files.map((f, i) => ({ key: `${batchKey}-${i}`, fileName: f.name, size: f.size, progress: 0, status: "uploading" }));
      setUploads((prev) => [...items, ...prev]);
      const form = new FormData();
      form.set("shipmentId", id);
      for (const f of files) form.append("files", f);
      try {
        const r = await uploadWithProgress<{ shipment: Shipment; outcomes: Array<{ fileName: string; ok: boolean; message?: string; duplicate?: boolean }> }>(
          "/api/upload",
          form,
          (fraction) => setUploads((prev) => prev.map((u) => (items.some((x) => x.key === u.key) ? { ...u, progress: Math.min(0.95, fraction) } : u))),
        );
        applyShipment(r.shipment, { replaceWorking: false });
        setUploads((prev) =>
          prev.map((u) => {
            const idx = items.findIndex((x) => x.key === u.key);
            if (idx < 0) return u;
            const outcome = r.outcomes.find((o) => o.fileName === u.fileName);
            return { ...u, progress: 1, status: outcome && !outcome.ok ? "error" : "done", message: outcome?.message };
          }),
        );
        for (const o of r.outcomes) {
          if (!o.ok) toast.error(`${o.fileName}: ${o.message}`);
          else if (o.duplicate) toast.warning(`${o.fileName}: ${o.message}`);
        }
        // Dọn mục upload đã xong (danh sách file thật nằm trong shipment)
        setTimeout(() => setUploads((prev) => prev.filter((u) => u.status === "error" || !items.some((x) => x.key === u.key))), 1200);
      } catch (err) {
        setUploads((prev) => prev.map((u) => (items.some((x) => x.key === u.key) ? { ...u, status: "error", message: (err as Error).message } : u)));
        toast.error(`Upload lỗi: ${(err as Error).message}`);
      }
    },
    [ensureShipment, applyShipment, saveNow, uploadStateless],
  );

  const startExtraction = useCallback(
    async (target?: { fileId?: string; page?: number; force?: boolean }) => {
      if (deepseek && !deepseek.configured) {
        toast.error("Chưa cấu hình API key cho AI trong .env.local");
        return;
      }
      if (statelessRef.current) return runStatelessExtraction(target);
      const id = shipmentIdRef.current;
      if (!id) return;
      await saveNow();
      try {
        const r = await apiJson<{ shipment: Shipment }>("/api/extract", { method: "POST", body: JSON.stringify({ shipmentId: id, ...target }) });
        setShipment(r.shipment);
        setExtracting(true);
      } catch (err) {
        toast.error((err as Error).message);
      }
    },
    [deepseek, saveNow, runStatelessExtraction],
  );

  const serverAction = useCallback(
    async (body: Record<string, unknown>) => {
      if (statelessRef.current) {
        localAction(body as { toggle?: { fileId: string; page: number; active: boolean }; removeFileId?: string });
        return;
      }
      const id = shipmentIdRef.current;
      if (!id) return;
      await saveNow();
      try {
        const r = await apiJson<{ shipment: Shipment }>("/api/aggregate", { method: "POST", body: JSON.stringify({ shipmentId: id, ...body }) });
        applyShipment(r.shipment, { replaceWorking: true });
        setSaveStatus("saved");
      } catch (err) {
        toast.error((err as Error).message);
      }
    },
    [saveNow, applyShipment, localAction],
  );

  const togglePage = useCallback((fileId: string, page: number, active: boolean) => serverAction({ toggle: { fileId, page, active } }), [serverAction]);
  const removeFile = useCallback((fileId: string) => serverAction({ removeFileId: fileId }), [serverAction]);
  const reaggregate = useCallback(() => serverAction({}), [serverAction]);

  const changeTemplate = useCallback(
    async (newTemplateId: string) => {
      const id = await ensureShipment();
      try {
        const r = await apiJson<{ shipment: Shipment }>(`/api/shipments/${id}`, { method: "PUT", body: JSON.stringify({ templateId: newTemplateId }) });
        setShipment(r.shipment);
        toast.success("Đã đổi template cho chuyến tàu này");
      } catch (err) {
        toast.error((err as Error).message);
      }
    },
    [ensureShipment],
  );

  const exportExcel = useCallback(async () => {
    try {
      await saveNow();
      const id = statelessRef.current ? null : shipmentIdRef.current;
      const res = await fetch("/api/export-excel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shipmentId: id, voyageName: latest.current.voyageName, sheets: latest.current.sheets }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `${res.status}`);
      }
      const name = decodeURIComponent(res.headers.get("X-Export-File") ?? "NSW.xlsx");
      const warnings = JSON.parse(decodeURIComponent(res.headers.get("X-Export-Warnings") ?? "%5B%5D")) as string[];
      downloadBlob(await res.blob(), name);
      toast.success(`Đã tạo ${name}`);
      for (const w of warnings.slice(0, 3)) toast.warning(w);
      if (id) {
        const r = await apiJson<{ shipment: Shipment }>(`/api/shipments/${id}`);
        setShipment(r.shipment);
      }
    } catch (err) {
      toast.error(`Xuất Excel thất bại: ${(err as Error).message}`);
    }
  }, [saveNow]);

  const jumpTo = useCallback((target: Omit<FocusTarget, "nonce">) => setFocus({ ...target, nonce: Date.now() }), []);
  const openSource = useCallback((view: SourceViewState | null) => setSourceView(view), []);

  // -------------------------------------------------------------------------
  // Đối chiếu ở client (tự cập nhật khi sửa)
  // -------------------------------------------------------------------------
  const aggregateContext = useMemo<AggregateContext>(() => ({ codes, ports, settings }), [codes, ports, settings]);
  ctxRef.current = aggregateContext;
  const check = useMemo<CrosscheckResult>(() => {
    if (!shipment) return { discrepancies: [], comparedGroups: 0 };
    return crosscheck(shipment.extractedData.instances, shipment.files, sheets, aggregateContext, resolvedValues);
  }, [shipment, sheets, aggregateContext, resolvedValues]);
  const unresolved = unresolvedCount(check);

  const value: ShipmentContextValue = {
    stateless,
    shipment,
    sheets,
    voyageName,
    resolvedValues,
    saveStatus,
    extracting,
    loading,
    codes,
    rules,
    ports,
    settings,
    deepseek,
    templates,
    currentTemplate,
    check,
    unresolved,
    aggregateContext,
    uploads,
    focus,
    sourceView,
    setVoyageName,
    updateSection,
    setHeaderValue,
    resolveDiscrepancy,
    saveNow,
    ensureShipment,
    uploadFiles,
    startExtraction,
    togglePage,
    removeFile,
    reaggregate,
    openShipment,
    newShipment,
    exportExcel,
    changeTemplate,
    refreshMeta,
    jumpTo,
    openSource,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
