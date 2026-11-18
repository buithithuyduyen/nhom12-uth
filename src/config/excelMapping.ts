export interface ExcelFieldMapping {
  fieldKey: string;
  fieldLabel: string;
  sourceKey: string; // ví dụ: 'general_declaration.vessel_name' hoặc 'vessel_name'
  cellRef: string;   // ví dụ: 'Sheet1!C4'
  sheetName: string; // ví dụ: 'Bản khai chung'
  cellCoordinate: string; // ví dụ: 'C4'
}

export interface ExcelTemplateConfig {
  templateId: string;
  templateName: string;
  description: string;
  mappings: ExcelFieldMapping[];
}

export const DEFAULT_EXCEL_TEMPLATE: ExcelTemplateConfig = {
  templateId: 'fal_declaration_template',
  templateName: 'Mẫu Khai Báo Hải Quan & Cảng Vụ (IMO FAL Forms)',
  description: 'Mẫu Excel tổng hợp khai báo tàu nhập cảnh chuẩn Cục Hàng Hải Việt Nam',
  mappings: [
    {
      fieldKey: 'vessel_name',
      fieldLabel: 'Tên tàu (Name of Ship)',
      sourceKey: 'vessel_name',
      cellRef: 'Bản khai chung!C4',
      sheetName: 'Bản khai chung',
      cellCoordinate: 'C4',
    },
    {
      fieldKey: 'imo_number',
      fieldLabel: 'Số IMO (IMO Number)',
      sourceKey: 'imo_number',
      cellRef: 'Bản khai chung!C5',
      sheetName: 'Bản khai chung',
      cellCoordinate: 'C5',
    },
    {
      fieldKey: 'call_sign',
      fieldLabel: 'Hô hiệu (Call Sign)',
      sourceKey: 'call_sign',
      cellRef: 'Bản khai chung!G4',
      sheetName: 'Bản khai chung',
      cellCoordinate: 'G4',
    },
    {
      fieldKey: 'voyage_number',
      fieldLabel: 'Số chuyến (Voyage Number)',
      sourceKey: 'voyage_number',
      cellRef: 'Bản khai chung!G5',
      sheetName: 'Bản khai chung',
      cellCoordinate: 'G5',
    },
    {
      fieldKey: 'flag_state',
      fieldLabel: 'Quốc tịch tàu (Flag State)',
      sourceKey: 'flag_state',
      cellRef: 'Bản khai chung!C6',
      sheetName: 'Bản khai chung',
      cellCoordinate: 'C6',
    },
    {
      fieldKey: 'master_name',
      fieldLabel: 'Tên thuyền trưởng (Master Name)',
      sourceKey: 'master_name',
      cellRef: 'Bản khai chung!G6',
      sheetName: 'Bản khai chung',
      cellCoordinate: 'G6',
    },
    {
      fieldKey: 'arrival_port',
      fieldLabel: 'Cảng đến (Port of Arrival)',
      sourceKey: 'arrival_port',
      cellRef: 'Bản khai chung!C8',
      sheetName: 'Bản khai chung',
      cellCoordinate: 'C8',
    },
    {
      fieldKey: 'eta',
      fieldLabel: 'Thời gian đến dự kiến (ETA)',
      sourceKey: 'eta',
      cellRef: 'Bản khai chung!G8',
      sheetName: 'Bản khai chung',
      cellCoordinate: 'G8',
    },
    {
      fieldKey: 'gross_tonnage',
      fieldLabel: 'Dung tích toàn phần (GT)',
      sourceKey: 'gross_tonnage',
      cellRef: 'Bản khai chung!C10',
      sheetName: 'Bản khai chung',
      cellCoordinate: 'C10',
    },
    {
      fieldKey: 'net_tonnage',
      fieldLabel: 'Dung tích hữu dụng (NT)',
      sourceKey: 'net_tonnage',
      cellRef: 'Bản khai chung!G10',
      sheetName: 'Bản khai chung',
      cellCoordinate: 'G10',
    },
    {
      fieldKey: 'total_crew',
      fieldLabel: 'Tổng số thuyền viên (Total Crew)',
      sourceKey: 'total_crew',
      cellRef: 'Bản khai chung!C12',
      sheetName: 'Bản khai chung',
      cellCoordinate: 'C12',
    },
  ],
};
