/**
 * CONSENTS — what the studio confirms right after every login (personal-data processing is mandatory,
 * mailings and usage analytics are optional). Choices are remembered per user in this browser
 * (`uo:consents:<profile id>`) and pre-filled on the next login; the dialog itself is shown once per login.
 */
import { DOCS_VERSION } from './consentDocs';
export const CONSENT_VERSION = 2;

export interface ConsentRecord {
  version: number;
  personal_data: boolean;
  marketing: boolean;
  analytics: boolean;
  accepted_at: string;
  /** version (date) of the document texts that were accepted */
  docs_version?: string;
}

export const CONSENT_ITEMS: { key: 'personal_data' | 'marketing' | 'analytics'; title: string; text: string; required?: boolean }[] = [
  { key: 'personal_data', required: true, title: 'Обработка персональных данных', text: 'Ваши данные как сотрудника, а также имена, телефоны, автомобили и история обслуживания клиентов студии (152-ФЗ).' },
  { key: 'marketing', title: 'Рассылки и напоминания', text: 'Напоминания о повторном визите и специальных предложениях студии.' },
  { key: 'analytics', title: 'Аналитика использования', text: 'Обезличенная статистика работы приложения внутри студии.' },
];

const keyFor = (profileId?: string | null) => `uo:consents:${profileId ?? 'anon'}`;
const sessionKeyFor = (profileId?: string | null) => `uo:consent-session:${profileId ?? 'anon'}`;

export function getConsent(profileId?: string | null): ConsentRecord | null {
  try {
    const raw = localStorage.getItem(keyFor(profileId));
    if (!raw) return null;
    const c = JSON.parse(raw) as ConsentRecord;
    return c.version >= CONSENT_VERSION && c.personal_data ? c : null;
  } catch {
    return null;
  }
}

export function saveConsent(profileId: string | null | undefined, c: Omit<ConsentRecord, 'version' | 'accepted_at' | 'docs_version'>): ConsentRecord {
  const rec: ConsentRecord = { ...c, version: CONSENT_VERSION, accepted_at: new Date().toISOString(), docs_version: DOCS_VERSION };
  try { localStorage.setItem(keyFor(profileId), JSON.stringify(rec)); } catch { /* ignore */ }
  return rec;
}

/** Has the dialog already been confirmed during this login? (cleared on sign-out / new tab) */
export function isConfirmedThisSession(profileId?: string | null): boolean {
  try { return sessionStorage.getItem(sessionKeyFor(profileId)) === '1'; } catch { return false; }
}
export function markConfirmedThisSession(profileId?: string | null) {
  try { sessionStorage.setItem(sessionKeyFor(profileId), '1'); } catch { /* ignore */ }
}
export function clearConfirmedSessions() {
  try {
    Object.keys(sessionStorage).filter((k) => k.startsWith('uo:consent-session:')).forEach((k) => sessionStorage.removeItem(k));
  } catch { /* ignore */ }
}
