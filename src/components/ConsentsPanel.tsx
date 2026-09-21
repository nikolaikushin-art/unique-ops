import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { CONSENT_ITEMS, getConsent, saveConsent } from '../lib/consents';
import { buildConsentDocs, DOCS_DATE_LABEL, type ConsentKey } from '../lib/consentDocs';
import { ConsentDocView } from './ConsentDocView';

/** Settings → account: read the three documents again and change the optional consents. */
export function ConsentsPanel() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const initial = getConsent(profile?.id);
  const [marketing, setMarketing] = useState(!!initial?.marketing);
  const [analytics, setAnalytics] = useState(!!initial?.analytics);
  const [reading, setReading] = useState<ConsentKey | null>(null);
  const docs = useMemo(() => buildConsentDocs(), []);
  const save = () => {
    saveConsent(profile?.id, { personal_data: true, marketing, analytics });
    toast('Согласия сохранены');
  };
  const state: Record<string, [boolean, (v: boolean) => void]> = { marketing: [marketing, setMarketing], analytics: [analytics, setAnalytics] };
  return (
    <div className="section-block" style={{ marginTop: 24 }}>
      <div className="section-head"><div><div className="section-eyebrow">Конфиденциальность</div><div className="section-title">Согласия</div></div></div>
      {initial && <p className="page-sub" style={{ marginBottom: 12 }}>Подтверждены {new Date(initial.accepted_at).toLocaleString('ru-RU')} · редакция документов от {DOCS_DATE_LABEL}. Обработка персональных данных обязательна для работы.</p>}
      {CONSENT_ITEMS.map((it) => (
        <div className="integration-card" key={it.key}>
          <div>
            <div className="integration-name">{it.title}{it.required ? ' · обязательно' : ''}</div>
            <div className="integration-desc">{it.text}</div>
            <button type="button" className="consent-read" onClick={() => setReading(it.key)}>Читать документ →</button>
          </div>
          {!it.required && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={state[it.key][0]} onChange={(e) => state[it.key][1](e.target.checked)} />
            </label>
          )}
        </div>
      ))}
      <div className="tag add" style={{ display: 'inline-flex', cursor: 'pointer', marginTop: 12 }} onClick={save}>Сохранить</div>
      {reading && createPortal(
        <div className="consent-overlay" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && setReading(null)}>
          <div className="consent-card is-reading">
            <ConsentDocView doc={docs[reading]} onBack={() => setReading(null)} backLabel="Закрыть" />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
