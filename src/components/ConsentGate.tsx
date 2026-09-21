import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  CONSENT_ITEMS, markConfirmedThisSession, saveConsent,
} from '../lib/consents';
import { buildConsentDocs, type ConsentKey } from '../lib/consentDocs';
import { ConsentDocView } from './ConsentDocView';
import { Logo } from './Logo';
import { useAuthDarkTheme } from '../pages/AuthPages';

/** Every login starts with all three boxes EMPTY — each consent must be opened, read and accepted by hand. */
const blank = (): Record<ConsentKey, boolean> => ({ personal_data: false, marketing: false, analytics: false });

/** Full-screen step that follows the login form (same dark look as the login page): three separate
 *  documents, each opened, read to the end and accepted. The dashboard is not rendered until this is done. */
export function ConsentScreen({ onDone }: { onDone: () => void }) {
  useAuthDarkTheme();
  const { profile } = useAuth();
  const [checked, setChecked] = useState<Record<ConsentKey, boolean>>(blank);
  const [reading, setReading] = useState<ConsentKey | null>(null);
  const [queue, setQueue] = useState<ConsentKey[]>([]);
  const docs = useMemo(() => buildConsentDocs(), []);

  useEffect(() => { window.scrollTo(0, 0); }, [reading]);

  if (!profile) return null;

  const allOn = checked.personal_data && checked.marketing && checked.analytics;
  const set = (k: ConsentKey, v: boolean) => setChecked((c) => ({ ...c, [k]: v }));

  const onRow = (k: ConsentKey) => {
    if (checked[k]) set(k, false);       // untick directly
    else { setQueue([]); setReading(k); } // ticking = open, read to the end and accept
  };
  const readAll = () => {
    const todo = CONSENT_ITEMS.map((i) => i.key).filter((k) => !checked[k]);
    if (!todo.length) return;
    setQueue(todo.slice(1)); setReading(todo[0]);
  };
  const acceptReading = () => {
    if (!reading) return;
    set(reading, true);
    if (queue.length) { setReading(queue[0]); setQueue(queue.slice(1)); } else setReading(null);
  };
  const declineReading = () => {
    if (!reading) return;
    if (queue.length) { setReading(queue[0]); setQueue(queue.slice(1)); } else setReading(null);
  };
  const finish = () => {
    if (!checked.personal_data) return;
    saveConsent(profile.id, checked);
    markConfirmedThisSession(profile.id);
    onDone();
  };

  const meta = reading ? CONSENT_ITEMS.find((i) => i.key === reading)! : null;
  const total = queue.length + 1;

  return (
    <div className="consent-page auth-page auth-page--dark" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <Logo height={44} className="consent-page-logo" />
      <div className={`consent-card${reading ? ' is-reading' : ''}`}>
        {reading && meta ? (
          <ConsentDocView
            doc={docs[reading]}
            onBack={() => { setReading(null); setQueue([]); }}
            backLabel="К списку"
            step={queue.length ? `Осталось документов: ${total}` : undefined}
            onAccept={acceptReading}
            acceptLabel={queue.length ? 'Принимаю и далее' : 'Принимаю'}
            onDecline={meta.required ? undefined : declineReading}
            declineLabel={queue.length ? 'Не принимаю, далее' : 'Не принимаю'}
          />
        ) : (
          <>
            <div className="consent-head"><div className="consent-title" id="consent-title">Согласия</div></div>
            <div className="consent-body">
              <p className="consent-lead">
                Три отдельных документа. Нажмите на пункт — откроется полный текст: прочитайте его до конца и нажмите «Принимаю».
                Обработка персональных данных обязательна, рассылки и аналитика — по вашему желанию.
              </p>
              {CONSENT_ITEMS.map((it) => (
                <div key={it.key} className={`consent-option${checked[it.key] ? ' is-on' : ''}`}>
                  <span
                    className="consent-box"
                    role="checkbox"
                    aria-checked={checked[it.key]}
                    aria-label={it.title}
                    tabIndex={0}
                    onClick={() => onRow(it.key)}
                    onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onRow(it.key); } }}
                  >
                    {checked[it.key] && (
                      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 8.5l3 3 6-7" /></svg>
                    )}
                  </span>
                  <span className="consent-text" onClick={() => onRow(it.key)}>
                    <span className="consent-name">
                      {it.title}
                    </span>
                    <span className="consent-desc">{it.text}</span>
                    <button type="button" className="consent-read" onClick={(e) => { e.stopPropagation(); setQueue([]); setReading(it.key); }}>
                      {checked[it.key] ? 'Перечитать документ' : 'Читать полностью'} →
                    </button>
                  </span>
                </div>
              ))}
              {!allOn && (
                <button type="button" className="consent-secondary consent-readall" onClick={readAll}>Прочитать и принять все три</button>
              )}
              <button type="button" className="consent-continue" disabled={!checked.personal_data} onClick={finish}>Продолжить</button>
              {!checked.personal_data && <div className="consent-hint">Чтобы продолжить, прочитайте и примите согласие на обработку персональных данных.</div>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
