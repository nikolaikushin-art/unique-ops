import { useEffect, useState, type ReactNode } from 'react';
import { Maximize2, Minimize2, X } from 'lucide-react';

/**
 * Shared detail drawer — same behaviour as the Leads card:
 *  - the list stays full width until a record is opened;
 *  - the drawer opens on the right, with «expand to full screen» and «close»;
 *  - Esc closes it (or first collapses it if it is expanded).
 * Keeps the `.table-side` class so existing scroll / reveal logic still applies.
 */
export function SideDrawer({ onClose, className = '', children }: { onClose: () => void; className?: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (expanded) setExpanded(false); else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, onClose]);

  return (
    <div className={`table-side sd-drawer${expanded ? ' is-expanded' : ''} ${className}`.trim()} role="region" aria-label="Карточка записи">
      <div className="sd-controls">
        <button type="button" className="sd-btn sd-expand" onClick={() => setExpanded((v) => !v)} aria-label={expanded ? 'Свернуть' : 'Развернуть на весь экран'} title={expanded ? 'Свернуть' : 'Развернуть на весь экран'}>
          {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        <button type="button" className="sd-btn" onClick={onClose} aria-label="Закрыть" title="Закрыть"><X size={16} /></button>
      </div>
      {children}
    </div>
  );
}
