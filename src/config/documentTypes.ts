export interface DocumentFieldConfig {
  key: string;
  label: string;
  dataType: 'string' | 'number' | 'date' | 'datetime' | 'array' | 'boolean';
  description?: string;
  required?: boolean;
}

export interface DocumentTypeConfig {
  id: string;
  name: string;
  code: string;
  description: string;
  detectionHints: {
    keywords: string[];
    titles: string[];
    patterns?: string[];
  };
  fields: DocumentFieldConfig[];
}

export const DOCUMENT_TYPES: DocumentTypeConfig[] = [
  {
    id: 'general_declaration',
    name: 'Bản khai chung (General Declaration - IMO FAL Form 1)',
    code: 'FAL1',
    description: 'Bản khai thông tin chung của tàu khi nhập cảnh hoặc xuất cảnh cảng biển.',
    detectionHints: {
      keywords: [
        'GENERAL DECLARATION',
        'FAL FORM 1',
        'IMO FAL 1',
        'BẢN KHAI CHUNG',
        'NAME AND DESCRIPTION OF SHIP',
        'PORT OF ARRIVAL',
        'DATE AND TIME OF ARRIVAL',
        'NAME OF MASTER',
      ],
      titles: ['GENERAL DECLARATION', 'IMO GENERAL DECLARATION', 'BẢN KHAI CHUNG'],
    },
    fields: [
      { key: 'vessel_name', label: 'Tên tàu', dataType: 'string', required: true, description: 'Tên chính thức của tàu' },
      { key: 'imo_number', label: 'Số IMO', dataType: 'string', required: true, description: 'Số IMO gồm đúng 7 chữ số' },
      { key: 'voyage_number', label: 'Số chuyến', dataType: 'string', required: true, description: 'Mã số chuyến đi' },
      { key: 'call_sign', label: 'Hô hiệu (Call Sign)', dataType: 'string', description: 'Hô hiệu liên lạc quốc tế' },
      { key: 'flag_state', label: 'Quốc tịch tàu (Flag State)', dataType: 'string', description: 'Quốc gia tàu mang cờ' },
      { key: 'master_name', label: 'Tên thuyền trưởng (Master Name)', dataType: 'string', description: 'Họ và tên thuyền trưởng' },
      { key: 'port_of_arrival', label: 'Cảng đến', dataType: 'string', required: true, description: 'Tên cảng đến tại Việt Nam' },
      { key: 'eta', label: 'Thời gian đến dự kiến (ETA)', dataType: 'datetime', required: true, description: 'Ngày giờ đến (ISO hoặc YYYY-MM-DD HH:mm)' },
      { key: 'port_of_departure', label: 'Cảng rời cuối cùng (Last Port of Call)', dataType: 'string', description: 'Cảng tàu đã rời trước khi đến' },
      { key: 'gross_tonnage', label: 'Dung tích toàn phần (GT)', dataType: 'number', description: 'Gross Tonnage' },
      { key: 'net_tonnage', label: 'Dung tích hữu dụng (NT)', dataType: 'number', description: 'Net Tonnage' },
      { key: 'dwt', label: 'Trọng tải toàn phần (DWT)', dataType: 'number', description: 'Deadweight Tonnage' },
      { key: 'loa', label: 'Chiều dài lớn nhất (LOA)', dataType: 'number', description: 'Length Overall (mét)' },
      { key: 'beam', label: 'Chiều rộng lớn nhất (Beam)', dataType: 'number', description: 'Extreme Breadth (mét)' },
      { key: 'arrival_draft_fwd', label: 'Mớn nước mũi khi đến (Draft Fwd)', dataType: 'number', description: 'Mớn nước phía trước (mét)' },
      { key: 'arrival_draft_aft', label: 'Mớn nước lái khi đến (Draft Aft)', dataType: 'number', description: 'Mớn nước phía sau (mét)' },
      { key: 'agent_name', label: 'Đại lý tàu (Ship Agent)', dataType: 'string', description: 'Tên công ty đại lý làm thủ tục' },
    ],
  },
  {
    id: 'crew_list',
    name: 'Danh sách thuyền viên (Crew List - IMO FAL Form 5)',
    code: 'FAL5',
    description: 'Danh sách toàn bộ sỹ quan và thuyền viên trên tàu nhập cảnh.',
    detectionHints: {
      keywords: [
        'CREW LIST',
        'FAL FORM 5',
        'IMO FAL 5',
        'DANH SÁCH THUYỀN VIÊN',
        'SEAMAN BOOK',
        'RANK OR RATING',
        'NATIONALITY',
        'DATE OF BIRTH',
      ],
      titles: ['CREW LIST', 'IMO CREW LIST', 'DANH SÁCH THUYỀN VIÊN'],
    },
    fields: [
      { key: 'vessel_name', label: 'Tên tàu', dataType: 'string', required: true },
      { key: 'imo_number', label: 'Số IMO', dataType: 'string', required: true },
      { key: 'voyage_number', label: 'Số chuyến', dataType: 'string' },
      { key: 'port_of_arrival', label: 'Cảng đến', dataType: 'string' },
      { key: 'eta', label: 'Thời gian đến (ETA)', dataType: 'datetime' },
      { key: 'total_crew', label: 'Tổng số thuyền viên', dataType: 'number', required: true, description: 'Số lượng thuyền viên trên tàu' },
      { key: 'master_name', label: 'Thuyền trưởng', dataType: 'string' },
      { key: 'crew_members', label: 'Danh sách chi tiết thuyền viên', dataType: 'array', description: 'Mảng danh sách các thuyền viên (Họ tên, chức danh, quốc tịch, số hộ chiếu/sổ thuyền viên)' },
    ],
  },
  {
    id: 'passenger_list',
    name: 'Danh sách hành khách (Passenger List - IMO FAL Form 6)',
    code: 'FAL6',
    description: 'Bản khai danh sách hành khách đi trên tàu (nếu có).',
    detectionHints: {
      keywords: [
        'PASSENGER LIST',
        'FAL FORM 6',
        'IMO FAL 6',
        'DANH SÁCH HÀNH KHÁCH',
        'PORT OF EMBARKATION',
        'PORT OF DISEMBARKATION',
      ],
      titles: ['PASSENGER LIST', 'IMO PASSENGER LIST', 'DANH SÁCH HÀNH KHÁCH'],
    },
    fields: [
      { key: 'vessel_name', label: 'Tên tàu', dataType: 'string', required: true },
      { key: 'imo_number', label: 'Số IMO', dataType: 'string', required: true },
      { key: 'total_passengers', label: 'Tổng số hành khách', dataType: 'number', required: true },
      { key: 'passengers', label: 'Danh sách chi tiết hành khách', dataType: 'array' },
    ],
  },
  {
    id: 'cargo_declaration',
    name: 'Bản khai hàng hóa (Cargo Declaration - IMO FAL Form 2)',
    code: 'FAL2',
    description: 'Bản khai tổng hợp hàng hóa chuyên chở trên tàu nhập cảnh.',
    detectionHints: {
      keywords: [
        'CARGO DECLARATION',
        'FAL FORM 2',
        'MANIFEST',
        'BẢN KHAI HÀNG HÓA',
        'BILL OF LADING',
        'MARKS AND NUMBERS',
        'GROSS WEIGHT',
      ],
      titles: ['CARGO DECLARATION', 'BẢN KHAI HÀNG HÓA', 'MANIFEST'],
    },
    fields: [
      { key: 'vessel_name', label: 'Tên tàu', dataType: 'string', required: true },
      { key: 'imo_number', label: 'Số IMO', dataType: 'string', required: true },
      { key: 'voyage_number', label: 'Số chuyến', dataType: 'string' },
      { key: 'port_of_loading', label: 'Cảng xếp hàng', dataType: 'string' },
      { key: 'port_of_discharge', label: 'Cảng dỡ hàng', dataType: 'string' },
      { key: 'cargo_description', label: 'Mô tả loại hàng', dataType: 'string' },
      { key: 'total_gross_weight', label: 'Tổng trọng lượng hàng (Gross Weight/MT)', dataType: 'number' },
      { key: 'total_packages', label: 'Tổng số kiện/container', dataType: 'string' },
    ],
  },
  {
    id: 'ship_stores_declaration',
    name: 'Bản khai dự trữ của tàu (Ship Stores Declaration - IMO FAL Form 3)',
    code: 'FAL3',
    description: 'Khai báo dự trữ nhiên liệu, dầu mỡ, thực phẩm và vật phẩm tiêu dùng trên tàu.',
    detectionHints: {
      keywords: [
        'SHIP STORES DECLARATION',
        'FAL FORM 3',
        'BẢN KHAI DỰ TRỮ CỦA TÀU',
        'BUNKER',
        'FUEL OIL',
        'LUBE OIL',
        'FRESH WATER',
        'PROVISIONS',
      ],
      titles: ['SHIP STORES DECLARATION', 'BẢN KHAI DỰ TRỮ'],
    },
    fields: [
      { key: 'vessel_name', label: 'Tên tàu', dataType: 'string', required: true },
      { key: 'imo_number', label: 'Số IMO', dataType: 'string', required: true },
      { key: 'fuel_oil_qty', label: 'Dầu FO (Tấn/MT)', dataType: 'number' },
      { key: 'diesel_oil_qty', label: 'Dầu DO/MGO (Tấn/MT)', dataType: 'number' },
      { key: 'lube_oil_qty', label: 'Dầu nhờn (Lít/MT)', dataType: 'number' },
      { key: 'fresh_water_qty', label: 'Nước ngọt dự trữ (Tấn/MT)', dataType: 'number' },
    ],
  },
  {
    id: 'crew_effects_declaration',
    name: 'Bản khai hành lý thuyền viên (Crew Effects - IMO FAL Form 4)',
    code: 'FAL4',
    description: 'Khai báo hành lý tư trang chịu thuế, rượu bia, thuốc lá của thuyền viên.',
    detectionHints: {
      keywords: [
        'CREW EFFECTS DECLARATION',
        'FAL FORM 4',
        'HÀNH LÝ THUYỀN VIÊN',
        'EFFECTS INELIGIBLE FOR RELIEF',
        'CIGARETTES',
        'SPIRITS',
      ],
      titles: ['CREW EFFECTS DECLARATION', 'BẢN KHAI HÀNH LÝ'],
    },
    fields: [
      { key: 'vessel_name', label: 'Tên tàu', dataType: 'string', required: true },
      { key: 'imo_number', label: 'Số IMO', dataType: 'string', required: true },
      { key: 'total_crew_declared', label: 'Số lượng thuyền viên khai báo', dataType: 'number' },
      { key: 'declared_items_summary', label: 'Tổng kết thuốc lá/rượu/ngoại tệ khai báo', dataType: 'string' },
    ],
  },
  {
    id: 'maritime_health_declaration',
    name: 'Bản khai kiểm dịch y tế hàng hải (Maritime Health Declaration)',
    code: 'MDH',
    description: 'Khai báo y tế quốc tế về tình hình dịch bệnh và sức khỏe trên tàu.',
    detectionHints: {
      keywords: [
        'MARITIME DECLARATION OF HEALTH',
        'HEALTH DECLARATION',
        'KIỂM DỊCH Y TẾ HÀNG HẢI',
        'INTERNATIONAL HEALTH REGULATIONS',
        'NUMBER OF CREW',
        'VALID SANITATION CERTIFICATE',
      ],
      titles: ['MARITIME DECLARATION OF HEALTH', 'BẢN KHAI KIỂM DỊCH Y TẾ'],
    },
    fields: [
      { key: 'vessel_name', label: 'Tên tàu', dataType: 'string', required: true },
      { key: 'imo_number', label: 'Số IMO', dataType: 'string', required: true },
      { key: 'port_of_arrival', label: 'Cảng đến', dataType: 'string' },
      { key: 'deratting_cert_date', label: 'Ngày cấp Giấy chứng nhận vệ sinh/diệt chuột tàu', dataType: 'date' },
      { key: 'deratting_cert_port', label: 'Cảng cấp giấy chứng nhận vệ sinh', dataType: 'string' },
      { key: 'sick_persons_reported', label: 'Có người ốm/sốt trên tàu không', dataType: 'boolean' },
    ],
  },
  {
    id: 'other',
    name: 'Chứng từ khác (Khác / Chưa phân loại)',
    code: 'OTHER',
    description: 'Các giấy tờ, chứng chỉ, công văn hoặc chứng từ liên quan khác.',
    detectionHints: {
      keywords: [],
      titles: [],
    },
    fields: [
      { key: 'vessel_name', label: 'Tên tàu', dataType: 'string' },
      { key: 'imo_number', label: 'Số IMO', dataType: 'string' },
      { key: 'document_title', label: 'Tiêu đề chứng từ', dataType: 'string' },
      { key: 'document_number', label: 'Số hiệu văn bản', dataType: 'string' },
      { key: 'issue_date', label: 'Ngày phát hành', dataType: 'date' },
    ],
  },
];

