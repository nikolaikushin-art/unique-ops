import type { ReactNode } from 'react';

/**
 * iOS-style source badge: a small squircle tile with a white SF-Symbols-like
 * glyph. Colour is kept subtle (soft gradient) so the list stays calm.
 */
const G = { fill: 'none', stroke: '#fff', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const GLYPH: Record<string, { bg: string; node: ReactNode }> = {
  // Safari-style compass / globe
  website: {
    bg: 'linear-gradient(160deg,#5AC8FA,#0A84FF)',
    node: (<g {...G}><circle cx="12" cy="12" r="8.2" /><path d="M3.8 12h16.4" /><path d="M12 3.8c2.3 2.3 3.4 5 3.4 8.2s-1.1 5.9-3.4 8.2c-2.3-2.3-3.4-5-3.4-8.2s1.1-5.9 3.4-8.2z" /></g>),
  },
  // camera
  instagram: {
    bg: 'linear-gradient(160deg,#FF9F0A,#FF375F 55%,#BF5AF2)',
    node: (<g {...G}><rect x="4" y="4" width="16" height="16" rx="4.6" /><circle cx="12" cy="12" r="3.7" /><circle cx="16.9" cy="7.1" r=".6" fill="#fff" /></g>),
  },
  // message bubble
  whatsapp: {
    bg: 'linear-gradient(160deg,#5BE37D,#25B84A)',
    node: <path fill="#fff" d="M12 3.4c-4.7 0-8.5 3.3-8.5 7.4 0 2.1 1 4 2.6 5.3-.1 1-.6 2.2-1.6 3.3 1.9-.1 3.4-.8 4.5-1.6.9.3 1.9.4 3 .4 4.7 0 8.5-3.3 8.5-7.4S16.7 3.4 12 3.4z" />,
  },
  // phone handset
  phone: {
    bg: 'linear-gradient(160deg,#4CD964,#28A745)',
    node: <path fill="#fff" d="M20.6 16.9v2.6a1.7 1.7 0 0 1-1.9 1.7 16.9 16.9 0 0 1-7.4-2.6 16.6 16.6 0 0 1-5.1-5.1A16.9 16.9 0 0 1 3.6 6a1.7 1.7 0 0 1 1.7-1.9h2.6a1.7 1.7 0 0 1 1.7 1.5c.1.8.3 1.6.6 2.4a1.7 1.7 0 0 1-.4 1.8l-1.1 1.1a13.6 13.6 0 0 0 5.1 5.1l1.1-1.1a1.7 1.7 0 0 1 1.8-.4c.8.3 1.6.5 2.4.6a1.7 1.7 0 0 1 1.5 1.7z" />,
  },
  // two people
  referral: {
    bg: 'linear-gradient(160deg,#FFB340,#FF9500)',
    node: (<g fill="#fff"><circle cx="9.2" cy="8.4" r="3.1" /><path d="M3.2 18.6c0-3.1 2.6-5 6-5s6 1.9 6 5c0 .5-.3.8-.8.8H4c-.5 0-.8-.3-.8-.8z" /><circle cx="16.6" cy="9" r="2.5" opacity=".85" /><path d="M16.6 13.9c2.6 0 4.8 1.5 4.8 4.2 0 .5-.3.8-.8.8h-3.4c.1-1.8-.5-3.5-1.7-4.6.3-.3.7-.4 1.1-.4z" opacity=".85" /></g>),
  },
};

export function SourceIcon({ source }: { source: string }) {
  const g = GLYPH[source] ?? GLYPH.website;
  return (
    <span className="ld-src-tile" style={{ background: g.bg }} aria-hidden>
      <svg viewBox="0 0 24 24" width="13" height="13">{g.node}</svg>
    </span>
  );
}
