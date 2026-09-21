/**
 * Initials avatar — a soft tinted tile with legible initials.
 * The tint is picked deterministically from the name so the same person always
 * gets the same colour; colours are defined in CSS (light + dark aware).
 */
const HUES = [212, 168, 28, 268, 342, 192, 98, 14];

function hueFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '·';
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

export function Avatar({
  name,
  size = 40,
  className = '',
}: {
  name?: string | null;
  size?: number;
  className?: string;
}) {
  const label = (name ?? '').trim();
  return (
    <span
      className={`uo-avatar ${className}`.trim()}
      style={{ ['--av-h' as string]: hueFor(label || '?'), width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.36)) }}
      aria-hidden
    >
      {initialsOf(label)}
    </span>
  );
}
