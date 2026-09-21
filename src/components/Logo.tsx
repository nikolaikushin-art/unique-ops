import { BRAND_LOGO_URL } from '../lib/cdn';

const LOGO_FALLBACK = '/assets/unique-detailing-logo.png';

export function Logo({ height = 30, className = '' }: { height?: number; className?: string }) {
  return (
    <img
      src={BRAND_LOGO_URL}
      alt="UNIQUE DETAILING"
      className={className}
      style={{ height, width: 'auto', display: 'block' }}
      loading="eager"
      decoding="async"
      onError={(e) => {
        const img = e.currentTarget;
        if (!img.dataset.fallback) {
          img.dataset.fallback = '1';
          img.src = LOGO_FALLBACK;
        }
      }}
    />
  );
}
