import {
  VesselFile,
  DocumentRecord,
  ExtractionRecord,
  ConfirmedDataRecord,
  ExportRecord,
} from "@/types/database";
import { createClient } from "@/lib/supabase/client";

const LOCAL_STORAGE_KEY_VESSELS = "vessel_declarations_vessels";
const LOCAL_STORAGE_KEY_DOCS = "vessel_declarations_documents";
const LOCAL_STORAGE_KEY_EXTRACTIONS = "vessel_declarations_extractions";
const LOCAL_STORAGE_KEY_CONFIRMED = "vessel_declarations_confirmed";
const LOCAL_STORAGE_KEY_EXPORTS = "vessel_declarations_exports";
const LOCAL_STORAGE_KEY_FILES = "vessel_declarations_file_blobs";

// Dữ liệu mẫu ban đầu để người dùng trải nghiệm ngay lập tức trên Vercel
const INITIAL_DEMO_VESSELS: VesselFile[] = [
  {
    id: "demo-vessel-1",
    vessel_name: "PACIFIC STAR",
    imo_number: "9438107",
    voyage_number: "V.2411N",
    arrival_port: "Cảng Cái Mép - Thị Vải (Bà Rịa - Vũng Tàu)",
    eta: new Date(Date.now() + 86400000).toISOString(),
    status: "draft",
    notes: "Tàu bách hóa tổng hợp, chở hàng rời. Cầu cảng dự kiến: TCIT Bến 2.",
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    id: "demo-vessel-2",
    vessel_name: "EVER BLISS",
    imo_number: "9811000",
    voyage_number: "0428S",
    arrival_port: "Cảng Hải Phòng",
    eta: new Date(Date.now() + 172800000).toISOString(),
    status: "draft",
    notes: "Tàu container trọng tải lớn, cần hoa tiêu dẫn luồng Lạch Huyện.",
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    updated_at: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
];

function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && key && !url.includes("placeholder") && !key.includes("placeholder"));
}

