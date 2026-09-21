import { useState, useCallback, useMemo, useEffect, lazy, Suspense } from 'react';
import { useDataRefresh } from './contexts/DataRefreshContext';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Modal, Field, SelectField } from './components/Modal';
import { AssetManager } from './components/AssetManager';
import { AttachmentQuickModal } from './components/AttachmentQuickModal';
import { FILE_CATEGORIES, buildR2Key, uploadToR2, saveAssetMetadata } from './lib/r2Storage';
import { VehiclePhotoPicker, type StagedPhoto } from './components/VehiclePhotoPicker';
import { refreshVehicleCovers } from './lib/vehicleCovers';
import { ProtectedRoute, ViewRoute } from './components/ProtectedRoute';
import { useToast } from './contexts/ToastContext';
import { db } from './lib/localdb';
import { PIPELINE_STAGES, CAL_BAYS, BOOKING_STATUS_LABELS, BOOKING_PRIORITY_LABELS, BOOKING_SELECT, LEAD_STATUS_LABELS, LEAD_LOST_REASONS } from './lib/constants';
import { detectBookingConflicts } from './lib/bookings';
import { useAuth } from './contexts/AuthContext';
import { LEAD_SERVICE_INTERESTS } from './lib/leads';
import { canManageCustomers, canManageBookings, canManageFinance, canManageLeads, canManageInventory, canManageStaff, canManageServices } from './lib/permissions';
import { DETAILING_CATEGORIES, CATEGORY_IDS } from './lib/inventory';
import { SERVICE_CATEGORIES, CATEGORY_IDS as SVC_CATEGORY_IDS, DEFAULT_VEHICLE_PRICING, normalizeServiceCategory } from './lib/services';
import { syncVehicleFromBookingStatus } from './lib/workflow';
import { CAR_MAKES, CAR_MODELS_BY_MAKE } from './lib/carCatalog';
import { VEHICLE_COLORS, INVENTORY_UNITS, EQUIPMENT_CONDITIONS, HAZARD_CLASSES, EMPLOYMENT_TYPES, STAFF_SPECIALIZATIONS } from './lib/formCatalog';
import { invoiceCustomerEmail, sendInvoiceToCustomer } from './lib/invoices';
import { LoginPage } from './pages/AuthPages';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { MfaChallengePage } from './pages/MfaChallengePage';
import { VerifyAccountPage } from './pages/VerifyAccountPage';
import { SetPasswordPage } from './pages/SetPasswordPage';
import { PayPage } from './pages/PayPage';
import { bookingValue, bookingBaseValue, bookingExtrasTotal } from './lib/metrics';
import { nextInvoiceNumber } from './lib/ledger';
import type { Customer, Vehicle, Service, Booking, BookingItem, Staff, Invoice, Lead, InventoryItem, Profile } from './types/database';

const CUSTOMER_SOURCES = [
  { value: '', label: '—' }, { value: 'instagram', label: 'Instagram' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'website', label: 'Сайт' },
  { value: 'phone', label: 'Телефон' }, { value: 'referral', label: 'Рекомендация' }, { value: 'repeat', label: 'Повторный клиент' }, { value: 'other', label: 'Другое' },
];
const CUSTOMER_CHANNELS = [
  { value: '', label: '—' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'telegram', label: 'Telegram' }, { value: 'phone', label: 'Звонок' }, { value: 'email', label: 'Email' },
];
const parseItems = (raw: string | undefined): BookingItem[] => { try { const v = raw ? JSON.parse(raw) : []; return Array.isArray(v) ? v : []; } catch { return []; } };

/** New invoices default to a 14-day payment term instead of asking someone
 *  to type a due date from scratch every time. Editing an invoice that
 *  already has a due date (or already had one and it was cleared) is left
 *  alone — this only fills the field when it's genuinely empty on a new
 *  invoice, never silently overwrites something already saved. */
function defaultInvoiceDueDate(existing: Invoice | null): string {
  if (existing) return '';
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}


