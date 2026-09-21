import type { LucideIcon } from 'lucide-react';

interface Counter {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: 'brand' | 'info' | 'success' | 'warning';
}

/**
 * The "what's happening right now" strip — four numbers a receptionist or
 * technician actually glances at during the day, instead of scrolling past
 * revenue charts to find them. Renso-style metric card: label, short accent
 * underline, large tabular number. Apple-style tinted icon tile per counter.
 */
export function QuickCounters({ counters }: { counters: Counter[] }) {
  return (
    <div className="quick-counters">
      {counters.map(({ icon: Icon, label, value, tone }) => (
        <div className={`quick-counter kpi-card tone-${tone}`} key={label}>
          <span className="quick-counter-icon" aria-hidden>
            <Icon size={17} strokeWidth={2.1} />
          </span>
          <div className="quick-counter-body">
            <div className="stat-value">{value}</div>
            <div className="kpi-card-label">{label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
