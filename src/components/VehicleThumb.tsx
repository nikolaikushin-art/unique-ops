import { CarFront } from 'lucide-react';
import { useVehicleCover } from '../lib/vehicleCovers';

/**
 * Vehicle thumbnail.
 *  - shows the car's own cover photo (first photo attached to it) when it has one;
 *  - otherwise a calm monogram tile (brand initial) — never a stock image.
 */
const TINTS = [
  'linear-gradient(145deg,#3a3f47,#1b1e23)',
  'linear-gradient(145deg,#3b3a45,#1a191f)',
  'linear-gradient(145deg,#2f3f41,#161e20)',
  'linear-gradient(145deg,#45373a,#201819)',
  'linear-gradient(145deg,#39404f,#191d27)',
];

function tintFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

export function VehicleThumb({
  brand,
  plate,
  vehicleId,
  src,
  size = 'sm',
  className = '',
}: {
  brand?: string | null;
  plate?: string | null;
  /** Vehicle id — used to look up its cover photo. */
  vehicleId?: string | null;
  /** Explicit image (e.g. a not-yet-saved preview). Wins over the stored cover. */
  src?: string | null;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  const stored = useVehicleCover(vehicleId);
  const photo = src || stored;
  const name = (brand ?? '').trim();
  return (
    <span
      className={`vthumb vthumb--${size} ${photo ? 'has-photo' : 'is-monogram'} ${className}`.trim()}
      style={photo ? undefined : { background: tintFor(name.toLowerCase() || 'x') }}
      aria-hidden
    >
      {photo ? (
        <img src={photo} alt="" loading="lazy" decoding="async" draggable={false} />
      ) : (
        <span className="vthumb-fallback">
          {name ? <b>{name.slice(0, 1).toUpperCase()}</b> : <CarFront size={size === 'xs' ? 14 : 18} strokeWidth={1.6} />}
        </span>
      )}
      {plate && size === 'md' ? <span className="vthumb-plate">{plate}</span> : null}
    </span>
  );
}

/** Wide cover for detail panels. */
export function VehicleHero({
  vehicleId,
  brand,
  model,
  onChange,
}: {
  vehicleId?: string | null;
  brand?: string | null;
  model?: string | null;
  onChange?: () => void;
}) {
  const photo = useVehicleCover(vehicleId);
  const name = (brand ?? '').trim();
  return (
    <div className={`vhero ${photo ? 'has-photo' : 'is-monogram'}`} style={photo ? undefined : { background: tintFor(name.toLowerCase() || 'x') }}>
      {photo ? (
        <img src={photo} alt={`${brand ?? ''} ${model ?? ''}`.trim()} />
      ) : (
        <div className="vhero-empty">
          <b>{name ? name.slice(0, 1).toUpperCase() : <CarFront size={28} strokeWidth={1.5} />}</b>
          <span>Фото не добавлено</span>
        </div>
      )}
      {onChange && (
        <button type="button" className="vhero-btn" onClick={onChange}>
          {photo ? 'Сменить фото' : 'Добавить фото'}
        </button>
      )}
    </div>
  );
}
