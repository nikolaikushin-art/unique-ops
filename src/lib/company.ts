/**
 * Studio requisites — printed on invoices, acts and warranty cards, and used in client messages.
 * Stored in this browser (key `uo:company`, included in the backup file).
 */
export interface CompanyProfile {
  name: string;
  legal_name: string;
  inn: string;
  kpp: string;
  ogrn: string;
  address: string;
  phone: string;
  email: string;
  site: string;
  bank_name: string;
  bik: string;
  account: string;
  corr_account: string;
  director: string;
  review_url: string;
  invoice_note: string;
  warranty_terms: string;
}

export const DEFAULT_WARRANTY_TERMS =
  'Гарантия действует при соблюдении рекомендаций по уходу и прохождении планового обслуживания в указанные сроки. ' +
  'Не распространяется на механические повреждения, последствия ДТП, использование агрессивной химии и вмешательство третьих лиц. ' +
  'Гарантийный случай определяется по результатам осмотра автомобиля в студии.';

export const DEFAULT_COMPANY: CompanyProfile = {
  name: 'Unique Detailing',
  legal_name: '',
  inn: '',
  kpp: '',
  ogrn: '',
  address: '',
  phone: '',
  email: '',
  site: 'uniquedetailing.ru',
  bank_name: '',
  bik: '',
  account: '',
  corr_account: '',
  director: '',
  review_url: '',
  invoice_note: 'Оплата по счёту означает согласие с перечнем и стоимостью работ.',
  warranty_terms: DEFAULT_WARRANTY_TERMS,
};

const KEY = 'uo:company';

export function getCompany(): CompanyProfile {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_COMPANY };
    return { ...DEFAULT_COMPANY, ...(JSON.parse(raw) as Partial<CompanyProfile>) };
  } catch {
    return { ...DEFAULT_COMPANY };
  }
}

export function saveCompany(c: CompanyProfile) {
  localStorage.setItem(KEY, JSON.stringify(c));
}
