import { useState } from 'react';
import type { ReactElement } from 'react';
import type { Insight, InsightTone } from '../../lib/diagnostics';

const ICONS: Record<InsightTone, ReactElement> = {
  critical: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9.5" /><path d="M12 7.5v5.5" /><circle cx="12" cy="16.6" r="0.6" fill="currentColor" />
    </svg>
  ),
  warning: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4" /><circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9.5" /><path d="M12 11v5.5" /><circle cx="12" cy="7.9" r="0.6" fill="currentColor" />
    </svg>
  ),
  positive: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9.5" /><path d="m7.8 12.3 2.9 2.9 5.6-6" />
    </svg>
  ),
};

interface InsightsProps {
  insights: Insight[];
  onAction?: (actionId: string) => void;
  /** Max rows shown before "Показать все". */
  limit?: number;
}

/** iOS-style diagnostic list: tinted icon tile, plain-language finding, optional action. */
export function Insights({ insights, onAction, limit = 5 }: InsightsProps) {
  const [all, setAll] = useState(false);
  const shown = all ? insights : insights.slice(0, limit);
  return (
    <div className="ch-insights">
      {shown.map((i) => (
        <div className={`ch-insight is-${i.tone}`} key={i.id}>
          <span className="ch-insight-icon">{ICONS[i.tone]}</span>
          <div className="ch-insight-body">
            <div className="ch-insight-title">{i.title}</div>
            <div className="ch-insight-detail">{i.detail}</div>
          </div>
          <div className="ch-insight-side">
            {i.metric && <b className="ch-insight-metric">{i.metric}</b>}
            {i.actionId && onAction && (
              <button type="button" className="ch-insight-action" onClick={() => onAction(i.actionId!)}>{i.actionLabel ?? 'Открыть'}</button>
            )}
          </div>
        </div>
      ))}
      {insights.length > limit && (
        <button type="button" className="ch-more" onClick={() => setAll((v) => !v)}>
          {all ? 'Свернуть' : `Показать все (${insights.length})`}
        </button>
      )}
    </div>
  );
}

/** Compact status summary for a section header: "2 критично · 1 внимание". */
export function InsightSummary({ insights }: { insights: Insight[] }) {
  const c = insights.filter((i) => i.tone === 'critical').length;
  const w = insights.filter((i) => i.tone === 'warning').length;
  const p = insights.filter((i) => i.tone === 'positive').length;
  return (
    <div className="ch-summary">
      {c > 0 && <span className="ch-badge is-red">{c} критично</span>}
      {w > 0 && <span className="ch-badge is-orange">{w} внимание</span>}
      {c === 0 && w === 0 && <span className="ch-badge is-green">{p > 0 ? 'Всё хорошо' : 'Без замечаний'}</span>}
    </div>
  );
}
