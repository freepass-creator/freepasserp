export const PRODUCT_PANEL_LABEL = '재고';

export const CODE_BOUND_FIELDS = [
  ['vehicle_status', 'PRODUCT_VEHICLE_STATUS'],
  ['product_type', 'PRODUCT_TYPE'],
  ['maker', 'PRODUCT_MAKER'],
  ['model_name', 'PRODUCT_MODEL_NAME'],
  ['sub_model', 'PRODUCT_SUB_MODEL'],
  ['fuel_type', 'PRODUCT_FUEL_TYPE']
];

export const STATIC_SELECT_OPTIONS = {
  vehicle_status: ['출고가능', '출고협의', '출고불가', '계약대기', '계약완료'],
  product_type: ['중고렌트', '신차렌트', '중고구독', '신차구독'],
  fuel_type: ['가솔린', '디젤', 'LPG', '하이브리드', '전기', '수소']
};

export const DEFAULT_SELECT_VALUES = {
  vehicle_status: '출고가능',
  product_type: '중고렌트'
};

export const LINKED_SPEC_FIELDS = new Set(['maker', 'model_name', 'sub_model']);
export const SELECT_PLACEHOLDER_TEXT = '선택';

export const YEAR_SELECT_OPTIONS = Array.from({ length: 10 }, (_, index) => {
  const year = 2026 - index;
  return { value: String(year), label: `${year}` };
});

export const PRODUCT_MANAGE_FILTER_GROUPS = [
  { key: 'vehicle_status', title: '차량상태', open: true },
  { key: 'product_type', title: '상품구분', open: true },
  { key: 'partner_code', title: '공급사코드', open: true },
  { key: 'maker', title: '제조사', open: false },
  { key: 'sub_model', title: '세부모델', open: false },
  { key: 'ext_color', title: '외부색상', open: false },
  { key: 'int_color', title: '내부색상', open: false },
  { key: 'fuel_type', title: '연료', open: false },
  { key: 'vehicle_class', title: '차종구분', open: false }
];

export const FIELD_IDS = [
  'partner_code','policy_code','vehicle_status','product_type','car_number','maker','model_name','sub_model','trim_name',
  'options','vehicle_price','ext_color','int_color','year','mileage','fuel_type','vehicle_class','first_registration_date','vehicle_age_expiry_date','partner_memo','photo_link',
  'rent_1','deposit_1','fee_1','rent_12','deposit_12','fee_12','rent_24','deposit_24','fee_24',
  'rent_36','deposit_36','fee_36','rent_48','deposit_48','fee_48','rent_60','deposit_60','fee_60'
];

export const FIELD_NUMBERS = new Set([
  'vehicle_price','mileage','rent_1','deposit_1','fee_1','rent_12','deposit_12','fee_12','rent_24','deposit_24','fee_24',
  'rent_36','deposit_36','fee_36','rent_48','deposit_48','fee_48','rent_60','deposit_60','fee_60'
]);

export const IMPORT_ONLY_FIELD_IDS = [
  'base_age',
  'annual_mileage',
  'insurance_included',
  'buyout_method',
  'review_status',
  'credit_grade',
  'min_age',
  'age_lowering_cost',
  'maintenance_service',
  'emergency_service',
  'rental_region',
  'delivery_fee',
  'penalty_rate',
  'note'
];

export const IMPORT_ALLOWED_FIELDS = new Set([...FIELD_IDS, ...IMPORT_ONLY_FIELD_IDS]);