const OverviewPage = lazy(() => import('./pages/OverviewPage').then((m) => ({ default: m.OverviewPage })));
const OperationsPage = lazy(() => import('./pages/OperationsPage').then((m) => ({ default: m.OperationsPage })));
const PipelinePage = lazy(() => import('./pages/PipelinePage').then((m) => ({ default: m.PipelinePage })));
const InspectionPage = lazy(() => import('./pages/InspectionPage').then((m) => ({ default: m.InspectionPage })));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage })));
const VehiclesPage = lazy(() => import('./pages/VehiclesPage').then((m) => ({ default: m.VehiclesPage })));
const CustomersPage = lazy(() => import('./pages/CustomersPage').then((m) => ({ default: m.CustomersPage })));
const StaffPage = lazy(() => import('./pages/StaffPage').then((m) => ({ default: m.StaffPage })));
const ServicesPage = lazy(() => import('./pages/ServicesPage').then((m) => ({ default: m.ServicesPage })));
const FinancePage = lazy(() => import('./pages/FinancePage').then((m) => ({ default: m.FinancePage })));
const MailboxPage = lazy(() => import('./pages/MailboxPage').then((m) => ({ default: m.MailboxPage })));
const LeadsPage = lazy(() => import('./pages/LeadsPage').then((m) => ({ default: m.LeadsPage })));
const InventoryPage = lazy(() => import('./pages/InventoryPage').then((m) => ({ default: m.InventoryPage })));
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((m) => ({ default: m.ReportsPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

function PageLoader() {
  return <div className="empty-state" style={{ padding: '48px 24px' }}>Загрузка…</div>;
}

type ModalType = 'customer' | 'vehicle' | 'service' | 'booking' | 'staff' | 'invoice' | 'lead' | 'inventory' | null;

function savedEntityId(editing: unknown): string | undefined {
  return (editing as { id?: string } | null)?.id;
}

function AppContent() {
  const { toast } = useToast();
  const { profile } = useAuth();
  const { refresh } = useDataRefresh();
  const location = useLocation();
  const navigate = useNavigate();
  const [modal, setModal] = useState<ModalType>(null);
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [sendingInvoice, setSendingInvoice] = useState(false);
  const [editing, setEditing] = useState<unknown>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [stagedPhotos, setStagedPhotos] = useState<StagedPhoto[]>([]);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [allBookings, setAllBookings] = useState<Booking[]>([]);
  const [suppliersList, setSuppliersList] = useState<{ id: string; name: string }[]>([]);

  const loadRefs = useCallback(async () => {
    const [c, v, s, st, p, bk, sup] = await Promise.all([
      db.from('customers').select('*').order('full_name'),
      db.from('vehicles').select('*, customers(*)'),
      db.from('services').select('*').eq('is_active', true),
      db.from('staff').select('*').eq('is_active', true),
      db.from('profiles').select('*').neq('role', 'customer').order('full_name'),
      db.from('bookings').select(BOOKING_SELECT),
      db.from('suppliers').select('id, name').order('name'),
    ]);
    setCustomers((c.data as Customer[]) ?? []);
    setVehicles((v.data as Vehicle[]) ?? []);
    setServices((s.data as Service[]) ?? []);
    setStaffList((st.data as Staff[]) ?? []);
    setProfiles((p.data as Profile[]) ?? []);
    setAllBookings((bk.data as Booking[]) ?? []);
    setSuppliersList((sup.data as { id: string; name: string }[]) ?? []);
  }, []);

  const openModal = async (type: ModalType, existing: unknown = null, prefill?: Record<string, string>) => {
    await loadRefs();
    clearStaged();
    setModal(type);
    setEditing(existing);

    if (type === 'customer') {
      const e = existing as Customer | null;
      setForm({ name: e?.full_name ?? '', phone: e?.phone ?? '', email: e?.email ?? '', address: e?.address ?? '', notes: e?.notes ?? '', status: e?.status ?? 'active', source: e?.source ?? '', preferred_channel: e?.preferred_channel ?? '', birthday: e?.birthday ?? '', tags: (e?.tags ?? []).join(', '), referred_by: e?.referred_by ?? '' });
    } else if (type === 'vehicle') {
      const e = existing as Vehicle | null;
      setForm({ brand: e?.brand ?? '', model: e?.model ?? '', plate: e?.registration_number ?? '', color: e?.color ?? '', year: String(e?.year ?? new Date().getFullYear()), customer_id: e?.customer_id ?? '', stage: e?.pipeline_stage ?? PIPELINE_STAGES[0], notes: e?.maintenance_notes ?? '', vin: e?.vin ?? '', mileage: e?.mileage != null ? String(e.mileage) : '', paint_code: e?.paint_code ?? '', coating_history: e?.coating_history ?? '' });
    } else if (type === 'service') {
      const e = existing as Service | null;
      setForm({
        name: e?.name ?? '',
        category: normalizeServiceCategory(e?.category) || 'wash',
        subcategory: e?.subcategory ?? '',
        difficulty: e?.difficulty_level ?? 'medium',
        duration: String(e?.duration_minutes ?? 60),
        price: String(e?.base_price ?? e?.price ?? 0),
        min_price: String(e?.min_price ?? ''),
        max_price: String(e?.max_price ?? ''),
        labour_hours: String(e?.labour_hours ?? ''),
        warranty_months: e?.warranty_months != null ? String(e.warranty_months) : '',
        maintenance_interval_months: e?.maintenance_interval_months != null ? String(e.maintenance_interval_months) : '',
        description: e?.description ?? '',
        tech_role: e?.required_technician_role ?? '',
        equipment: e?.required_equipment ?? '',
        materials: JSON.stringify(e?.materials ?? []),
        skills: (e?.required_skills ?? []).join(', '),
        customer_instructions: e?.customer_instructions ?? '',
        vehicle_pricing: JSON.stringify(e?.vehicle_pricing ?? DEFAULT_VEHICLE_PRICING),
      });
    } else if (type === 'booking') {
      const e = existing as Booking | null;
      const dt = e?.scheduled_at ? new Date(e.scheduled_at) : new Date();
      setForm({
        date: dt.toISOString().slice(0, 10),
        time: dt.toTimeString().slice(0, 5),
        customer_id: e?.customer_id ?? '',
        vehicle_id: e?.vehicle_id ?? '',
        service_id: e?.service_id ?? '',
        staff_id: e?.assigned_technician_id ?? '',
        bay: e?.bay ?? 'Бокс 1',
        status: e?.status ?? 'new_enquiry',
        payment_status: e?.payment_status ?? 'unpaid',
        priority: e?.priority ?? 'normal',
        estimated_value: e?.estimated_value != null ? String(e.estimated_value) : '',
        internal_notes: e?.internal_notes ?? '',
        notes: e?.notes ?? '',
        eta_date: e?.eta_at ? e.eta_at.slice(0, 10) : '',
        eta_time: e?.eta_at ? new Date(e.eta_at).toTimeString().slice(0, 5) : '',
        extras: JSON.stringify(e?.extra_items ?? []),
        discount: e?.discount != null ? String(e.discount) : '',
        deposit: e?.deposit != null ? String(e.deposit) : '',
        pickup_date: e?.pickup_at ? e.pickup_at.slice(0, 10) : '',
        items_left: e?.items_left ?? '',
      });
    } else if (type === 'staff') {
      const e = existing as Staff | null;
      setForm({
        name: e?.full_name ?? '',
        role: e?.role ?? 'Технический специалист',
        pct: String(e?.workload_pct ?? 0),
        experience: String(e?.experience_years ?? 0),
        profile_id: e?.profile_id ?? '',
        employee_id: e?.employee_id ?? '',
        date_of_birth: e?.date_of_birth ?? '',
        phone: e?.phone ?? '',
        email: e?.email ?? '',
        address: e?.address ?? '',
        emergency_contact: e?.emergency_contact ?? '',
        nationality: e?.nationality ?? '',
        employment_status: e?.employment_status ?? 'active',
        department: e?.department ?? '',
        start_date: e?.start_date ?? '',
        employment_type: e?.employment_type ?? '',
        salary: e?.salary != null ? String(e.salary) : '',
        reporting_manager_id: e?.reporting_manager_id ?? '',
        working_location: e?.working_location ?? '',
        internal_notes: e?.internal_notes ?? '',
        availability_status: e?.availability_status ?? 'available',
        commission_pct: e?.commission_pct != null ? String(e.commission_pct) : '',
      });
    } else if (type === 'invoice') {
      const e = existing as Invoice | null;
      setForm({ customer_id: e?.customer_id ?? '', desc: e?.description ?? '', amount: String(e?.amount ?? 0), status: e?.status ?? 'pending', due_date: e?.due_date ?? defaultInvoiceDueDate(e), order_id: e?.order_id ?? '', booking_id: e?.booking_id ?? '' });
    } else if (type === 'lead') {
      const e = existing as Lead | null;
      setForm({
        name: e?.full_name ?? '', surname: e?.last_name ?? '', phone: e?.phone ?? '', email: e?.email ?? '',
        car_brand: e?.car_brand ?? '', car_model: e?.car_model ?? '', source: e?.source ?? 'website', status: e?.status ?? 'new',
        notes: e?.notes ?? '', owner_id: e?.owner_id ?? '', tags: (e?.tags ?? []).join(', '),
        next_action_at: e?.next_action_at ? e.next_action_at.slice(0, 10) : '', next_action_note: e?.next_action_note ?? '',
        lost_reason: e?.lost_reason ?? '',
        est_value: e?.est_value ? String(e.est_value) : '', service_interest: e?.service_interest ?? '',
      });
    } else if (type === 'inventory') {
      const e = existing as InventoryItem | null;
      setForm({
        name: e?.name ?? '',
        type: e?.type ?? 'material',
        supplier: e?.supplier ?? '',
        stock: String(e?.stock_level ?? 0),
        min: String(e?.min_stock_level ?? 0),
        unit: e?.unit ?? 'шт',
        description: e?.description ?? '',
        category: e?.category ?? '',
        subcategory: e?.subcategory ?? '',
        brand: e?.brand ?? '',
        sku: e?.sku ?? '',
        barcode: e?.barcode ?? '',
        unit_cost: String(e?.unit_cost ?? 0),
        selling_price: String(e?.selling_price ?? 0),
        storage_location: e?.storage_location ?? '',
        batch_number: e?.batch_number ?? '',
        expiry_date: e?.expiry_date ?? '',
        application_purpose: e?.application_purpose ?? '',
        usage_instructions: e?.usage_instructions ?? '',
        safety_info: e?.safety_info ?? '',
        film_thickness: e?.film_thickness ?? '',
        roll_length: e?.roll_length != null ? String(e.roll_length) : '',
        roll_width: e?.roll_width != null ? String(e.roll_width) : '',
        equipment_id: e?.equipment_id ?? '',
        purchase_date: e?.purchase_date ?? '',
        warranty_until: e?.warranty_until ?? '',
        maintenance_due: e?.maintenance_due ?? '',
        assigned_staff_id: e?.assigned_staff_id ?? '',
        condition: e?.condition ?? '',
        hazard_class: e?.hazard_class ?? '',
        storage_requirements: e?.storage_requirements ?? '',
        is_active: e?.is_active !== false ? 'true' : 'false',
      });
    }

    if (prefill) {
      setForm((f) => ({ ...f, ...prefill }));
    }
  };

  const clearStaged = () => setStagedPhotos((list) => { list.forEach((p) => URL.revokeObjectURL(p.url)); return []; });
  const closeModal = () => { setModal(null); setEditing(null); setSendingInvoice(false); clearStaged(); };
  const addStaged = (files: File[]) => setStagedPhotos((list) => [
    ...list,
    ...files.map((file) => ({ id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`, file, url: URL.createObjectURL(file) })),
  ]);
  const removeStaged = (id: string) => setStagedPhotos((list) => {
    const gone = list.find((p) => p.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    return list.filter((p) => p.id !== id);
  });
  const makeStagedCover = (id: string) => setStagedPhotos((list) => {
    const pick = list.find((p) => p.id === id);
    return pick ? [pick, ...list.filter((p) => p.id !== id)] : list;
  });

  useEffect(() => {
    const state = location.state as {
      openModal?: ModalType;
      customerId?: string;
      editCustomerId?: string;
    } | null;
    if (!state?.openModal && !state?.editCustomerId) return;

    const run = async () => {
      if (state.openModal === 'booking' && state.customerId) {
        await openModal('booking', null, { customer_id: state.customerId });
      } else if (state.openModal === 'invoice' && state.customerId) {
        await openModal('invoice', null, { customer_id: state.customerId });
      } else if (state.editCustomerId) {
        const { data } = await db.from('customers').select('*').eq('id', state.editCustomerId).maybeSingle();
        if (data) await openModal('customer', data as Customer);
      }
      navigate(location.pathname, { replace: true, state: null });
    };

    void run();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- handle deep-link modal open once per navigation
  }, [location.pathname, location.state]);

  const sendInvoiceFromModal = async () => {
    const inv = editing as Invoice | null;
    if (!inv?.id || sendingInvoice) return;
    const customer = customers.find((c) => c.id === (form.customer_id || inv.customer_id));
    const email = customer?.email?.trim() || invoiceCustomerEmail(inv);
    if (!email) {
      toast('У клиента не указан email');
      return;
    }
    setSendingInvoice(true);
    try {
      const result = await sendInvoiceToCustomer(inv.id);
      if (!result.ok) {
        toast('Ошибка: ' + (result.error || 'Не удалось отправить'));
        return;
      }
      toast(result.message || `Счёт отправлен на ${email}`);
      refresh();
    } catch (e) {
      toast('Ошибка: ' + (e as Error).message);
    } finally {
      setSendingInvoice(false);
    }
  };

  const saveModal = async () => {
    const e = editing;
    let err: string | null = null;
    const role = profile?.role;

    const deny = (msg: string) => { toast(msg); return true; };
    if (modal === 'customer' && !canManageCustomers(role)) return deny('Недостаточно прав для управления клиентами');
    if (modal === 'vehicle' && !canManageCustomers(role)) return deny('Недостаточно прав');
    if (modal === 'booking' && !canManageBookings(role)) return deny('Недостаточно прав для управления бронями');
    if (modal === 'service' && !canManageServices(role)) return deny('Только администратор может управлять услугами');
    if (modal === 'staff' && !canManageStaff(role)) return deny('Только администратор может управлять персоналом');
    if (modal === 'invoice' && !canManageFinance(role)) return deny('Недостаточно прав для финансов');
    if (modal === 'lead' && !canManageLeads(role)) return deny('Недостаточно прав для лидов');
    if (modal === 'inventory' && !canManageInventory(role)) return deny('Только администратор может управлять складом');

    if (modal === 'customer') {
      if (!form.name) { toast('Укажите имя клиента'); return; }
      const row = { full_name: form.name, phone: form.phone, email: form.email, address: form.address, notes: form.notes, status: form.status, source: form.source || null, preferred_channel: form.preferred_channel || null, birthday: form.birthday || null, tags: form.tags ? form.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [], referred_by: form.referred_by || null };
      if (e) {
        const res = await db.from('customers').update(row).eq('id', (e as Customer).id);
        err = res.error?.message ?? null;
        if (!err) toast('Клиент обновлён');
      } else {
        const res = await db.from('customers').insert(row).select('*').single();
        err = res.error?.message ?? null;
        if (!err && res.data) {
          setEditing(res.data);
          toast('Клиент добавлен — можно прикрепить документы');
          refresh();
          return;
        }
        if (!err) toast('Клиент добавлен');
      }
    } else if (modal === 'vehicle') {
      if (!form.brand || !form.model || !form.customer_id) {
        toast('Укажите марку, модель и клиента');
        return;
      }
      const base = { brand: form.brand, model: form.model, registration_number: form.plate, color: form.color, year: +form.year, customer_id: form.customer_id, pipeline_stage: form.stage, maintenance_notes: form.notes, vin: form.vin || null, mileage: form.mileage ? +form.mileage : null, paint_code: form.paint_code || null, coating_history: form.coating_history || null };
      if (e) {
        const res = await db.from('vehicles').update(base).eq('id', (e as Vehicle).id);
        err = res.error?.message ?? null;
        if (!err) toast('Автомобиль обновлён');
      } else {
        const res = await db.from('vehicles').insert({ ...base, intake_at: new Date().toISOString() }).select('*').single();
        err = res.error?.message ?? null;
        if (!err && res.data) {
          // Upload the photos chosen in the form, in order — the first one is the cover.
          const vehicleId = (res.data as Vehicle).id;
          try {
            for (let i = 0; i < stagedPhotos.length; i++) {
              const file = stagedPhotos[i].file;
              const key = buildR2Key('vehicle', vehicleId, 'cover', file.name, false);
              await uploadToR2(file, key);
              await saveAssetMetadata({
                entity_type: 'vehicle',
                entity_id: vehicleId,
                category: 'cover',
                r2_key: key,
                bucket_path: key,
                file_name: file.name,
                file_type: file.type || null,
                file_size: file.size,
                is_sensitive: false,
                booking_id: null,
                title: file.name,
                is_cover: i === 0,
                uploaded_by: profile?.id ?? null,
              });
            }
            await refreshVehicleCovers();
          } catch (uploadErr) {
            toast('Автомобиль добавлен, но фото не сохранились: ' + (uploadErr as Error).message);
            closeModal();
            refresh();
            return;
          }
          toast(stagedPhotos.length ? 'Автомобиль добавлен · обложка установлена' : 'Автомобиль добавлен');
          closeModal();
          refresh();
          return;
        }
        if (!err) toast('Автомобиль добавлен');
      }
    } else if (modal === 'service') {
      if (!form.name) { toast('Укажите название услуги'); return; }
      let materials: unknown[] = [];
      let vehiclePricing = DEFAULT_VEHICLE_PRICING;
      try { materials = form.materials ? JSON.parse(form.materials) : []; } catch { materials = form.materials ? form.materials.split(',').map((s: string) => s.trim()) : []; }
      try { vehiclePricing = form.vehicle_pricing ? JSON.parse(form.vehicle_pricing) : DEFAULT_VEHICLE_PRICING; } catch { /* keep default */ }
      const row = {
        name: form.name,
        category: form.category,
        subcategory: form.subcategory || null,
        difficulty_level: form.difficulty || null,
        duration_minutes: +form.duration,
        price: +form.price,
        base_price: +form.price,
        min_price: form.min_price ? +form.min_price : null,
        max_price: form.max_price ? +form.max_price : null,
        labour_hours: form.labour_hours ? +form.labour_hours : null,
        warranty_months: form.warranty_months ? +form.warranty_months : null,
        maintenance_interval_months: form.maintenance_interval_months ? +form.maintenance_interval_months : null,
        description: form.description,
        customer_instructions: form.customer_instructions || null,
        required_technician_role: form.tech_role || null,
        required_equipment: form.equipment || null,
        materials,
        required_skills: form.skills ? form.skills.split(',').map((s) => s.trim()).filter(Boolean) : [],
        vehicle_pricing: vehiclePricing,
      };
      const res = e
        ? await db.from('services').update(row).eq('id', (e as Service).id)
        : await db.from('services').insert(row).select('*').single();
      err = res.error?.message ?? null;
      if (!err && !e && res.data) {
        setEditing(res.data);
        toast('Услуга добавлена — можно прикрепить документы');
        refresh();
        return;
      }
      if (!err) toast(e ? 'Услуга обновлена' : 'Услуга добавлена');
    } else if (modal === 'booking') {
      if (!form.customer_id || !form.date || !form.time) {
        toast('Укажите клиента, дату и время');
        return;
      }
      const scheduled_at = new Date(`${form.date}T${form.time}:00`).toISOString();
      const eta_at = form.eta_date && form.eta_time ? new Date(`${form.eta_date}T${form.eta_time}:00`).toISOString() : null;
      const draft = {
        id: (e as Booking | null)?.id,
        scheduled_at,
        bay: form.bay,
        assigned_technician_id: form.staff_id || null,
        service_id: form.service_id || null,
      };
      const { bayConflicts, techConflicts } = detectBookingConflicts(draft, allBookings, services);
      if (bayConflicts.length || techConflicts.length) {
        toast('Конфликт расписания: бокс или техник уже заняты в это время');
        return;
      }
      const row = {
        customer_id: form.customer_id,
        vehicle_id: form.vehicle_id || null,
        service_id: form.service_id || null,
        assigned_technician_id: form.staff_id || null,
        scheduled_at,
        eta_at,
        bay: form.bay,
        status: form.status,
        payment_status: form.payment_status,
        priority: form.priority || 'normal',
        estimated_value: form.estimated_value ? +form.estimated_value : null,
        internal_notes: form.internal_notes || null,
        notes: form.notes,
        extra_items: parseItems(form.extras),
        discount: form.discount ? +form.discount : null,
        deposit: form.deposit ? +form.deposit : null,
        pickup_at: form.pickup_date ? new Date(`${form.pickup_date}T12:00:00`).toISOString() : null,
        items_left: form.items_left || null,
      };
      if (e) {
        const res = await db.from('bookings').update(row).eq('id', (e as Booking).id);
        err = res.error?.message ?? null;
      } else {
        const res = await db.from('bookings').insert(row).select('*').single();
        err = res.error?.message ?? null;
        if (!err && res.data) {
          setEditing(res.data);
          if (form.vehicle_id) {
            const syncErr = await syncVehicleFromBookingStatus(form.vehicle_id, form.status);
            if (syncErr) toast('Бронь добавлена, доска цеха не синхронизирована');
            else if (form.eta_date && form.eta_time) {
              const eta_at = new Date(`${form.eta_date}T${form.eta_time}:00`).toISOString();
              await db.from('vehicles').update({ eta_at }).eq('id', form.vehicle_id);
            }
          }
          toast('Бронь добавлена — можно прикрепить документы');
          refresh();
          return;
        }
      }
      if (!err && form.vehicle_id) {
        const syncErr = await syncVehicleFromBookingStatus(form.vehicle_id, form.status);
        if (syncErr) toast('Бронь сохранена, доска цеха не синхронизирована');
        else if (form.eta_date && form.eta_time) {
          const eta_at = new Date(`${form.eta_date}T${form.eta_time}:00`).toISOString();
          await db.from('vehicles').update({ eta_at }).eq('id', form.vehicle_id);
        }
      }
      if (!err) toast(e ? 'Бронь обновлена' : 'Бронь добавлена');
    } else if (modal === 'staff') {
      if (!form.name) { toast('Укажите имя сотрудника'); return; }
      const row = {
        full_name: form.name,
        role: form.role,
        workload_pct: +form.pct,
        experience_years: +form.experience,
        profile_id: form.profile_id || null,
        employee_id: form.employee_id || null,
        date_of_birth: form.date_of_birth || null,
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        emergency_contact: form.emergency_contact || null,
        nationality: form.nationality || null,
        employment_status: form.employment_status || 'active',
        department: form.department || null,
        start_date: form.start_date || null,
        employment_type: form.employment_type || null,
        salary: form.salary ? +form.salary : null,
        reporting_manager_id: form.reporting_manager_id || null,
        working_location: form.working_location || null,
        internal_notes: form.internal_notes || null,
        availability_status: form.availability_status || 'available',
        commission_pct: form.commission_pct ? Math.min(100, Math.max(0, +form.commission_pct)) : null,
      };
      if (e) {
        const res = await db.from('staff').update(row).eq('id', (e as Staff).id);
        err = res.error?.message ?? null;
        if (!err) toast('Сотрудник обновлён');
      } else {
        const res = await db.from('staff').insert(row).select('*').single();
        err = res.error?.message ?? null;
        if (!err && res.data) {
          setEditing(res.data);
          toast('Сотрудник добавлен — можно загрузить документы');
          refresh();
          return;
        }
        if (!err) toast('Сотрудник добавлен');
      }
    } else if (modal === 'invoice') {
      if (!form.customer_id) { toast('Выберите клиента'); return; }
      const prev = e as Invoice | null;
      const status = form.status === 'paid' ? 'paid' : 'pending';
      const patch = {
        customer_id: form.customer_id,
        description: form.desc,
        amount: +form.amount,
        status,
        paid_at: status === 'paid' ? (prev?.paid_at ?? new Date().toISOString()) : null,
        due_date: form.due_date || null,
        order_id: form.order_id || null,
        booking_id: form.booking_id || null,
      };
      let savedId = prev?.id;
      if (prev) {
        const res = await db.from('invoices').update(patch).eq('id', prev.id);
        err = res.error?.message ?? null;
        if (!err) toast('Счёт обновлён');
      } else {
        const res = await db.from('invoices').insert({ ...patch, payments: [], invoice_number: await nextInvoiceNumber() }).select('*').single();
        err = res.error?.message ?? null;
        if (!err && res.data) {
          savedId = (res.data as Invoice).id;
          if (form.booking_id) await db.from('bookings').update({ invoice_id: savedId }).eq('id', form.booking_id);
          setEditing(res.data);
          toast('Счёт добавлен — можно прикрепить документы');
          refresh();
          return;
        }
        if (!err) toast('Счёт добавлен');
      }
      if (!err && form.booking_id && savedId) await db.from('bookings').update({ invoice_id: savedId }).eq('id', form.booking_id);
    } else if (modal === 'lead') {
      if (!form.name) { toast('Укажите имя лида'); return; }
      if (form.status === 'lost' && !form.lost_reason) { toast('Укажите причину потери лида'); return; }
      const row = {
        full_name: form.name, last_name: form.surname || null, phone: form.phone, email: form.email,
        car_brand: form.car_brand || null, car_model: form.car_model || null, source: form.source, status: form.status,
        notes: form.notes, owner_id: form.owner_id || null,
        tags: form.tags ? form.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
        next_action_at: form.next_action_at || null, next_action_note: form.next_action_at ? (form.next_action_note || null) : null,
        lost_reason: form.status === 'lost' ? form.lost_reason : null,
        est_value: form.est_value ? (Number(String(form.est_value).replace(/\s/g, '').replace(',', '.')) || null) : null,
        service_interest: form.service_interest || null,
      };
      if (e) {
        const prevStatus = (e as Lead).status;
        const res = await db.from('leads').update(row).eq('id', (e as Lead).id);
        err = res.error?.message ?? null;
        if (!err) {
          if (prevStatus !== row.status) {
            await db.from('lead_activities').insert({
              lead_id: (e as Lead).id, type: 'status_change',
              body: `Статус изменён: ${LEAD_STATUS_LABELS[prevStatus]} → ${LEAD_STATUS_LABELS[row.status]}${row.status === 'lost' ? ` (${row.lost_reason})` : ''}`,
              author_id: profile?.id ?? null,
            });
          }
          toast('Лид обновлён');
        }
      } else {
        const res = await db.from('leads').insert(row).select('*').single();
        err = res.error?.message ?? null;
        if (!err && res.data) {
          await db.from('lead_activities').insert({ lead_id: res.data.id, type: 'status_change', body: 'Лид создан', author_id: profile?.id ?? null });
          setEditing(res.data);
          toast('Лид добавлен — можно прикрепить документы');
          refresh();
          return;
        }
        if (!err) toast('Лид добавлен');
      }
    } else if (modal === 'inventory') {
      if (!form.name) { toast('Укажите название позиции'); return; }
      const row = {
        name: form.name,
        type: form.type,
        supplier: form.supplier || null,
        stock_level: +form.stock,
        min_stock_level: +form.min,
        unit: form.unit,
        description: form.description || null,
        category: form.category || null,
        subcategory: form.subcategory || null,
        brand: form.brand || null,
        sku: form.sku || null,
        barcode: form.barcode || null,
        unit_cost: form.unit_cost ? +form.unit_cost : 0,
        selling_price: form.selling_price ? +form.selling_price : 0,
        storage_location: form.storage_location || null,
        batch_number: form.batch_number || null,
        expiry_date: form.expiry_date || null,
        application_purpose: form.application_purpose || null,
        usage_instructions: form.usage_instructions || null,
        safety_info: form.safety_info || null,
        film_thickness: form.film_thickness || null,
        roll_length: form.roll_length ? +form.roll_length : null,
        roll_width: form.roll_width ? +form.roll_width : null,
        equipment_id: form.equipment_id || null,
        purchase_date: form.purchase_date || null,
        warranty_until: form.warranty_until || null,
        maintenance_due: form.maintenance_due || null,
        assigned_staff_id: form.assigned_staff_id || null,
        condition: form.condition || null,
        hazard_class: form.hazard_class || null,
        storage_requirements: form.storage_requirements || null,
        is_active: form.is_active !== 'false',
      };
      if (e) {
        const res = await db.from('inventory_items').update(row).eq('id', (e as InventoryItem).id);
        err = res.error?.message ?? null;
        if (!err) toast('Позиция обновлена');
      } else {
        const res = await db.from('inventory_items').insert(row).select('*').single();
        err = res.error?.message ?? null;
        if (!err && res.data) {
          setEditing(res.data);
          toast('Позиция добавлена — можно прикрепить документы');
          refresh();
          return;
        }
        if (!err) toast('Позиция добавлена');
      }
    }

    if (err) { toast('Ошибка: ' + err); return; }
    closeModal();
    refresh();
  };

  const set = (key: string, val: string) => setForm((f) => ({ ...f, [key]: val }));

  const modalTitles: Record<string, string> = {
    customer: editing ? 'Редактировать клиента' : 'Новый клиент',
    vehicle: editing ? 'Редактировать автомобиль' : 'Новый автомобиль',
    service: editing ? 'Редактировать услугу' : 'Новая услуга',
    booking: editing ? 'Редактировать бронь' : 'Новая бронь',
    staff: editing ? 'Редактировать сотрудника' : 'Новый сотрудник',
    invoice: editing ? 'Редактировать счёт' : 'Новый счёт',
    lead: editing ? 'Редактировать лид' : 'Новый лид',
    inventory: editing ? 'Редактировать позицию' : 'Новая позиция',
  };

  const customerVehicles = vehicles.filter((v) => v.customer_id === form.customer_id);

  const bookingConflicts = useMemo(() => {
    if (modal !== 'booking' || !form.date || !form.time) return { bayConflicts: [] as Booking[], techConflicts: [] as Booking[] };
    const scheduled_at = new Date(`${form.date}T${form.time}:00`).toISOString();
    return detectBookingConflicts(
      {
        id: (editing as Booking | null)?.id,
        scheduled_at,
        bay: form.bay,
        assigned_technician_id: form.staff_id || null,
        service_id: form.service_id || null,
      },
      allBookings,
      services
    );
  }, [modal, form.date, form.time, form.bay, form.staff_id, form.service_id, editing, allBookings, services]);

  return (
    <Layout onQuickAction={(t) => {
      if (t === 'attachment') setAttachmentOpen(true);
      else openModal(t as ModalType);
    }}>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/overview" element={<ViewRoute view="overview"><OverviewPage onNewBooking={() => openModal('booking')} onEditBooking={(b) => openModal('booking', b)} /></ViewRoute>} />
        <Route path="/jobs" element={<ViewRoute view="jobs"><OperationsPage initialTab="list" onEdit={(b) => openModal('booking', b)} /></ViewRoute>} />
        <Route path="/bookings" element={<ViewRoute view="bookings"><OperationsPage initialTab="calendar" onEdit={(b) => openModal('booking', b)} /></ViewRoute>} />
        <Route path="/pipeline" element={<ViewRoute view="pipeline"><PipelinePage /></ViewRoute>} />
        <Route path="/inspection" element={<ViewRoute view="inspection"><InspectionPage /></ViewRoute>} />
        <Route path="/documents" element={<ViewRoute view="documents"><DocumentsPage /></ViewRoute>} />
        <Route path="/vehicles" element={<ViewRoute view="vehicles"><VehiclesPage onEdit={(v) => openModal('vehicle', v)} /></ViewRoute>} />
        <Route path="/customers" element={<ViewRoute view="customers"><CustomersPage onEdit={(c) => openModal('customer', c)} /></ViewRoute>} />
        <Route path="/leads" element={<ViewRoute view="leads"><LeadsPage onEdit={(l) => openModal('lead', l)} /></ViewRoute>} />
        <Route path="/staff" element={<ViewRoute view="staff"><StaffPage onEdit={(s) => openModal('staff', s)} /></ViewRoute>} />
        <Route path="/services" element={<ViewRoute view="services"><ServicesPage onEdit={(s) => openModal('service', s)} /></ViewRoute>} />
        <Route path="/finance" element={<ViewRoute view="finance"><FinancePage onEdit={(i) => openModal('invoice', i)} /></ViewRoute>} />
        <Route path="/mailbox" element={<ViewRoute view="mailbox"><MailboxPage /></ViewRoute>} />
        <Route path="/inventory" element={<ViewRoute view="inventory"><InventoryPage onEdit={(i) => openModal('inventory', i)} /></ViewRoute>} />
        <Route path="/reports" element={<ViewRoute view="reports"><ReportsPage /></ViewRoute>} />
        <Route path="/settings" element={<ViewRoute view="settings"><SettingsPage /></ViewRoute>} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Routes>
      </Suspense>

      <Modal open={!!modal} title={modal ? modalTitles[modal] : ''} onClose={closeModal} onSave={saveModal}>
        {modal === 'customer' && (
          <>
            <Field label="Имя и фамилия" id="m-name" value={form.name} onChange={(v) => set('name', v)} placeholder="Игорь Соловьёв" />
            <div className="field-row2">
              <Field label="Телефон" id="m-phone" value={form.phone} onChange={(v) => set('phone', v)} placeholder="+7 900 000 00 00" />
              <Field label="Email" id="m-email" value={form.email} onChange={(v) => set('email', v)} placeholder="client@mail.ru" />
            </div>
            <div className="field-row2">
              <Field label="Адрес" id="m-address" value={form.address} onChange={(v) => set('address', v)} placeholder="Москва" />
              <SelectField label="Статус" id="m-status" value={form.status} onChange={(v) => set('status', v)} options={[{ value: 'active', label: 'Активен' }, { value: 'vip', label: 'VIP' }, { value: 'sleeping', label: 'Спящий' }]} />
            </div>
            <div className="field-row2">
              <SelectField label="Откуда клиент" id="m-source" value={form.source} onChange={(v) => set('source', v)} options={CUSTOMER_SOURCES} />
              <SelectField label="Как связываться" id="m-channel" value={form.preferred_channel} onChange={(v) => set('preferred_channel', v)} options={CUSTOMER_CHANNELS} />
            </div>
            <div className="field-row2">
              <Field label="День рождения" id="m-bday" type="date" value={form.birthday} onChange={(v) => set('birthday', v)} />
              <Field label="Рекомендовал (кто привёл)" id="m-ref" value={form.referred_by} onChange={(v) => set('referred_by', v)} />
            </div>
            <Field label="Теги (через запятую)" id="m-tags" value={form.tags} onChange={(v) => set('tags', v)} placeholder="ceramic, vip, флот" />
            <Field label="Заметки" id="m-notes" value={form.notes} onChange={(v) => set('notes', v)} />
            {savedEntityId(editing) ? (
              <div className="modal-asset-section">
                <div className="side-field-label">Документы клиента (локально)</div>
                <AssetManager entityType="customer" entityId={savedEntityId(editing)!} categories={FILE_CATEGORIES.customer.map((c) => ({ ...c }))} compact />
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '12px 0', fontSize: 12 }}>Сохраните клиента, затем прикрепите документы</div>
            )}
          </>
        )}
        {modal === 'vehicle' && (
          <>
            <div className="field-row2">
              <Field
                label="Марка"
                id="m-brand"
                value={form.brand}
                onChange={(v) => set('brand', v)}
                placeholder="Начните вводить или выберите"
                list="dl-car-makes"
                listOptions={CAR_MAKES}
              />
              <Field
                label="Модель"
                id="m-model"
                value={form.model}
                onChange={(v) => set('model', v)}
                placeholder="Начните вводить или выберите"
                list="dl-car-models"
                listOptions={CAR_MODELS_BY_MAKE[form.brand] ?? []}
              />
            </div>
            <div className="field-row2">
              <Field label="Гос. номер" id="m-plate" value={form.plate} onChange={(v) => set('plate', v)} />
              <Field label="Цвет" id="m-color" value={form.color} onChange={(v) => set('color', v)} list="dl-vehicle-colors" listOptions={VEHICLE_COLORS} />
            </div>
            <div className="field-row2">
              <Field label="Год" id="m-year" type="number" value={form.year} onChange={(v) => set('year', v)} />
              <Field label="VIN" id="m-vin" value={form.vin} onChange={(v) => set('vin', v)} />
            </div>
            <div className="field-row2">
              <Field label="Пробег, км" id="m-mileage" type="number" value={form.mileage} onChange={(v) => set('mileage', v)} />
              <Field label="Код краски" id="m-paint" value={form.paint_code} onChange={(v) => set('paint_code', v)} />
            </div>
            <Field label="История покрытий (керамика, PPF, дата, материал)" id="m-coat" value={form.coating_history} onChange={(v) => set('coating_history', v)} />
            <SelectField label="Клиент" id="m-client" value={form.customer_id} onChange={(v) => set('customer_id', v)} options={customers.map((c) => ({ value: c.id, label: c.full_name }))} />
            <SelectField label="Этап" id="m-stage" value={form.stage} onChange={(v) => set('stage', v)} options={PIPELINE_STAGES.map((s) => ({ value: s, label: s }))} />
            <Field label="Заметки" id="m-notes" value={form.notes} onChange={(v) => set('notes', v)} />
            {savedEntityId(editing) ? (
              <div className="modal-asset-section">
                <div className="side-field-label">Фото и документы автомобиля</div>
                <AssetManager entityType="vehicle" entityId={savedEntityId(editing)!} categories={FILE_CATEGORIES.vehicle.map((c) => ({ ...c }))} compact />
              </div>
            ) : (
              <VehiclePhotoPicker items={stagedPhotos} onAdd={addStaged} onRemove={removeStaged} onMakeCover={makeStagedCover} />
            )}
          </>
        )}
        {modal === 'service' && (
          <>
            <Field label="Название" id="m-name" value={form.name} onChange={(v) => set('name', v)} />
            <div className="field-row2">
              <SelectField label="Категория" id="m-cat" value={form.category} onChange={(v) => set('category', v)} options={SVC_CATEGORY_IDS.map((c) => ({ value: c, label: SERVICE_CATEGORIES[c].label }))} />
              <Field label="Подкатегория" id="m-subcat" value={form.subcategory} onChange={(v) => set('subcategory', v)} />
            </div>
            <div className="field-row2">
              <SelectField label="Сложность" id="m-diff" value={form.difficulty} onChange={(v) => set('difficulty', v)} options={[{ value: 'easy', label: 'Простая' }, { value: 'medium', label: 'Средняя' }, { value: 'hard', label: 'Сложная' }, { value: 'expert', label: 'Экспертная' }]} />
              <Field label="Трудозатраты, ч" id="m-labour" type="number" value={form.labour_hours} onChange={(v) => set('labour_hours', v)} />
            </div>
            <div className="field-row2">
              <Field label="Длительность, мин" id="m-dur" type="number" value={form.duration} onChange={(v) => set('duration', v)} />
              <Field label="Базовая цена, ₽" id="m-price" type="number" value={form.price} onChange={(v) => set('price', v)} />
            </div>
            <div className="field-row2">
              <Field label="Мин. цена, ₽" id="m-min" type="number" value={form.min_price} onChange={(v) => set('min_price', v)} />
              <Field label="Макс. цена, ₽" id="m-max" type="number" value={form.max_price} onChange={(v) => set('max_price', v)} />
            </div>
            <div className="field-row2">
              <Field label="Гарантия, мес." id="m-warranty" type="number" value={form.warranty_months} onChange={(v) => set('warranty_months', v)} placeholder="0 — без гарантии" />
              <Field label="Обслуживание каждые, мес." id="m-maint" type="number" value={form.maintenance_interval_months} onChange={(v) => set('maintenance_interval_months', v)} placeholder="напоминание клиенту" />
            </div>
            <Field label="Описание" id="m-desc" value={form.description} onChange={(v) => set('description', v)} />
            <Field label="Инструкции для клиента" id="m-cust-inst" value={form.customer_instructions} onChange={(v) => set('customer_instructions', v)} />
            <div className="field-row2">
              <Field label="Требуемая роль" id="m-tech" value={form.tech_role} onChange={(v) => set('tech_role', v)} placeholder="detailer" list="dl-staff-spec" listOptions={STAFF_SPECIALIZATIONS} />
              <Field label="Навыки" id="m-skills" value={form.skills} onChange={(v) => set('skills', v)} placeholder="PPF, Полировка" />
            </div>
            <Field label="Множители по типу авто (JSON)" id="m-vp" value={form.vehicle_pricing} onChange={(v) => set('vehicle_pricing', v)} />
            <Field label="Материалы (JSON или через запятую)" id="m-mat" value={form.materials} onChange={(v) => set('materials', v)} />
            <Field label="Оборудование" id="m-equip" value={form.equipment} onChange={(v) => set('equipment', v)} />
            {savedEntityId(editing) ? (
              <div className="modal-asset-section">
                <div className="side-field-label">Медиа и документы услуги (R2)</div>
                <AssetManager entityType="service" entityId={savedEntityId(editing)!} categories={FILE_CATEGORIES.service.map((c) => ({ ...c }))} compact />
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '12px 0', fontSize: 12 }}>Сохраните услугу, затем прикрепите документы</div>
            )}
          </>
        )}
        {modal === 'booking' && (
          <>
            <div className="field-row2">
              <Field label="Дата" id="m-date" type="date" value={form.date} onChange={(v) => set('date', v)} />
              <Field label="Время" id="m-time" type="time" value={form.time} onChange={(v) => set('time', v)} />
            </div>
            <div className="field-row2">
              <Field label="ETA дата" id="m-eta-d" type="date" value={form.eta_date} onChange={(v) => set('eta_date', v)} />
              <Field label="ETA время" id="m-eta-t" type="time" value={form.eta_time} onChange={(v) => set('eta_time', v)} />
            </div>
            <SelectField label="Клиент" id="m-client" value={form.customer_id} onChange={(v) => set('customer_id', v)} options={customers.map((c) => ({ value: c.id, label: c.full_name }))} />
            <SelectField label="Автомобиль" id="m-vehicle" value={form.vehicle_id} onChange={(v) => set('vehicle_id', v)} options={[{ value: '', label: '—' }, ...customerVehicles.map((v) => ({ value: v.id, label: `${v.brand} ${v.model}` }))]} />
            <SelectField
              label="Услуга"
              id="m-service"
              value={form.service_id}
              onChange={(v) => {
                set('service_id', v);
                // Auto-fill the cost estimate and ETA from the service's own
                // price/duration instead of making someone look them up and
                // retype them — only when the fields are still untouched, so
                // it never clobbers a value someone already typed in.
                const svc = services.find((s) => s.id === v);
                if (svc) {
                  if (!form.estimated_value) set('estimated_value', String(svc.price ?? svc.base_price ?? ''));
                  if (!form.eta_date && !form.eta_time && form.date && form.time && svc.duration_minutes) {
                    const start = new Date(`${form.date}T${form.time}:00`);
                    const end = new Date(start.getTime() + svc.duration_minutes * 60000);
                    set('eta_date', end.toISOString().slice(0, 10));
                    set('eta_time', end.toTimeString().slice(0, 5));
                  }
                }
              }}
              options={services.map((s) => ({ value: s.id, label: s.name }))}
            />
            <SelectField label="Исполнитель" id="m-staff" value={form.staff_id} onChange={(v) => set('staff_id', v)} options={[{ value: '', label: '—' }, ...staffList.map((s) => ({ value: s.id, label: s.full_name }))]} />
            <SelectField label="Бокс" id="m-bay" value={form.bay} onChange={(v) => set('bay', v)} options={CAL_BAYS.map((b) => ({ value: b, label: b }))} />
            <SelectField label="Статус" id="m-status" value={form.status} onChange={(v) => set('status', v)} options={Object.entries(BOOKING_STATUS_LABELS).map(([k, l]) => ({ value: k, label: l }))} />
            <SelectField label="Приоритет" id="m-priority" value={form.priority} onChange={(v) => set('priority', v)} options={Object.entries(BOOKING_PRIORITY_LABELS).map(([k, l]) => ({ value: k, label: l }))} />
            <Field label="Стоимость основной услуги, ₽" id="m-est-value" type="number" value={form.estimated_value} onChange={(v) => set('estimated_value', v)} />
            <div>
              <div className="field-label">Дополнительные услуги (допродажа)</div>
              <div className="tag-row" style={{ marginBottom: 8 }}>
                {services.filter((sv) => sv.id !== form.service_id).map((sv) => {
                  const items = parseItems(form.extras);
                  const on = items.some((x) => x.service_id === sv.id);
                  return (
                    <div key={sv.id} className={`tag ${on ? 'add' : 'ghost'}`} style={{ cursor: 'pointer' }} onClick={() => set('extras', JSON.stringify(on ? items.filter((x) => x.service_id !== sv.id) : [...items, { service_id: sv.id, name: sv.name, price: Number(sv.price ?? sv.base_price ?? 0), quantity: 1, source: 'manual' as const }]))}>
                      {on ? '✓ ' : '+ '}{sv.name}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="field-row2">
              <Field label="Скидка, ₽" id="m-discount" type="number" value={form.discount} onChange={(v) => set('discount', v)} />
              <Field label="Предоплата получена, ₽" id="m-deposit" type="number" value={form.deposit} onChange={(v) => set('deposit', v)} />
            </div>
            <div className="settings-hint" style={{ marginBottom: 8 }}>
              Итого по заказу: <b>{bookingValue({ estimated_value: form.estimated_value ? +form.estimated_value : null, services: (() => { const sv = services.find((x) => x.id === form.service_id); return sv ? { name: sv.name, price: sv.price } : null; })(), extra_items: parseItems(form.extras), discount: form.discount ? +form.discount : null }).toLocaleString('ru-RU')} ₽</b>
              {parseItems(form.extras).length > 0 && ` (услуга ${bookingBaseValue({ estimated_value: form.estimated_value ? +form.estimated_value : null, services: (() => { const sv = services.find((x) => x.id === form.service_id); return sv ? { name: sv.name, price: sv.price } : null; })() }).toLocaleString('ru-RU')} + допы ${bookingExtrasTotal({ extra_items: parseItems(form.extras) }).toLocaleString('ru-RU')})`}
            </div>
            <div className="field-row2">
              <Field label="Выдача авто (дата)" id="m-pickup" type="date" value={form.pickup_date} onChange={(v) => set('pickup_date', v)} />
              <Field label="Вещи в авто / ключи" id="m-items-left" value={form.items_left} onChange={(v) => set('items_left', v)} />
            </div>
            <SelectField label="Оплата" id="m-payment" value={form.payment_status} onChange={(v) => set('payment_status', v)} options={[{ value: 'unpaid', label: 'Не оплачено' }, { value: 'partial', label: 'Частично' }, { value: 'paid', label: 'Оплачено' }]} />
            <Field label="Заметки для клиента" id="m-notes" value={form.notes} onChange={(v) => set('notes', v)} />
            <Field label="Внутренние заметки" id="m-internal" value={form.internal_notes} onChange={(v) => set('internal_notes', v)} />
            {(bookingConflicts.bayConflicts.length > 0 || bookingConflicts.techConflicts.length > 0) && (
              <div className="booking-conflict-warn">
                <strong>Конфликт расписания</strong>
                {bookingConflicts.bayConflicts.length > 0 && (
                  <div>Бокс «{form.bay}» занят: {bookingConflicts.bayConflicts.map((b) => b.customers?.full_name).join(', ')}</div>
                )}
                {bookingConflicts.techConflicts.length > 0 && (
                  <div>Техник перегружен: {bookingConflicts.techConflicts.map((b) => b.vehicles ? `${b.vehicles.brand} ${b.vehicles.model}` : '—').join(', ')}</div>
                )}
              </div>
            )}
            {savedEntityId(editing) ? (
              <div className="modal-asset-section">
                <div className="side-field-label">Документы брони (локально)</div>
                <AssetManager entityType="booking" entityId={savedEntityId(editing)!} bookingId={savedEntityId(editing)!} categories={FILE_CATEGORIES.booking.map((c) => ({ ...c }))} compact />
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '12px 0', fontSize: 12 }}>Сохраните бронь, затем прикрепите документы</div>
            )}
          </>
        )}
        {modal === 'staff' && (
          <>
            <Field label="Имя и фамилия" id="m-name" value={form.name} onChange={(v) => set('name', v)} />
            <div className="field-row2">
              <Field label="ID сотрудника" id="m-emp-id" value={form.employee_id} onChange={(v) => set('employee_id', v)} />
              <Field label="Дата рождения" id="m-dob" type="date" value={form.date_of_birth} onChange={(v) => set('date_of_birth', v)} />
            </div>
            <SelectField label="Аккаунт системы" id="m-profile" value={form.profile_id} onChange={(v) => set('profile_id', v)} options={[{ value: '', label: '— не привязан —' }, ...profiles.map((p) => ({ value: p.id, label: `${p.full_name || p.email} (${p.email})` }))]} />
            <Field label="Специализация" id="m-role" value={form.role} onChange={(v) => set('role', v)} list="dl-staff-spec" listOptions={STAFF_SPECIALIZATIONS} />
            <div className="field-row2">
              <Field label="Телефон" id="m-phone" value={form.phone} onChange={(v) => set('phone', v)} />
              <Field label="Email" id="m-email" value={form.email} onChange={(v) => set('email', v)} />
            </div>
            <Field label="Адрес" id="m-address" value={form.address} onChange={(v) => set('address', v)} />
            <div className="field-row2">
              <Field label="Экстренный контакт" id="m-emerg" value={form.emergency_contact} onChange={(v) => set('emergency_contact', v)} />
              <Field label="Гражданство" id="m-nat" value={form.nationality} onChange={(v) => set('nationality', v)} />
            </div>
            <div className="field-row2">
              <SelectField label="Статус занятости" id="m-emp-st" value={form.employment_status} onChange={(v) => set('employment_status', v)} options={[{ value: 'active', label: 'Активен' }, { value: 'inactive', label: 'Неактивен' }, { value: 'on_leave', label: 'В отпуске' }, { value: 'terminated', label: 'Уволен' }]} />
              <SelectField label="Доступность" id="m-avail" value={form.availability_status} onChange={(v) => set('availability_status', v)} options={[{ value: 'available', label: 'Доступен' }, { value: 'busy', label: 'Занят' }, { value: 'off', label: 'Не на смене' }, { value: 'leave', label: 'Отпуск' }]} />
            </div>
            <div className="field-row2">
              <Field label="Отдел" id="m-dept" value={form.department} onChange={(v) => set('department', v)} />
              <Field label="Тип занятости" id="m-emp-type" value={form.employment_type} onChange={(v) => set('employment_type', v)} placeholder="штат / подряд" list="dl-employment-type" listOptions={EMPLOYMENT_TYPES} />
            </div>
            <div className="field-row2">
              <Field label="Дата начала" id="m-start" type="date" value={form.start_date} onChange={(v) => set('start_date', v)} />
              <Field label="Зарплата, ₽" id="m-salary" type="number" value={form.salary} onChange={(v) => set('salary', v)} />
            </div>
            <div className="field-row2">
              <SelectField label="Руководитель" id="m-manager" value={form.reporting_manager_id} onChange={(v) => set('reporting_manager_id', v)} options={[{ value: '', label: '—' }, ...staffList.filter((s) => s.id !== (editing as Staff | null)?.id).map((s) => ({ value: s.id, label: s.full_name }))]} />
              <Field label="Локация" id="m-loc" value={form.working_location} onChange={(v) => set('working_location', v)} />
            </div>
            <div className="field-row2">
              <Field label="Комиссия с работ, %" id="m-comm" type="number" value={form.commission_pct} onChange={(v) => set('commission_pct', v)} placeholder="доля от стоимости заказа" />
              <Field label="Загрузка, %" id="m-pct" type="number" value={form.pct} onChange={(v) => set('pct', v)} />
              <Field label="Опыт, лет" id="m-exp" type="number" value={form.experience} onChange={(v) => set('experience', v)} />
            </div>
            <Field label="Внутренние заметки" id="m-notes" value={form.internal_notes} onChange={(v) => set('internal_notes', v)} />
            <div className="cell-sub" style={{ marginBottom: 12 }}>Навыки настраиваются во вкладке «Профиль» модуля Команда</div>
            {savedEntityId(editing) ? (
              <div className="modal-asset-section">
                <div className="side-field-label">Документы сотрудника (локально)</div>
                <AssetManager
                  entityType="staff"
                  entityId={savedEntityId(editing)!}
                  categories={FILE_CATEGORIES.staff.map((c) => ({ ...c }))}
                  compact
                />
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '12px 0', fontSize: 12 }}>Сохраните сотрудника, затем загрузите документы</div>
            )}
          </>
        )}
        {modal === 'invoice' && (
          <>
            <SelectField label="Клиент" id="m-client" value={form.customer_id} onChange={(v) => set('customer_id', v)} options={customers.map((c) => ({ value: c.id, label: c.full_name }))} />
            <SelectField
              label="Заказ (бронь), который оплачивает этот счёт"
              id="m-inv-booking"
              value={form.booking_id}
              onChange={(v) => {
                set('booking_id', v);
                const bk = allBookings.find((x) => x.id === v);
                if (bk) {
                  set('desc', [bk.services?.name, ...(bk.extra_items ?? []).map((x) => x.name)].filter(Boolean).join(' + '));
                  set('amount', String(bookingValue(bk as never)));
                }
              }}
              options={[{ value: '', label: '— без привязки —' }, ...allBookings.filter((x) => x.customer_id === form.customer_id).map((x) => ({ value: x.id, label: `${new Date(x.scheduled_at).toLocaleDateString('ru-RU')} · ${x.services?.name ?? 'Заказ'}${x.vehicles ? ` · ${x.vehicles.brand} ${x.vehicles.model}` : ''}` }))]}
            />
            <Field label="Описание" id="m-desc" value={form.desc} onChange={(v) => set('desc', v)} />
            <Field label="Сумма, ₽" id="m-amount" type="number" value={form.amount} onChange={(v) => set('amount', v)} />
            <Field label="Срок оплаты" id="m-due" type="date" value={form.due_date} onChange={(v) => set('due_date', v)} />
            <SelectField label="Статус" id="m-status" value={form.status} onChange={(v) => set('status', v)} options={[{ value: 'pending', label: 'Ожидает оплаты' }, { value: 'paid', label: 'Оплачен полностью' }]} />
            {(editing as Invoice | null)?.id && canManageFinance(profile?.role) && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
                {(() => {
                  const inv = editing as Invoice;
                  const customer = customers.find((c) => c.id === (form.customer_id || inv.customer_id));
                  const email = customer?.email?.trim();
                  return (
                    <>
                      <div className="settings-hint" style={{ marginBottom: 12 }}>
                        {email ? `Email клиента: ${email}` : 'У выбранного клиента не указан email — добавьте его в карточке клиента.'}
                        {inv.sent_at && (
                          <div style={{ marginTop: 4 }}>
                            Последняя отправка: {new Date(inv.sent_at).toLocaleString('ru-RU')} → {inv.last_sent_to}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        className="btn-secondary"
                        disabled={!email || sendingInvoice}
                        onClick={sendInvoiceFromModal}
                      >
                        {sendingInvoice ? 'Отправка…' : 'Отправить счёт клиенту'}
                      </button>
                    </>
                  );
                })()}
              </div>
            )}
            {savedEntityId(editing) ? (
              <div className="modal-asset-section">
                <div className="side-field-label">Документы счёта (R2)</div>
                <AssetManager entityType="invoice" entityId={savedEntityId(editing)!} categories={FILE_CATEGORIES.invoice.map((c) => ({ ...c }))} compact />
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '12px 0', fontSize: 12 }}>Сохраните счёт, затем прикрепите документы</div>
            )}
          </>
        )}
        {modal === 'lead' && (
          <>
            <div className="field-row2">
              <Field label="Имя" id="m-name" value={form.name} onChange={(v) => set('name', v)} />
              <Field label="Фамилия" id="m-surname" value={form.surname} onChange={(v) => set('surname', v)} />
            </div>
            <Field label="Телефон" id="m-phone" value={form.phone} onChange={(v) => set('phone', v)} />
            <Field label="Email" id="m-email" value={form.email} onChange={(v) => set('email', v)} />
            <div className="field-row2">
              <Field label="Марка авто" id="m-car-brand" value={form.car_brand} onChange={(v) => set('car_brand', v)} list="dl-car-makes" listOptions={CAR_MAKES} />
              <Field label="Модель авто" id="m-car-model" value={form.car_model} onChange={(v) => set('car_model', v)} list="dl-car-models-lead" listOptions={CAR_MODELS_BY_MAKE[form.car_brand] ?? []} />
            </div>
            <SelectField label="Источник" id="m-source" value={form.source} onChange={(v) => set('source', v)} options={[{ value: 'website', label: 'Сайт' }, { value: 'instagram', label: 'Instagram' }, { value: 'whatsapp', label: 'WhatsApp' }, { value: 'phone', label: 'Телефон' }, { value: 'referral', label: 'Рекомендация' }]} />
            <div className="field-row2">
              <SelectField label="Статус" id="m-status" value={form.status} onChange={(v) => set('status', v)} options={[{ value: 'new', label: 'Новый' }, { value: 'contacted', label: 'Связались' }, { value: 'qualified', label: 'Квалифицирован' }, { value: 'converted', label: 'Конвертирован' }, { value: 'lost', label: 'Потерян' }, { value: 'junk', label: 'Спам' }]} />
              <SelectField label="Ответственный" id="m-owner" value={form.owner_id} onChange={(v) => set('owner_id', v)} options={[{ value: '', label: '—' }, ...staffList.map((s) => ({ value: s.id, label: s.full_name }))]} />
            </div>
            {form.status === 'lost' && (
              <SelectField label="Причина потери" id="m-lost-reason" value={form.lost_reason} onChange={(v) => set('lost_reason', v)} options={[{ value: '', label: '— выберите —' }, ...LEAD_LOST_REASONS.map((r) => ({ value: r, label: r })), ...(form.lost_reason && !LEAD_LOST_REASONS.includes(form.lost_reason) ? [{ value: form.lost_reason, label: form.lost_reason }] : [])]} />
            )}
            <div className="field-row2">
              <SelectField label="Интересует" id="m-service-interest" value={form.service_interest} onChange={(v) => set('service_interest', v)} options={[{ value: '', label: '—' }, ...LEAD_SERVICE_INTERESTS.map((x) => ({ value: x.value, label: x.label }))]} />
              <Field label="Ожидаемая сумма, ₽" id="m-est-value" value={form.est_value} onChange={(v) => set('est_value', v)} placeholder="например 85000" />
            </div>
            <Field label="Теги (через запятую)" id="m-tags" value={form.tags} onChange={(v) => set('tags', v)} placeholder="vip-interest, ppf, hot" />
            <div className="field-row2">
              <Field label="Следующее действие — дата" id="m-next-action-at" type="date" value={form.next_action_at} onChange={(v) => set('next_action_at', v)} />
              <Field label="Следующее действие — что сделать" id="m-next-action-note" value={form.next_action_note} onChange={(v) => set('next_action_note', v)} placeholder="Перезвонить, отправить КП..." />
            </div>
            <Field label="Заметки" id="m-notes" value={form.notes} onChange={(v) => set('notes', v)} />
            {savedEntityId(editing) ? (
              <div className="modal-asset-section">
                <div className="side-field-label">Документы лида (локально)</div>
                <AssetManager entityType="lead" entityId={savedEntityId(editing)!} categories={FILE_CATEGORIES.lead.map((c) => ({ ...c }))} compact />
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '12px 0', fontSize: 12 }}>Сохраните лид, затем прикрепите документы</div>
            )}
          </>
        )}
        {modal === 'inventory' && (
          <>
            <Field label="Наименование" id="m-name" value={form.name} onChange={(v) => set('name', v)} />
            <div className="field-row2">
              <SelectField label="Тип" id="m-type" value={form.type} onChange={(v) => set('type', v)} options={[{ value: 'material', label: 'Материал' }, { value: 'product', label: 'Товар / продукт' }]} />
              <SelectField label="Категория" id="m-cat" value={form.category} onChange={(v) => { set('category', v); set('subcategory', ''); }} options={[{ value: '', label: '—' }, ...CATEGORY_IDS.map((c) => ({ value: c, label: DETAILING_CATEGORIES[c].label }))]} />
            </div>
            {form.category && DETAILING_CATEGORIES[form.category as keyof typeof DETAILING_CATEGORIES] && (
              <SelectField label="Подкатегория" id="m-subcat" value={form.subcategory} onChange={(v) => set('subcategory', v)} options={[{ value: '', label: '—' }, ...DETAILING_CATEGORIES[form.category as keyof typeof DETAILING_CATEGORIES].subcategories.map((s) => ({ value: s.id, label: s.label }))]} />
            )}
            <div className="field-row2">
              <Field label="Бренд" id="m-brand" value={form.brand} onChange={(v) => set('brand', v)} />
              <Field label="SKU" id="m-sku" value={form.sku} onChange={(v) => set('sku', v)} />
            </div>
            <SelectField
              label="Поставщик"
              id="m-supplier"
              value={form.supplier}
              onChange={(v) => set('supplier', v)}
              options={[{ value: '', label: '—' }, ...suppliersList.map((s) => ({ value: s.name, label: s.name }))]}
            />
            <Field label="Описание" id="m-desc" value={form.description} onChange={(v) => set('description', v)} placeholder="Описание продукта, применение..." />
            <div className="field-row2">
              <Field label="Остаток" id="m-stock" type="number" value={form.stock} onChange={(v) => set('stock', v)} />
              <Field label="Мин. остаток" id="m-min" type="number" value={form.min} onChange={(v) => set('min', v)} />
            </div>
            <div className="field-row2">
              <Field label="Единица" id="m-unit" value={form.unit} onChange={(v) => set('unit', v)} list="dl-inv-unit" listOptions={INVENTORY_UNITS} />
              <Field label="Место хранения" id="m-storage" value={form.storage_location} onChange={(v) => set('storage_location', v)} />
            </div>
            <div className="field-row2">
              <Field label="Себестоимость" id="m-cost" type="number" value={form.unit_cost} onChange={(v) => set('unit_cost', v)} />
              <Field label="Цена продажи" id="m-price" type="number" value={form.selling_price} onChange={(v) => set('selling_price', v)} />
            </div>
            <div className="field-row2">
              <Field label="Партия" id="m-batch" value={form.batch_number} onChange={(v) => set('batch_number', v)} />
              <Field label="Срок годности" id="m-expiry" type="date" value={form.expiry_date} onChange={(v) => set('expiry_date', v)} />
            </div>
            {form.category === 'chemicals' && (
              <>
                <Field label="Класс опасности" id="m-hazard" value={form.hazard_class} onChange={(v) => set('hazard_class', v)} list="dl-hazard-class" listOptions={HAZARD_CLASSES} />
                <Field label="Условия хранения" id="m-storage-req" value={form.storage_requirements} onChange={(v) => set('storage_requirements', v)} />
                <Field label="Инструкция по применению" id="m-usage" value={form.usage_instructions} onChange={(v) => set('usage_instructions', v)} />
                <Field label="Информация о безопасности" id="m-safety" value={form.safety_info} onChange={(v) => set('safety_info', v)} />
              </>
            )}
            {form.category === 'ppf' && (
              <div className="field-row2">
                <Field label="Толщина плёнки" id="m-thickness" value={form.film_thickness} onChange={(v) => set('film_thickness', v)} />
                <Field label="Длина рулона" id="m-roll-len" type="number" value={form.roll_length} onChange={(v) => set('roll_length', v)} />
                <Field label="Ширина рулона" id="m-roll-w" type="number" value={form.roll_width} onChange={(v) => set('roll_width', v)} />
              </div>
            )}
            {(form.category === 'tools' || form.category === 'equipment') && (
              <>
                <Field label="Инв. номер" id="m-equip-id" value={form.equipment_id} onChange={(v) => set('equipment_id', v)} />
                <div className="field-row2">
                  <Field label="Дата покупки" id="m-purchase" type="date" value={form.purchase_date} onChange={(v) => set('purchase_date', v)} />
                  <Field label="Гарантия до" id="m-warranty" type="date" value={form.warranty_until} onChange={(v) => set('warranty_until', v)} />
                </div>
                <div className="field-row2">
                  <Field label="ТО до" id="m-maint" type="date" value={form.maintenance_due} onChange={(v) => set('maintenance_due', v)} />
                  <SelectField label="Ответственный" id="m-staff" value={form.assigned_staff_id} onChange={(v) => set('assigned_staff_id', v)} options={[{ value: '', label: '—' }, ...staffList.map((s) => ({ value: s.id, label: s.full_name }))]} />
                </div>
                <Field label="Состояние" id="m-condition" value={form.condition} onChange={(v) => set('condition', v)} placeholder="Отличное / хорошее / требует ремонта" list="dl-condition" listOptions={EQUIPMENT_CONDITIONS} />
              </>
            )}
            <SelectField label="Активна" id="m-active" value={form.is_active} onChange={(v) => set('is_active', v)} options={[{ value: 'true', label: 'Да' }, { value: 'false', label: 'Нет' }]} />
            {savedEntityId(editing) ? (
              <div className="modal-asset-section">
                <div className="side-field-label">Каталог продукта · изображения и документы (R2)</div>
                <AssetManager
                  entityType="product"
                  entityId={savedEntityId(editing)!}
                  categories={FILE_CATEGORIES.product.map((c) => ({ ...c }))}
                  compact
                />
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '12px 0', fontSize: 12 }}>Сохраните позицию, затем прикрепите документы</div>
            )}
          </>
        )}
      </Modal>
      <AttachmentQuickModal open={attachmentOpen} onClose={() => setAttachmentOpen(false)} />
    </Layout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/overview" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/mfa-challenge" element={<MfaChallengePage />} />
      <Route path="/verify-account" element={<VerifyAccountPage />} />
      <Route path="/set-password" element={<SetPasswordPage />} />
      <Route path="/pay/:invoiceId" element={<PayPage />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <AppContent />
        </ProtectedRoute>
      } />
    </Routes>
  );
}