export function getDocumentTypeById(id: string): DocumentTypeConfig {
  return DOCUMENT_TYPES.find((doc) => doc.id === id) || DOCUMENT_TYPES[DOCUMENT_TYPES.length - 1];
}

/**
 * Tự động đoán loại chứng từ dựa trên tên file hoặc đoạn văn bản mở đầu
 */
export function detectDocumentType(fileName: string, textSnippet?: string): string {
  const normalized = (fileName + ' ' + (textSnippet || '')).toLowerCase();

  for (const docType of DOCUMENT_TYPES) {
    if (docType.id === 'other') continue;

    // Kiểm tra titles và keywords
    const matchesKeyword = docType.detectionHints.keywords.some((kw) =>
      normalized.includes(kw.toLowerCase())
    );
    const matchesTitle = docType.detectionHints.titles.some((title) =>
      normalized.includes(title.toLowerCase())
    );

    if (matchesKeyword || matchesTitle) {
      return docType.id;
    }
  }

  // Một số từ viết tắt phổ biến trong vận tải biển
  if (normalized.includes('fal 1') || normalized.includes('gen dec') || normalized.includes('gendec')) {
    return 'general_declaration';
  }
  if (normalized.includes('fal 5') || normalized.includes('crew')) {
    return 'crew_list';
  }
  if (normalized.includes('fal 2') || normalized.includes('cargo') || normalized.includes('manifest')) {
    return 'cargo_declaration';
  }
  if (normalized.includes('fal 3') || normalized.includes('store') || normalized.includes('bunker')) {
    return 'ship_stores_declaration';
  }
  if (normalized.includes('fal 4') || normalized.includes('effects')) {
    return 'crew_effects_declaration';
  }
  if (normalized.includes('health') || normalized.includes('y te') || normalized.includes('yte')) {
    return 'maritime_health_declaration';
  }

  return 'other';
}