export const vesselStore = {
  // ===================== HỒ SƠ TÀU =====================
  async getVessels(): Promise<VesselFile[]> {
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("vessel_files")
          .select("*")
          .order("created_at", { ascending: false });
        if (!error && data && data.length > 0) {
          return data;
        }
      } catch {
        // Fallback to local storage
      }
    }

    if (typeof window === "undefined") return INITIAL_DEMO_VESSELS;
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY_VESSELS);
      if (!stored) {
        localStorage.setItem(LOCAL_STORAGE_KEY_VESSELS, JSON.stringify(INITIAL_DEMO_VESSELS));
        return INITIAL_DEMO_VESSELS;
      }
      return JSON.parse(stored);
    } catch {
      return INITIAL_DEMO_VESSELS;
    }
  },

  async getVesselById(id: string): Promise<VesselFile | null> {
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("vessel_files")
          .select("*")
          .eq("id", id)
          .single();
        if (!error && data) return data;
      } catch {
        // Fallback
      }
    }

    const vessels = await this.getVessels();
    return vessels.find((v) => v.id === id) || null;
  },

  async saveVessel(vesselData: Omit<VesselFile, "id" | "created_at" | "updated_at"> & { id?: string }): Promise<VesselFile> {
    const isEdit = Boolean(vesselData.id);
    const now = new Date().toISOString();
    const id = vesselData.id || "vsl-" + Math.random().toString(36).substring(2, 10);

    const record: VesselFile = {
      id,
      vessel_name: vesselData.vessel_name.toUpperCase(),
      imo_number: vesselData.imo_number,
      voyage_number: vesselData.voyage_number.toUpperCase(),
      arrival_port: vesselData.arrival_port,
      eta: vesselData.eta,
      status: vesselData.status || "draft",
      notes: vesselData.notes || null,
      created_at: now,
      updated_at: now,
    };

    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        if (isEdit) {
          const { data, error } = await (supabase.from("vessel_files") as any)
            .update({
              ...vesselData,
              vessel_name: vesselData.vessel_name.toUpperCase(),
              voyage_number: vesselData.voyage_number.toUpperCase(),
              updated_at: now,
            })
            .eq("id", id)
            .select()
            .single();
          if (!error && data) return data;
        } else {
          const { data, error } = await (supabase.from("vessel_files") as any)
            .insert({
              ...record,
              user_id: "00000000-0000-0000-0000-000000000000",
            })
            .select()
            .single();
          if (!error && data) return data;
        }
      } catch {
        // Fallback to local storage
      }
    }

    if (typeof window !== "undefined") {
      const vessels = await this.getVessels();
      let updated: VesselFile[];
      if (isEdit) {
        updated = vessels.map((v) => (v.id === id ? { ...v, ...record, created_at: v.created_at } : v));
      } else {
        updated = [record, ...vessels];
      }
      localStorage.setItem(LOCAL_STORAGE_KEY_VESSELS, JSON.stringify(updated));
    }

    return record;
  },

  async deleteVessel(id: string): Promise<void> {
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        await supabase.from("vessel_files").delete().eq("id", id);
      } catch {
        // Fallback
      }
    }

    if (typeof window !== "undefined") {
      const vessels = await this.getVessels();
      const updated = vessels.filter((v) => v.id !== id);
      localStorage.setItem(LOCAL_STORAGE_KEY_VESSELS, JSON.stringify(updated));

      // Also clean up docs & extractions
      const docs = await this.getDocuments(id);
      for (const d of docs) {
        await this.deleteDocument(d.id);
      }
    }
  },

  async updateVesselStatus(id: string, status: VesselFile["status"]): Promise<void> {
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        await (supabase.from("vessel_files") as any)
          .update({ status, updated_at: new Date().toISOString() })
          .eq("id", id);
      } catch {}
    }

    if (typeof window !== "undefined") {
      const vessels = await this.getVessels();
      const updated = vessels.map((v) =>
        v.id === id ? { ...v, status, updated_at: new Date().toISOString() } : v
      );
      localStorage.setItem(LOCAL_STORAGE_KEY_VESSELS, JSON.stringify(updated));
    }
  },

  // ===================== CHỨNG TỪ (DOCUMENTS) =====================
  async getDocuments(vesselFileId: string): Promise<DocumentRecord[]> {
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("documents")
          .select("*")
          .eq("vessel_file_id", vesselFileId)
          .order("created_at", { ascending: false });
        if (!error && data) return data;
      } catch {}
    }

    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY_DOCS);
      if (!stored) return [];
      const all: DocumentRecord[] = JSON.parse(stored);
      return all.filter((d) => d.vessel_file_id === vesselFileId);
    } catch {
      return [];
    }
  },

  async saveDocument(doc: Omit<DocumentRecord, "id" | "created_at" | "updated_at"> & { id?: string }): Promise<DocumentRecord> {
    const id = doc.id || "doc-" + Math.random().toString(36).substring(2, 10);
    const now = new Date().toISOString();
    const record: DocumentRecord = {
      ...doc,
      id,
      status: doc.status || "pending",
      created_at: now,
      updated_at: now,
    };

    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await (supabase.from("documents") as any)
          .upsert({ ...record, user_id: "00000000-0000-0000-0000-000000000000" })
          .select()
          .single();
        if (!error && data) return data;
      } catch {}
    }

    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY_DOCS);
      const all: DocumentRecord[] = stored ? JSON.parse(stored) : [];
      const existingIdx = all.findIndex((d) => d.id === id);
      if (existingIdx >= 0) {
        all[existingIdx] = { ...all[existingIdx], ...record, created_at: all[existingIdx].created_at };
      } else {
        all.unshift(record);
      }
      localStorage.setItem(LOCAL_STORAGE_KEY_DOCS, JSON.stringify(all));
    }

    return record;
  },

  async updateDocument(id: string, updates: Partial<DocumentRecord>): Promise<void> {
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        await (supabase.from("documents") as any)
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", id);
      } catch {}
    }

    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY_DOCS);
      if (stored) {
        const all: DocumentRecord[] = JSON.parse(stored);
        const updated = all.map((d) =>
          d.id === id ? { ...d, ...updates, updated_at: new Date().toISOString() } : d
        );
        localStorage.setItem(LOCAL_STORAGE_KEY_DOCS, JSON.stringify(updated));
      }
    }
  },

  async deleteDocument(id: string): Promise<void> {
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        await supabase.from("documents").delete().eq("id", id);
      } catch {}
    }

    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY_DOCS);
      if (stored) {
        const all: DocumentRecord[] = JSON.parse(stored);
        localStorage.setItem(LOCAL_STORAGE_KEY_DOCS, JSON.stringify(all.filter((d) => d.id !== id)));
      }
      // Also delete extraction & cached file
      await this.deleteExtraction(id);
      this.removeStoredFileBlob(id);
    }
  },

  // Lưu trữ file blob trong trình duyệt (cho preview trực tiếp)
  storeFileBlob(docId: string, dataUrl: string): void {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(`doc_blob_${docId}`, dataUrl);
    } catch {}
  },

  getStoredFileBlob(docId: string): string | null {
    if (typeof window === "undefined") return null;
    try {
      return sessionStorage.getItem(`doc_blob_${docId}`);
    } catch {
      return null;
    }
  },

  removeStoredFileBlob(docId: string): void {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.removeItem(`doc_blob_${docId}`);
    } catch {}
  },

  // ===================== KẾT QUẢ TRÍCH XUẤT (EXTRACTIONS) =====================
  async getExtractions(vesselFileId: string): Promise<ExtractionRecord[]> {
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("extractions")
          .select("*")
          .eq("vessel_file_id", vesselFileId);
        if (!error && data) return data;
      } catch {}
    }

    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY_EXTRACTIONS);
      if (!stored) return [];
      const all: ExtractionRecord[] = JSON.parse(stored);
      return all.filter((e) => e.vessel_file_id === vesselFileId);
    } catch {
      return [];
    }
  },

  async getExtractionByDocumentId(docId: string): Promise<ExtractionRecord | null> {
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("extractions")
          .select("*")
          .eq("document_id", docId)
          .single();
        if (!error && data) return data;
      } catch {}
    }

    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY_EXTRACTIONS);
      if (!stored) return null;
      const all: ExtractionRecord[] = JSON.parse(stored);
      return all.find((e) => e.document_id === docId) || null;
    } catch {
      return null;
    }
  },

  async saveExtraction(record: Omit<ExtractionRecord, "id" | "created_at" | "updated_at"> & { id?: string }): Promise<ExtractionRecord> {
    const id = record.id || "ext-" + Math.random().toString(36).substring(2, 10);
    const now = new Date().toISOString();
    const finalRecord: ExtractionRecord = {
      ...record,
      id,
      created_at: now,
      updated_at: now,
    };

    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await (supabase.from("extractions") as any)
          .upsert({ ...finalRecord, user_id: "00000000-0000-0000-0000-000000000000" })
          .select()
          .single();
        if (!error && data) return data;
      } catch {}
    }

    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY_EXTRACTIONS);
      const all: ExtractionRecord[] = stored ? JSON.parse(stored) : [];
      const idx = all.findIndex((e) => e.document_id === record.document_id);
      if (idx >= 0) {
        all[idx] = finalRecord;
      } else {
        all.push(finalRecord);
      }
      localStorage.setItem(LOCAL_STORAGE_KEY_EXTRACTIONS, JSON.stringify(all));
    }

    return finalRecord;
  },

  async deleteExtraction(documentId: string): Promise<void> {
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        await supabase.from("extractions").delete().eq("document_id", documentId);
      } catch {}
    }

    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY_EXTRACTIONS);
      if (stored) {
        const all: ExtractionRecord[] = JSON.parse(stored);
        localStorage.setItem(LOCAL_STORAGE_KEY_EXTRACTIONS, JSON.stringify(all.filter((e) => e.document_id !== documentId)));
      }
    }
  },

  // ===================== DỮ LIỆU ĐÃ XÁC NHẬN (CONFIRMED DATA) =====================
  async getConfirmedData(vesselFileId: string): Promise<ConfirmedDataRecord | null> {
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("confirmed_data")
          .select("*")
          .eq("vessel_file_id", vesselFileId)
          .single();
        if (!error && data) return data;
      } catch {}
    }

    if (typeof window === "undefined") return null;
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY_CONFIRMED);
      if (!stored) return null;
      const all: ConfirmedDataRecord[] = JSON.parse(stored);
      return all.find((c) => c.vessel_file_id === vesselFileId) || null;
    } catch {
      return null;
    }
  },

  async saveConfirmedData(vesselFileId: string, data: Record<string, any>, confirmedBy: string = "Nhân viên đại lý"): Promise<ConfirmedDataRecord> {
    const now = new Date().toISOString();
    const record: ConfirmedDataRecord = {
      id: "conf-" + Math.random().toString(36).substring(2, 10),
      vessel_file_id: vesselFileId,
      user_id: "00000000-0000-0000-0000-000000000000",
      confirmed_by: confirmedBy,
      confirmed_at: now,
      data,
      created_at: now,
      updated_at: now,
    };

    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        await (supabase.from("confirmed_data") as any).upsert(record);
      } catch {}
    }

    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY_CONFIRMED);
      const all: ConfirmedDataRecord[] = stored ? JSON.parse(stored) : [];
      const idx = all.findIndex((c) => c.vessel_file_id === vesselFileId);
      if (idx >= 0) {
        all[idx] = record;
      } else {
        all.push(record);
      }
      localStorage.setItem(LOCAL_STORAGE_KEY_CONFIRMED, JSON.stringify(all));
    }

    return record;
  },

  // ===================== LỊCH SỬ XUẤT EXCEL (EXPORTS) =====================
  async getExports(vesselFileId: string): Promise<ExportRecord[]> {
    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("exports")
          .select("*")
          .eq("vessel_file_id", vesselFileId)
          .order("exported_at", { ascending: false });
        if (!error && data) return data;
      } catch {}
    }

    if (typeof window === "undefined") return [];
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY_EXPORTS);
      if (!stored) return [];
      const all: ExportRecord[] = JSON.parse(stored);
      return all.filter((e) => e.vessel_file_id === vesselFileId);
    } catch {
      return [];
    }
  },

  async saveExport(record: Omit<ExportRecord, "id" | "created_at">): Promise<ExportRecord> {
    const id = "exp-" + Math.random().toString(36).substring(2, 10);
    const now = new Date().toISOString();
    const finalRecord: ExportRecord = {
      ...record,
      id,
      created_at: now,
    };

    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        await (supabase.from("exports") as any).insert({ ...finalRecord, user_id: "00000000-0000-0000-0000-000000000000" });
      } catch {}
    }

    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY_EXPORTS);
      const all: ExportRecord[] = stored ? JSON.parse(stored) : [];
      all.unshift(finalRecord);
      localStorage.setItem(LOCAL_STORAGE_KEY_EXPORTS, JSON.stringify(all));
    }

    return finalRecord;
  },
};
