import { useCallback, useEffect, useState } from 'react';
import { listAssets, publicR2Url, openR2File, type AssetRecord } from '../../lib/r2Storage';
import { NavIconFile } from '../NavIcons';

interface InspectionQcCompareProps {
  vehicleId: string;
  bookingId?: string | null;
}

export function InspectionQcCompare({ vehicleId, bookingId }: InspectionQcCompareProps) {
  const [before, setBefore] = useState<AssetRecord[]>([]);
  const [after, setAfter] = useState<AssetRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!vehicleId) return;
    setLoading(true);
    try {
      const all = await listAssets('vehicle', vehicleId);
      const matchBooking = (a: AssetRecord) => !bookingId || a.booking_id === bookingId || !a.booking_id;
      setBefore(all.filter((a) => a.category === 'before_photo' && matchBooking(a)));
      setAfter(all.filter((a) => a.category === 'after_photo' && matchBooking(a)));
    } catch {
      setBefore([]);
      setAfter([]);
    }
    setLoading(false);
  }, [vehicleId, bookingId]);

  useEffect(() => { load(); }, [load]);

  const renderGrid = (items: AssetRecord[], label: string) => (
    <div className="qc-compare-col">
      <div className="side-field-label">{label} ({items.length})</div>
      {items.length ? (
        <div className="asset-list asset-list--grid">
          {items.map((a) => {
            const key = a.r2_key || a.bucket_path;
            const thumb = key && (a.file_type ?? '').startsWith('image/') ? publicR2Url(key) : null;
            return (
              <button key={a.id} type="button" className="asset-thumb" onClick={() => key && openR2File(key, a.is_sensitive)}>
                {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span className="asset-icon"><NavIconFile size={20} /></span>}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="empty-state" style={{ padding: 12 }}>Нет файлов</div>
      )}
    </div>
  );

  if (loading) return <div className="empty-state">Загрузка QC…</div>;

  return (
    <div className="qc-compare">
      <div className="qc-compare-grid">
        {renderGrid(before, 'До работ')}
        {renderGrid(after, 'После работ')}
      </div>
    </div>
  );
}
