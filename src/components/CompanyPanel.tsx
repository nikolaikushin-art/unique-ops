import { useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { DEFAULT_WARRANTY_TERMS, getCompany, saveCompany, type CompanyProfile } from '../lib/company';

const FIELDS: { key: keyof CompanyProfile; label: string; wide?: boolean; area?: boolean }[] = [
  { key: 'name', label: 'Название студии (в документах и сообщениях)' },
  { key: 'legal_name', label: 'Юридическое лицо / ИП' },
  { key: 'inn', label: 'ИНН' },
  { key: 'kpp', label: 'КПП' },
  { key: 'ogrn', label: 'ОГРН / ОГРНИП' },
  { key: 'director', label: 'Руководитель (для подписи)' },
  { key: 'address', label: 'Адрес студии', wide: true },
  { key: 'phone', label: 'Телефон' },
  { key: 'email', label: 'Email' },
  { key: 'site', label: 'Сайт' },
  { key: 'review_url', label: 'Ссылка для отзыва (Яндекс / 2ГИС)' },
  { key: 'bank_name', label: 'Банк' },
  { key: 'bik', label: 'БИК' },
  { key: 'account', label: 'Расчётный счёт' },
  { key: 'corr_account', label: 'Корр. счёт' },
  { key: 'invoice_note', label: 'Примечание в счёте', wide: true },
  { key: 'warranty_terms', label: 'Условия гарантии (в гарантийном талоне)', wide: true, area: true },
];

/** Studio requisites used by the printable documents and message templates. */
export function CompanyPanel() {
  const { toast } = useToast();
  const [c, setC] = useState<CompanyProfile>(() => getCompany());
  const set = (k: keyof CompanyProfile, v: string) => setC((p) => ({ ...p, [k]: v }));

  return (
    <div className="section-block" style={{ marginTop: 24 }}>
      <div className="section-head">
        <div>
          <div className="section-eyebrow">Документы</div>
          <div className="section-title">Реквизиты студии</div>
        </div>
      </div>
      <p className="page-sub" style={{ marginBottom: 16 }}>
        Попадают в печатные документы (счёт, акт, гарантийный талон, смета) и в сообщения клиентам.
      </p>
      <div className="settings-company-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
        {FIELDS.map((f) => (
          <div key={f.key} style={f.wide ? { gridColumn: '1 / -1' } : undefined}>
            <label className="field-label" htmlFor={`co-${f.key}`}>{f.label}</label>
            {f.area ? (
              <textarea id={`co-${f.key}`} className="field-input" rows={4} value={c[f.key]} onChange={(e) => set(f.key, e.target.value)} style={{ resize: 'vertical' }} />
            ) : (
              <input id={`co-${f.key}`} className="field-input" value={c[f.key]} onChange={(e) => set(f.key, e.target.value)} />
            )}
          </div>
        ))}
      </div>
      <div className="tag-row" style={{ marginTop: 16 }}>
        <div className="tag add" onClick={() => { saveCompany(c); toast('Реквизиты сохранены'); }}>Сохранить реквизиты</div>
        <div className="tag ghost" onClick={() => set('warranty_terms', DEFAULT_WARRANTY_TERMS)}>Вернуть стандартные условия гарантии</div>
      </div>
    </div>
  );
}
