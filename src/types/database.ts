export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type VesselFileStatus = 
  | 'draft' 
  | 'documents_uploaded' 
  | 'extracted' 
  | 'confirmed' 
  | 'excel_exported';

export type DocumentStatus = 
  | 'pending' 
  | 'extracting' 
  | 'extracted' 
  | 'error';

export interface VesselFile {
  id: string;
  user_id?: string;
  vessel_name: string;
  imo_number: string;
  voyage_number: string;
  arrival_port: string;
  eta: string;
  status: VesselFileStatus;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentRecord {
  id: string;
  vessel_file_id: string;
  user_id?: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  doc_type: string;
  status: DocumentStatus;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExtractionRecord {
  id: string;
  document_id: string;
  vessel_file_id: string;
  user_id?: string;
  raw_json: Record<string, { value: any; confidence?: number; citation?: string }>;
  confidence_score: number;
  citations?: Record<string, string>;
  error_message?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConfirmedDataRecord {
  id: string;
  vessel_file_id: string;
  user_id?: string;
  confirmed_by: string;
  confirmed_at: string;
  data: Record<string, any>;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExportRecord {
  id: string;
  vessel_file_id: string;
  user_id?: string;
  template_name: string;
  file_name: string;
  file_path: string;
  exported_at: string;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      vessel_files: {
        Row: VesselFile;
        Insert: Omit<VesselFile, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<VesselFile, 'id' | 'user_id'>>;
      };
      documents: {
        Row: DocumentRecord;
        Insert: Omit<DocumentRecord, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<DocumentRecord, 'id' | 'user_id'>>;
      };
      extractions: {
        Row: ExtractionRecord;
        Insert: Omit<ExtractionRecord, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ExtractionRecord, 'id' | 'user_id'>>;
      };
      confirmed_data: {
        Row: ConfirmedDataRecord;
        Insert: Omit<ConfirmedDataRecord, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ConfirmedDataRecord, 'id' | 'user_id'>>;
      };
      exports: {
        Row: ExportRecord;
        Insert: Omit<ExportRecord, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<ExportRecord, 'id' | 'user_id'>>;
      };
    };
  };
}
