import { useState } from 'react';
import { AssetManager } from './AssetManager';
import { FILE_CATEGORIES } from '../lib/r2Storage';
import type { Vehicle, Booking } from '../types/database';

interface VehicleMediaHistoryProps {
  vehicles: Vehicle[];
  bookings: Booking[];
}

export function VehicleMediaHistory({ vehicles, bookings }: VehicleMediaHistoryProps) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id ?? '');
  const [bookingId, setBookingId] = useState('');

  const vehicleBookings = bookings.filter((b) => b.vehicle_id === vehicleId);

  if (!vehicles.length) return null;

  return (
    <div style={{ marginTop: 20 }}>
      <div className="side-field-label">История автомобиля · медиа</div>
      <div className="field-row2" style={{ marginBottom: 10 }}>
        <select className="field-select" value={vehicleId} onChange={(e) => { setVehicleId(e.target.value); setBookingId(''); }}>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.brand} {v.model} · {v.registration_number || '—'}</option>
          ))}
        </select>
        <select className="field-select" value={bookingId} onChange={(e) => setBookingId(e.target.value)}>
          <option value="">Все заказы</option>
          {vehicleBookings.map((b) => (
            <option key={b.id} value={b.id}>{new Date(b.scheduled_at).toLocaleDateString('ru-RU')} · #{b.id.slice(0, 6)}</option>
          ))}
        </select>
      </div>
      {vehicleId && (
        <AssetManager
          entityType="vehicle"
          entityId={vehicleId}
          categories={FILE_CATEGORIES.vehicle.map((c) => ({ ...c }))}
          bookingId={bookingId || null}
          compact
          title="Фото и видео (R2)"
        />
      )}
    </div>
  );
}
