/** iOS system tints — CSS variables are defined in dashboards.css (light + dark). */
export const TINT = {
  blue: 'var(--c-blue)',
  green: 'var(--c-green)',
  orange: 'var(--c-orange)',
  red: 'var(--c-red)',
  purple: 'var(--c-purple)',
  teal: 'var(--c-teal)',
  pink: 'var(--c-pink)',
  yellow: 'var(--c-yellow)',
  gray: 'var(--c-gray)',
} as const;

/** Ordered list for categorical charts (donut / storage bar). */
export const CATEGORICAL = [TINT.blue, TINT.green, TINT.orange, TINT.purple, TINT.teal, TINT.pink, TINT.yellow, TINT.gray];

export const colorAt = (i: number) => CATEGORICAL[i % CATEGORICAL.length];
