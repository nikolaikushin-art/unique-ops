import type { LucideIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { fmtPct } from '../../lib/analytics';
import { fmt as fmtMoney } from '../../lib/constants';
import { MetricTile } from '../charts/MetricTile';
import { fmtDelta } from '../charts/format';
import { TINT } from '../charts/palette';

export type KpiTone = 'brand' | 'info' | 'success' | 'warning' | 'gray';

const TONE_COLOR: Record<KpiTone, string> = {
  brand: TINT.blue,
  info: TINT.teal,
  success: TINT.green,
  warning: TINT.orange,
  gray: TINT.gray,
};

function fmtNumber(n: number): string {
  return n.toLocaleString('ru-RU');
}

/** "+12.3%" / "−4%" style strings become a delta chip; longer sentences stay a plain note. */
const PERCENT_LIKE = /^[+\-−]?\s?\d+([.,]\d+)?%(\s+vs\b.*)?$/;

interface KpiCardProps {
  label: string;
  value: string | number;
  format?: 'money' | 'number';
  delta?: string;
  deltaUp?: boolean;
  note?: string;
  onClick?: () => void;
  /** Optional trend line under the number. */
  spark?: number[];
  /** @deprecated kept so existing call sites keep compiling. */
  icon?: LucideIcon;
  tone?: KpiTone;
  valueStyle?: CSSProperties;
}

/**
 * App-wide metric tile (iOS style). Every page that used the old flat KPI
 * card now renders the shared chart-kit tile: label, big tabular number,
 * delta chip and an optional sparkline.
 */
export function KpiCard({ label, value, format = 'number', delta, deltaUp, note, onClick, spark, tone = 'info' }: KpiCardProps) {
  const display =
    typeof value === 'number'
      ? format === 'money'
        ? fmtMoney(value)
        : fmtNumber(value)
      : value;

  const chip = delta !== undefined && PERCENT_LIKE.test(delta.trim());
  const chipTone: 'up' | 'down' | 'flat' = deltaUp === false ? 'down' : delta && /^[-−]/.test(delta.trim()) ? 'down' : delta && delta.trim().startsWith('+') ? 'up' : deltaUp ? 'up' : 'flat';
  const sentence = !chip && delta !== undefined ? delta : undefined;

  return (
    <MetricTile
      label={label}
      value={display}
      delta={chip ? delta : undefined}
      deltaTone={chipTone}
      note={
        sentence || note ? (
          <>
            {sentence && <span style={{ color: deltaUp === false ? 'var(--c-red)' : 'var(--c-green)', fontWeight: 600 }}>{sentence}</span>}
            {sentence && note && <br />}
            {note}
          </>
        ) : undefined
      }
      spark={spark}
      color={TONE_COLOR[tone]}
      onClick={onClick}
    />
  );
}

interface KpiComparisonProps {
  label: string;
  current: number;
  previous: number;
  changePct: number | null;
  format?: 'money' | 'number';
  spark?: number[];
  /** @deprecated kept so existing call sites keep compiling. */
  icon?: LucideIcon;
  tone?: KpiTone;
}

export function KpiComparison({ label, current, previous, changePct, format = 'money', spark, tone = 'brand' }: KpiComparisonProps) {
  const fmtVal = (n: number) => (format === 'money' ? fmtMoney(n) : fmtNumber(n));
  return (
    <MetricTile
      label={label}
      value={fmtVal(current)}
      delta={fmtDelta(changePct)}
      deltaTone={changePct === null || changePct === 0 ? 'flat' : changePct > 0 ? 'up' : 'down'}
      note={`было ${fmtVal(previous)}`}
      spark={spark}
      color={TONE_COLOR[tone]}
    />
  );
}

export { fmtPct };
