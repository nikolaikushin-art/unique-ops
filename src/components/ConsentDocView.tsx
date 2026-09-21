import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, Check } from 'lucide-react';
import { DOCS_DATE_LABEL, docToText, type ConsentDoc } from '../lib/consentDocs';

interface Props {
  doc: ConsentDoc;
  onBack: () => void;
  backLabel?: string;
  /** When set, the document must be scrolled to the end before the accept button unlocks. */
  onAccept?: () => void;
  acceptLabel?: string;
  onDecline?: () => void;
  declineLabel?: string;
  step?: string; // e.g. "1 из 3"
}

/** Scrollable, readable legal text with a progress bar. Used after login and from Settings → Согласия. */
export function ConsentDocView({ doc, onBack, backLabel = 'Назад', onAccept, acceptLabel = 'Принимаю', onDecline, declineLabel, step }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [reachedEnd, setReachedEnd] = useState(false);

  const measure = () => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    if (max <= 4) { setProgress(100); setReachedEnd(true); return; }
    const pct = Math.min(100, Math.round((el.scrollTop / max) * 100));
    setProgress(pct);
    if (el.scrollTop >= max - 8) setReachedEnd(true);
  };

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
    setReachedEnd(false); setProgress(0);
    const t = setTimeout(measure, 50);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  }, [doc.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const download = () => {
    const blob = new Blob([docToText(doc)], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${doc.title}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const locked = !!onAccept && !reachedEnd;

  return (
    <div className="consent-reader">
      <div className="consent-reader-top">
        <button type="button" className="consent-back" onClick={onBack}><ArrowLeft size={16} strokeWidth={2} /> {backLabel}</button>
        {step && <span className="consent-step">{step}</span>}
        <button type="button" className="consent-dl" onClick={download} title="Скачать текст"><Download size={15} strokeWidth={2} /></button>
      </div>
      <div className="consent-progress" aria-hidden><div style={{ width: `${progress}%` }} /></div>
      <div className="consent-doc" ref={ref} onScroll={measure} tabIndex={0}>
        <h2 className="consent-doc-title">{doc.title}</h2>
        <div className="consent-doc-meta">Редакция от {DOCS_DATE_LABEL} · {doc.law}</div>
        {doc.sections.map((s) => (
          <section key={s.h}>
            <h3>{s.h}</h3>
            {s.p?.map((t, i) => <p key={i}>{t}</p>)}
            {s.ul && <ul>{s.ul.map((t, i) => <li key={i}>{t}</li>)}</ul>}
          </section>
        ))}
        <div className="consent-doc-end">— Конец документа —</div>
      </div>
      {onAccept && (
        <div className="consent-reader-foot">
          {locked && <div className="consent-hint">Прокрутите текст до конца — {progress}%</div>}
          <div className="consent-reader-actions">
            {onDecline && <button type="button" className="consent-secondary" onClick={onDecline}>{declineLabel ?? 'Не принимаю'}</button>}
            <button type="button" className="consent-continue" disabled={locked} onClick={onAccept}>
              <Check size={16} strokeWidth={2.4} style={{ marginRight: 6, verticalAlign: -3 }} />{acceptLabel}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
