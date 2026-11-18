-- ==============================================================================
-- Migration 01: Initial Schema for "Hồ sơ khai báo tàu nhập cảnh"
-- Chế độ truy cập công khai trực tiếp (Public / Demo Mode - Không bắt buộc đăng nhập)
-- ==============================================================================

-- 1. Bảng hồ sơ tàu (vessel_files)
CREATE TABLE IF NOT EXISTS public.vessel_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    vessel_name VARCHAR(255) NOT NULL,
    imo_number VARCHAR(7) NOT NULL CHECK (imo_number ~ '^[0-9]{7}$'),
    voyage_number VARCHAR(100) NOT NULL,
    arrival_port VARCHAR(255) NOT NULL,
    eta TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (
        status IN ('draft', 'documents_uploaded', 'extracted', 'confirmed', 'excel_exported')
    ),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_vessel_files_vessel_name ON public.vessel_files(vessel_name);
CREATE INDEX IF NOT EXISTS idx_vessel_files_imo ON public.vessel_files(imo_number);
CREATE INDEX IF NOT EXISTS idx_vessel_files_status ON public.vessel_files(status);
CREATE INDEX IF NOT EXISTS idx_vessel_files_eta ON public.vessel_files(eta);

-- 2. Bảng chứng từ đính kèm (documents)
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vessel_file_id UUID NOT NULL REFERENCES public.vessel_files(id) ON DELETE CASCADE,
    user_id UUID DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    doc_type VARCHAR(100) NOT NULL DEFAULT 'other',
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'extracting', 'extracted', 'error')
    ),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_documents_vessel_file_id ON public.documents(vessel_file_id);

-- 3. Bảng kết quả trích xuất dữ liệu (extractions)
CREATE TABLE IF NOT EXISTS public.extractions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    vessel_file_id UUID NOT NULL REFERENCES public.vessel_files(id) ON DELETE CASCADE,
    user_id UUID DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    confidence_score NUMERIC(5, 2) DEFAULT 0.00,
    citations JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_extractions_document_id UNIQUE (document_id)
);

CREATE INDEX IF NOT EXISTS idx_extractions_document_id ON public.extractions(document_id);
CREATE INDEX IF NOT EXISTS idx_extractions_vessel_file_id ON public.extractions(vessel_file_id);

-- 4. Bảng dữ liệu đã đối chiếu & xác nhận (confirmed_data)
CREATE TABLE IF NOT EXISTS public.confirmed_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vessel_file_id UUID NOT NULL REFERENCES public.vessel_files(id) ON DELETE CASCADE,
    user_id UUID DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    confirmed_by VARCHAR(255) NOT NULL DEFAULT 'Nhân viên đại lý',
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_confirmed_data_vessel_file_id UNIQUE (vessel_file_id)
);

CREATE INDEX IF NOT EXISTS idx_confirmed_data_vessel_file_id ON public.confirmed_data(vessel_file_id);

-- 5. Bảng lịch sử xuất file Excel (exports)
CREATE TABLE IF NOT EXISTS public.exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vessel_file_id UUID NOT NULL REFERENCES public.vessel_files(id) ON DELETE CASCADE,
    user_id UUID DEFAULT '00000000-0000-0000-0000-000000000000'::uuid,
    template_name VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT NOT NULL,
    exported_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_exports_vessel_file_id ON public.exports(vessel_file_id);

-- Cho phép truy cập mở (Public access) cho tất cả các bảng
ALTER TABLE public.vessel_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.confirmed_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_vessel_files" ON public.vessel_files FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_documents" ON public.documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_extractions" ON public.extractions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_confirmed_data" ON public.confirmed_data FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public_exports" ON public.exports FOR ALL USING (true) WITH CHECK (true);

-- Thiết lập bucket công khai
INSERT INTO storage.buckets (id, name, public)
VALUES 
    ('vessel-documents', 'vessel-documents', true),
    ('excel-exports', 'excel-exports', true),
    ('excel-templates', 'excel-templates', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "public_storage_vessel_documents" ON storage.objects FOR ALL USING (bucket_id = 'vessel-documents') WITH CHECK (bucket_id = 'vessel-documents');
CREATE POLICY "public_storage_excel_exports" ON storage.objects FOR ALL USING (bucket_id = 'excel-exports') WITH CHECK (bucket_id = 'excel-exports');
CREATE POLICY "public_storage_excel_templates" ON storage.objects FOR ALL USING (bucket_id = 'excel-templates') WITH CHECK (bucket_id = 'excel-templates');
