import type { Booking, Customer, Service, Staff, Vehicle } from '../types/database';
import { BOOKING_STATUS_CYCLE, JOB_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '../lib/constants';
import type { BookingFilterState } from '../lib/bookings';
import { applyBookingFiltersExtended } from '../lib/bookings';

interface ListFiltersProps {
  filters: BookingFilterState;
  onChange: (patch: Partial<BookingFilterState>) => void;
  services: Service[];
  staffList: Staff[];
  customers: Customer[];
  vehicles: Vehicle[];
  showSearch?: boolean;
}

export function ListFilters({
  filters,
  onChange,
  services,
  staffList,
  customers,
  vehicles,
  showSearch = true,
}: ListFiltersProps) {
  const set = (patch: Partial<BookingFilterState>) => onChange(patch);

  return (
    <div className="booking-filters">
      {showSearch && (
        <input
          className="field-input booking-search"
          type="search"
          placeholder="Поиск: клиент, авто, номер, услуга…"
          value={filters.search}
          onChange={(e) => set({ search: e.target.value })}
        />
      )}
      <div className="booking-filters-row">
        <input className="field-input" type="date" value={filters.dateFrom} onChange={(e) => set({ dateFrom: e.target.value })} aria-label="Дата от" />
        <input className="field-input" type="date" value={filters.dateTo} onChange={(e) => set({ dateTo: e.target.value })} aria-label="Дата до" />
        <select className="field-select" value={filters.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="all">Все статусы</option>
          {BOOKING_STATUS_CYCLE.map((s) => (
            <option key={s} value={s}>{JOB_STATUS_LABELS[s] || s}</option>
          ))}
        </select>
        <select className="field-select" value={filters.paymentStatus} onChange={(e) => set({ paymentStatus: e.target.value })}>
          <option value="">Оплата: все</option>
          {Object.entries(PAYMENT_STATUS_LABELS).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        <select className="field-select" value={filters.customerId} onChange={(e) => set({ customerId: e.target.value })}>
          <option value="">Все клиенты</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
        <select className="field-select" value={filters.vehicleId} onChange={(e) => set({ vehicleId: e.target.value })}>
          <option value="">Все авто</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>{v.brand} {v.model}{v.registration_number ? ` · ${v.registration_number}` : ''}</option>
          ))}
        </select>
        <input
          className="field-input"
          type="text"
          placeholder="Гос. номер"
          value={filters.plate}
          onChange={(e) => set({ plate: e.target.value })}
        />
        <select className="field-select" value={filters.serviceId} onChange={(e) => set({ serviceId: e.target.value })}>
          <option value="">Все услуги</option>
          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="field-select" value={filters.staffId} onChange={(e) => set({ staffId: e.target.value })}>
          <option value="">Все техники</option>
          {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
        </select>
      </div>
    </div>
  );
}

/** @deprecated use applyBookingFiltersExtended from lib/bookings */
export function applyBookingFilters(
  bookings: Booking[],
  { status, dateFrom, dateTo, serviceId, staffId }: { status: string; dateFrom: string; dateTo: string; serviceId: string; staffId: string }
): Booking[] {
  return applyBookingFiltersExtended(bookings, {
    status,
    dateFrom,
    dateTo,
    serviceId,
    staffId,
    customerId: '',
    vehicleId: '',
    plate: '',
    paymentStatus: '',
    search: '',
  });
}

export { applyBookingFiltersExtended };

export function defaultBookingFilters(): BookingFilterState {
  return {
    status: 'all',
    dateFrom: '',
    dateTo: '',
    serviceId: '',
    staffId: '',
    customerId: '',
    vehicleId: '',
    plate: '',
    paymentStatus: '',
    search: '',
  };
}
