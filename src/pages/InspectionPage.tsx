import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAnalyticsVisibility } from '../hooks/useAnalyticsVisibility';
import { AnalyticsToggle } from '../components/dashboard/AnalyticsToggle';
import { X } from 'lucide-react';
import { useLocalQuery } from '../hooks/useLocalData';
import { useToast } from '../contexts/ToastContext';
import { useDataRefresh } from '../contexts/DataRefreshContext';
import { useAuth } from '../contexts/AuthContext';
import { canManageInspections, canViewInspections } from '../lib/permissions';
import { SelectField, Field } from '../components/Modal';
import { db } from '../lib/localdb';
import { fmt, fmtDate, vehicleDisplayName } from '../lib/constants';
import { normalizePipelineStage } from '../lib/workflow';
import { AssetManager } from '../components/AssetManager';
import { resetAppScroll } from '../components/ScrollToTop';
import { InspectionWorkflowBar } from '../components/inspection/InspectionWorkflowBar';
import { InspectionChecklist } from '../components/inspection/InspectionChecklist';
import { DamageMap } from '../components/inspection/DamageMap';
import { InspectionQcCompare } from '../components/inspection/InspectionQcCompare';
import { NavIconPrint, NavIconSend, NavIconZap } from '../components/NavIcons';
import {
  APPROVAL_LABELS,
  EXTERIOR_CHECKLIST,
  INTERIOR_CHECKLIST,
  TECHNICAL_CHECKLIST,
  INSPECTION_MEDIA_CATEGORIES,
  INSPECTION_WORKFLOW_STAGES,
  WORKFLOW_LABELS,
  buildInspectionMailto,
  buildInspectionReportHtml,
  computeInspectionAnalytics,
  emptyInspectionForm,
  parseRecommendedServices,
  suggestServicesFromInspection,
  type InspectionTemplate,
  type InspectionWorkflowStage,
  type RecommendedServiceEntry,
} from '../lib/inspection';
import { PeriodSelector } from '../components/dashboard/PeriodSelector';
import { InspectionDashboard } from '../components/dashboard/PageDashboards';
import { getFinancePeriodRange, type FinancePeriod } from '../lib/analytics';
import type { Inspection, Service, Staff, Vehicle } from '../types/database';

type FormTab = 'exterior' | 'interior' | 'technical' | 'damage' | 'media' | 'services' | 'approval' | 'qc' | 'report';
type PageView = 'dashboard' | 'form' | 'vehicle_history';

const FORM_TABS: { id: FormTab; label: string }[] = [
  { id: 'exterior', label: 'Экстерьер' },
  { id: 'interior', label: 'Салон' },
  { id: 'technical', label: 'Техническое' },
  { id: 'damage', label: 'Повреждения' },
  { id: 'media', label: 'Фото / видео' },
  { id: 'services', label: 'Услуги' },
  { id: 'approval', label: 'Одобрение' },
  { id: 'qc', label: 'QC' },
  { id: 'report', label: 'Отчёт' },
];

export function InspectionPage() {
  const [showCharts, toggleCharts] = useAnalyticsVisibility('inspection');
  const { data: inspections, insert, update, refetch } = useLocalQuery<Inspection>(
    'inspections',
    '*, vehicles(*, customers(*)), staff:inspector_id(*)',
    { orderBy: 'created_at' }
  );
  const { data: vehicles } = useLocalQuery<Vehicle>('vehicles', '*, customers(*)');
  const { data: services } = useLocalQuery<Service>('services', '*', { orderBy: 'name' });
  const { data: staffList } = useLocalQuery<Staff>('staff', '*', { orderBy: 'full_name' });
  const { toast } = useToast();
  const { refresh } = useDataRefresh();
  const { profile } = useAuth();
  const canManage = canManageInspections(profile?.role);
  const canView = canViewInspections(profile?.role);

  const [pageView, setPageView] = useState<PageView>('dashboard');
  const [period, setPeriod] = useState<FinancePeriod>('monthly');
  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [historyVehicleId, setHistoryVehicleId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Inspection | null>(null);
  const [form, setForm] = useState(emptyInspectionForm());
  const [activeTab, setActiveTab] = useState<FormTab>('exterior');
  const [myStaffId, setMyStaffId] = useState<string | null>(null);

  const [filterCustomer, setFilterCustomer] = useState('');
  const [filterPlate, setFilterPlate] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterTechnician, setFilterTechnician] = useState('');

  useEffect(() => {
    if (profile?.id) {
      db.from('staff').select('id').eq('profile_id', profile.id).maybeSingle()
        .then(({ data }) => setMyStaffId(data?.id ?? null));
    }
  }, [profile?.id]);

  useEffect(() => {
    db.from('studio_settings').select('value').eq('key', 'inspection_templates').maybeSingle()
      .then(({ data }) => {
        const val = data?.value;
        setTemplates(Array.isArray(val) ? val as InspectionTemplate[] : []);
      });
  }, []);

  const periodRange = useMemo(() => getFinancePeriodRange(period), [period]);
  const analytics = useMemo(() => computeInspectionAnalytics(inspections, periodRange), [inspections, periodRange]);

  const filteredInspections = useMemo(() => {
    return inspections.filter((insp) => {
      const v = insp.vehicles;
      const c = v?.customers;
      if (filterCustomer && !(c?.full_name ?? '').toLowerCase().includes(filterCustomer.toLowerCase())) return false;
      if (filterPlate && !(v?.registration_number ?? '').toLowerCase().includes(filterPlate.toLowerCase())) return false;
      if (filterDate && !insp.created_at.startsWith(filterDate)) return false;
      if (filterTechnician && insp.inspector_id !== filterTechnician && insp.inspected_by !== filterTechnician) return false;
      return true;
    });
  }, [inspections, filterCustomer, filterPlate, filterDate, filterTechnician]);

  const vehiclesWithoutInspection = vehicles.filter(
    (v) => !inspections.some((i) => i.vehicle_id === v.id && !isInspectionComplete(i))
  );

  function isInspectionComplete(insp: Inspection) {
    return insp.workflow_stage === 'handover_documentation';
  }

  const resolveBookingId = useCallback(async (vehicleId: string) => {
    const { data: bookings } = await db
      .from('bookings')
      .select('id')
      .eq('vehicle_id', vehicleId)
      .not('status', 'in', '("completed","delivered","cancelled")')
      .order('scheduled_at', { ascending: false })
      .limit(1);
    return bookings?.[0]?.id ?? null;
  }, []);

  const startInspection = async (vehicle?: Vehicle) => {
    const bookingId = vehicle ? await resolveBookingId(vehicle.id) : null;
    setEditing(null);
    setForm({ ...emptyInspectionForm(vehicle?.id ?? ''), booking_id: bookingId ?? '' });
    setActiveTab('exterior');
    resetAppScroll();
    setPageView('form');
  };

  const editInspection = (insp: Inspection) => {
    setEditing(insp);
    setForm({
      vehicle_id: insp.vehicle_id,
      booking_id: insp.booking_id ?? '',
      workflow_stage: insp.workflow_stage ?? 'vehicle_arrival',
      approval_status: insp.approval_status ?? 'pending',
      exterior_checks: insp.exterior_checks ?? {},
      interior_checks: insp.interior_checks ?? {},
      technical_checks: insp.technical_checks ?? {},
      damage_map: insp.damage_map ?? [],
      recommended_services: parseRecommendedServices(insp.recommended_services),
      approved_services: parseRecommendedServices(insp.approved_services),
      customer_comments: insp.customer_comments ?? '',
      technician_notes: insp.technician_notes ?? '',
      exterior_condition: insp.exterior_condition ?? '',
      scratches: insp.scratches ?? '',
      paint_condition: insp.paint_condition ?? '',
      interior_condition: insp.interior_condition ?? '',
      existing_damage: insp.existing_damage ?? '',
      customer_requests: insp.customer_requests ?? '',
      template_id: insp.template_id ?? '',
    });
    setActiveTab('exterior');
    resetAppScroll();
    setPageView('form');
  };

  const closeForm = () => {
    resetAppScroll();
    setPageView('dashboard');
    setEditing(null);
  };

  const buildRow = () => ({
    vehicle_id: form.vehicle_id,
    booking_id: form.booking_id || null,
    workflow_stage: form.workflow_stage,
    approval_status: form.approval_status,
    exterior_checks: form.exterior_checks,
    interior_checks: form.interior_checks,
    technical_checks: form.technical_checks,
    damage_map: form.damage_map,
    recommended_services: form.recommended_services,
    approved_services: form.approved_services,
    customer_comments: form.customer_comments || null,
    technician_notes: form.technician_notes || null,
    exterior_condition: form.exterior_condition || null,
    scratches: form.scratches || null,
    paint_condition: form.paint_condition || null,
    interior_condition: form.interior_condition || null,
    existing_damage: form.existing_damage || null,
    customer_requests: form.customer_requests || null,
    template_id: form.template_id || null,
    recommended_quote: form.recommended_services,
    inspector_id: myStaffId,
    inspected_by: myStaffId,
    photos: editing?.photos ?? [],
  });

  const save = async () => {
    if (!form.vehicle_id) { toast('Выберите автомобиль'); return; }
    const row = buildRow();

    if (editing) {
      const err = await update(editing.id, row as Partial<Inspection>);
      if (err) { toast('Ошибка: ' + err); return; }
      toast('Осмотр обновлён');
    } else {
      if (!row.booking_id) {
        row.booking_id = await resolveBookingId(form.vehicle_id);
      }
      const err = await insert(row as Partial<Inspection>);
      if (err) { toast('Ошибка: ' + err); return; }
      await db.from('vehicles').update({ pipeline_stage: 'Осмотр' }).eq('id', form.vehicle_id);
      if (row.booking_id) {
        await db.from('bookings').update({ status: 'inspection' }).eq('id', row.booking_id);
      }
      toast('Осмотр создан');
    }
    await refetch();
    refresh();
    closeForm();
  };

  const setApproval = async (status: 'pending' | 'approved' | 'rejected') => {
    const patch: Partial<typeof form> = { approval_status: status };
    if (status === 'approved') {
      patch.approved_services = form.recommended_services;
    }
    setForm((f) => ({ ...f, ...patch }));
    if (editing) {
      const updates: Partial<Inspection> = {
        approval_status: status,
        approved_at: status === 'approved' ? new Date().toISOString() : null,
        approved_services: status === 'approved' ? form.recommended_services : editing.approved_services,
      };
      if (status === 'approved') {
        await db.from('vehicles').update({ pipeline_stage: 'Ожидает одобрения' }).eq('id', editing.vehicle_id);
        // upsell approved at inspection joins the order and raises its total (and the invoice built from it)
        if (editing.booking_id && form.recommended_services.length) {
          const { data: bk } = await db.from('bookings').select('extra_items').eq('id', editing.booking_id).maybeSingle();
          const current = ((bk as { extra_items?: { name: string; service_id?: string | null }[] } | null)?.extra_items ?? []);
          const fresh = form.recommended_services
            .filter((sv) => !current.some((x) => (sv.service_id && x.service_id === sv.service_id) || x.name === sv.name))
            .map((sv) => ({ service_id: sv.service_id ?? null, name: sv.name, price: Number(sv.price ?? 0), quantity: 1, source: 'inspection' as const }));
          if (fresh.length) {
            await db.from('bookings').update({ extra_items: [...current, ...fresh] }).eq('id', editing.booking_id);
            toast(`К заказу добавлено: ${fresh.map((x) => x.name).join(', ')}`);
          }
        }
      }
      const err = await update(editing.id, updates);
      if (err) toast('Ошибка: ' + err);
      else {
        toast(`Статус: ${APPROVAL_LABELS[status]}`);
        await refetch();
        refresh();
      }
    }
  };

  const advanceWorkflow = (stage: InspectionWorkflowStage) => {
    setForm((f) => ({ ...f, workflow_stage: stage }));
  };

  const addRecommendedService = () => {
    setForm((f) => ({
      ...f,
      recommended_services: [...f.recommended_services, { name: '', price: 0, notes: '' }],
    }));
  };

  const updateRecommendedService = (idx: number, patch: Partial<RecommendedServiceEntry>) => {
    setForm((f) => {
      const next = [...f.recommended_services];
      next[idx] = { ...next[idx], ...patch };
      return { ...f, recommended_services: next };
    });
  };

  const removeRecommendedService = (idx: number) => {
    setForm((f) => ({
      ...f,
      recommended_services: f.recommended_services.filter((_, i) => i !== idx),
    }));
  };

  const selectServiceTemplate = (idx: number, serviceId: string) => {
    const svc = services.find((s) => s.id === serviceId);
    if (!svc) return;
    updateRecommendedService(idx, { service_id: svc.id, name: svc.name, price: svc.base_price ?? svc.price });
  };

  const autoSuggestServices = () => {
    const draft = { ...editing, ...buildRow(), damage_map: form.damage_map, exterior_checks: form.exterior_checks } as Inspection;
    const suggested = suggestServicesFromInspection(draft, services);
    if (!suggested.length) { toast('Рекомендации не найдены'); return; }
    setForm((f) => ({ ...f, recommended_services: suggested }));
    toast(`Добавлено ${suggested.length} рекомендаций из каталога`);
  };

  const applyTemplate = (templateId: string) => {
    const tpl = templates.find((t) => t.id === templateId);
    if (!tpl) return;
    setForm((f) => ({
      ...f,
      template_id: templateId,
      exterior_checks: { ...f.exterior_checks, ...tpl.checklist.exterior },
      interior_checks: { ...f.interior_checks, ...tpl.checklist.interior },
      technical_checks: { ...f.technical_checks, ...tpl.checklist.technical },
    }));
    toast(`Шаблон «${tpl.name}» применён`);
  };

  const saveTemplate = async () => {
    if (!templateName.trim() || !canManage) return;
    const tpl: InspectionTemplate = {
      id: `tpl_${Date.now()}`,
      name: templateName.trim(),
      checklist: {
        exterior: form.exterior_checks,
        interior: form.interior_checks,
        technical: form.technical_checks,
      },
    };
    const next = [...templates, tpl];
    const { error } = await db.from('studio_settings').upsert({ key: 'inspection_templates', value: next });
    if (error) toast('Ошибка: ' + error.message);
    else { setTemplates(next); setTemplateName(''); toast('Шаблон сохранён'); }
  };

  const openVehicleHistory = (vehicleId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setHistoryVehicleId(vehicleId);
    resetAppScroll();
    setPageView('vehicle_history');
  };

  const vehicleHistory = useMemo(
    () => inspections.filter((i) => i.vehicle_id === historyVehicleId).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [inspections, historyVehicleId]
  );

  const printReport = () => {
    const vehicle = vehicles.find((v) => v.id === form.vehicle_id) ?? editing?.vehicles;
    const inspector = staffList.find((s) => s.id === (editing?.inspector_id ?? myStaffId));
    const html = buildInspectionReportHtml(
      { ...editing, ...buildRow(), id: editing?.id ?? '', created_at: editing?.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString(), approved_at: editing?.approved_at ?? null } as Inspection,
      vehicle,
      inspector?.full_name ?? '',
      services
    );
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 400);
    }
  };

  const sendToCustomer = () => {
    const vehicle = vehicles.find((v) => v.id === form.vehicle_id) ?? editing?.vehicles;
    const email = vehicle?.customers?.email?.trim();
    if (!email) { toast('У клиента не указан email'); return; }
    const insp = { ...editing, ...buildRow(), vehicles: vehicle } as Inspection;
    window.location.href = buildInspectionMailto(insp, vehicle, email);
    toast('Откройте почтовый клиент для отправки');
  };

  const selectedVehicle = vehicles.find((v) => v.id === form.vehicle_id);

  if (!canView) {
    return <div className="empty-state">Недостаточно прав для просмотра осмотров</div>;
  }

  if (pageView === 'vehicle_history' && historyVehicleId) {
    const v = vehicles.find((x) => x.id === historyVehicleId);
    return (
      <>
        <div className="header-row">
          <div>
            <div className="eyebrow"><span className="dot"></span>История осмотров</div>
            <h1 className="page-title">{v ? vehicleDisplayName(v) : 'Автомобиль'}</h1>
            <p className="page-sub">{v?.registration_number} · {vehicleHistory.length} осмотров</p>
          </div>
          <div className="tag" onClick={() => { resetAppScroll(); setPageView('dashboard'); }}>← Назад</div>
        </div>
        {vehicleHistory.map((insp) => (
          <div className="integration-card" key={insp.id} onClick={() => editInspection(insp)} style={{ cursor: 'pointer' }}>
            <div>
              <div className="integration-name">{fmtDate(insp.created_at)}</div>
              <div className="integration-desc">
                {WORKFLOW_LABELS[insp.workflow_stage] ?? insp.workflow_stage} · {APPROVAL_LABELS[insp.approval_status]}
                {insp.staff?.full_name ? ` · ${insp.staff.full_name}` : ''}
              </div>
            </div>
          </div>
        ))}
        {!vehicleHistory.length && <div className="empty-state">Осмотров для этого авто нет</div>}
      </>
    );
  }

  if (pageView === 'form') {
    return (
      <div className="inspection-form-page">
        <div className="header-row">
          <div>
            <div className="eyebrow"><span className="dot"></span>Осмотр · {editing ? 'редактирование' : 'новый'}</div>
            <h1 className="page-title">{selectedVehicle ? vehicleDisplayName(selectedVehicle) : 'Новый осмотр'}</h1>
            <p className="page-sub">{selectedVehicle?.customers?.full_name} · {selectedVehicle?.registration_number ?? '—'}</p>
          </div>
          <div className="tag-row">
            <div className="tag" onClick={closeForm}>← Назад</div>
            {canManage && <div className="tag add" onClick={save}>Сохранить</div>}
          </div>
        </div>

        <InspectionWorkflowBar
          stage={form.workflow_stage}
          onStageChange={canManage ? advanceWorkflow : undefined}
          readonly={!canManage}
        />

        <div className="inspection-form-tabs seg seg-scroll" style={{ marginBottom: 20 }}>
          {FORM_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`seg-btn ${activeTab === t.id ? 'active' : ''}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="inspection-form-body">
          {!editing && (
            <SelectField
              label="Автомобиль"
              id="vehicle"
              value={form.vehicle_id}
              onChange={(v) => setForm((f) => ({ ...f, vehicle_id: v }))}
              options={vehicles.map((v) => ({ value: v.id, label: `${vehicleDisplayName(v)} · ${v.registration_number ?? ''}` }))}
            />
          )}

          {activeTab === 'exterior' && (
            <>
              {templates.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div className="side-field-label">Шаблон чек-листа</div>
                  <select className="field-select" value={form.template_id ?? ''} onChange={(e) => applyTemplate(e.target.value)} disabled={!canManage}>
                    <option value="">— без шаблона —</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              <InspectionChecklist
              fields={EXTERIOR_CHECKLIST}
              data={form.exterior_checks}
              onChange={(exterior_checks) => setForm((f) => ({ ...f, exterior_checks }))}
            />
            </>
          )}
          {activeTab === 'interior' && (
            <InspectionChecklist
              fields={INTERIOR_CHECKLIST}
              data={form.interior_checks}
              onChange={(interior_checks) => setForm((f) => ({ ...f, interior_checks }))}
            />
          )}
          {activeTab === 'technical' && (
            <>
              <InspectionChecklist
                fields={TECHNICAL_CHECKLIST}
                data={form.technical_checks}
                onChange={(technical_checks) => setForm((f) => ({ ...f, technical_checks }))}
              />
              <Field
                label="Комментарии клиента"
                id="customer_comments"
                value={form.customer_comments}
                onChange={(v) => setForm((f) => ({ ...f, customer_comments: v }))}
              />
              <Field
                label="Заметки техника"
                id="technician_notes"
                value={form.technician_notes}
                onChange={(v) => setForm((f) => ({ ...f, technician_notes: v }))}
              />
            </>
          )}
          {activeTab === 'damage' && (
            <DamageMap
              entries={form.damage_map}
              onChange={(damage_map) => setForm((f) => ({ ...f, damage_map }))}
              vehicleId={form.vehicle_id || undefined}
              bookingId={form.booking_id || null}
              vehicleBrand={selectedVehicle?.brand}
              vehicleModel={selectedVehicle?.model}
            />
          )}
          {activeTab === 'media' && form.vehicle_id && (
            <AssetManager
              entityType="vehicle"
              entityId={form.vehicle_id}
              bookingId={form.booking_id || null}
              categories={[...INSPECTION_MEDIA_CATEGORIES]}
              title="Медиа осмотра (локально)"
            />
          )}
          {activeTab === 'services' && (
            <div className="inspection-services">
              {canManage && (
                <div className="tag add tag-with-icon" style={{ marginBottom: 12 }} onClick={autoSuggestServices}><NavIconZap size={16} /> Авто-рекомендации из каталога</div>
              )}
              {form.recommended_services.map((rs, idx) => (
                <div key={idx} className="inspection-service-row">
                  <select
                    className="field-select"
                    value={rs.service_id ?? ''}
                    onChange={(e) => selectServiceTemplate(idx, e.target.value)}
                  >
                    <option value="">Выберите услугу…</option>
                    {services.filter((s) => s.is_active).map((s) => (
                      <option key={s.id} value={s.id}>{s.name} — {fmt(s.base_price ?? s.price)}</option>
                    ))}
                  </select>
                  <input
                    className="field-input"
                    placeholder="Название"
                    value={rs.name}
                    onChange={(e) => updateRecommendedService(idx, { name: e.target.value })}
                  />
                  <input
                    className="field-input"
                    type="number"
                    placeholder="Цена"
                    value={rs.price ?? ''}
                    onChange={(e) => updateRecommendedService(idx, { price: Number(e.target.value) || 0 })}
                  />
                  <span className="side-action del" onClick={() => removeRecommendedService(idx)} role="button"><X size={12} strokeWidth={1.75} /></span>
                </div>
              ))}
              <div className="tag add" onClick={addRecommendedService}>+ Добавить услугу</div>
              {canManage && (
                <div style={{ marginTop: 20 }}>
                  <div className="side-field-label">Сохранить как шаблон</div>
                  <div className="field-row2">
                    <input className="field-input" placeholder="Название шаблона" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
                    <div className="tag ghost" onClick={saveTemplate}>Сохранить шаблон</div>
                  </div>
                </div>
              )}
              <div className="cell-sub" style={{ marginTop: 12 }}>
                Итого: {fmt(form.recommended_services.reduce((s, r) => s + (r.price ?? 0), 0))}
              </div>
            </div>
          )}
          {activeTab === 'approval' && (
            <div className="inspection-approval">
              <div className="cell-title">Статус: {APPROVAL_LABELS[form.approval_status]}</div>
              {editing?.approved_at && <div className="cell-sub">Одобрено: {fmtDate(editing.approved_at)}</div>}
              {canManage && (
                <div className="tag-row" style={{ marginTop: 16 }}>
                  <div className="tag" onClick={() => setApproval('pending')}>Запросить одобрение</div>
                  <div className="tag green" onClick={() => setApproval('approved')}>Одобрено</div>
                  <div className="tag" style={{ borderColor: 'var(--red)' }} onClick={() => setApproval('rejected')}>Отклонено</div>
                </div>
              )}
              {form.approved_services.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="side-field-label">Одобренные услуги</div>
                  {form.approved_services.map((s, i) => (
                    <div key={i} className="cell-sub">{s.name} · {s.price != null ? fmt(s.price) : '—'}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          {activeTab === 'qc' && form.vehicle_id && (
            <InspectionQcCompare vehicleId={form.vehicle_id} bookingId={form.booking_id || null} />
          )}
          {activeTab === 'report' && (
            <div className="inspection-report-actions">
              <div className="tag-row">
                <div className="tag add tag-with-icon" onClick={printReport}><NavIconPrint size={16} /> Печать / PDF</div>
                <div className="tag add tag-with-icon" onClick={sendToCustomer}><NavIconSend size={16} /> Отправить клиенту</div>
              </div>
              <p className="cell-sub" style={{ marginTop: 12 }}>
                Отчёт включает чек-листы, карту повреждений, рекомендации и стоимость.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="header-row">
        <div>
          <div className="eyebrow"><span className="dot"></span>Приёмка · осмотр</div>
          <h1 className="page-title">Осмотр автомобилей</h1>
          <p className="page-sub">9-этапный workflow, цифровой чек-лист, карта повреждений, R2-медиа, QC и отчёты.</p>
        </div>
        <div className="tag-row">
          <AnalyticsToggle visible={showCharts} onToggle={toggleCharts} />
          {canManage && <div className="tag add" onClick={() => startInspection()}>+ Новый осмотр</div>}
        </div>
      </div>

      {showCharts && <PeriodSelector value={period} onChange={setPeriod} />}

      {showCharts && <InspectionDashboard stats={analytics} waitingVehicles={vehiclesWithoutInspection.length} />}

      {canManage && (
        <div className="section-block" style={{ marginBottom: 24 }}>
          <div className="section-head"><div className="section-title">Шаблоны осмотра ({templates.length})</div></div>
          {templates.map((t) => (
            <div className="integration-card" key={t.id}>
              <div className="integration-name">{t.name}</div>
            </div>
          ))}
          {!templates.length && <div className="cell-sub">Шаблоны создаются при сохранении чек-листа в форме осмотра</div>}
        </div>
      )}

      <div className="section-block">
        <div className="section-head"><div className="section-title">Поиск и история</div></div>
        <div className="inspection-filters">
          <input className="search-input" placeholder="Клиент…" value={filterCustomer} onChange={(e) => setFilterCustomer(e.target.value)} />
          <input className="search-input" placeholder="Гос. номер…" value={filterPlate} onChange={(e) => setFilterPlate(e.target.value)} />
          <input className="search-input" type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} />
          <select className="field-select" value={filterTechnician} onChange={(e) => setFilterTechnician(e.target.value)}>
            <option value="">Все техники</option>
            {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>
      </div>

      {vehiclesWithoutInspection.length > 0 && (
        <div className="section-block">
          <div className="section-head"><div className="section-title">Ожидают осмотра ({vehiclesWithoutInspection.length})</div></div>
          {vehiclesWithoutInspection.slice(0, 8).map((v) => (
            <div className="inspection-pending-row" key={v.id}>
              <div className="inspection-pending-main">
                <div className="booking-car">{vehicleDisplayName(v)}</div>
                <div className="booking-client">{v.customers?.full_name} · {v.registration_number}</div>
              </div>
              <span className="status-badge planned inspection-stage-badge">{normalizePipelineStage(v.pipeline_stage) || 'Осмотр'}</span>
              {canManage && <div className="tag add" onClick={() => startInspection(v)}>Начать осмотр</div>}
            </div>
          ))}
        </div>
      )}

      <div className="section-head"><div className="section-title">История осмотров ({filteredInspections.length})</div></div>
      {filteredInspections.map((insp) => (
        <div className="integration-card inspection-history-card" key={insp.id} onClick={() => editInspection(insp)} style={{ cursor: 'pointer' }}>
          <div className="inspection-history-main">
            <div className="integration-name">{insp.vehicles ? vehicleDisplayName(insp.vehicles) : 'Автомобиль'}</div>
            <div className="integration-desc">
              {insp.vehicles?.customers?.full_name} · {insp.vehicles?.registration_number} · {fmtDate(insp.created_at)}
              {insp.staff?.full_name ? ` · ${insp.staff.full_name}` : ''}
            </div>
            <div className="inspection-history-meta">
              <span className="tag">{WORKFLOW_LABELS[insp.workflow_stage] ?? insp.workflow_stage}</span>
              <span className={`tag ${insp.approval_status === 'approved' ? 'green' : insp.approval_status === 'rejected' ? '' : ''}`}>
                {APPROVAL_LABELS[insp.approval_status]}
              </span>
              {(insp.damage_map?.length ?? 0) > 0 && <span className="cell-sub">{insp.damage_map.length} поврежд.</span>}
              <span className="tag ghost" onClick={(e) => openVehicleHistory(insp.vehicle_id, e)}>История авто</span>
            </div>
          </div>
          <div className="inspection-history-progress" aria-hidden="true">
            <div className="workflow-bar">
              {INSPECTION_WORKFLOW_STAGES.map((s, i) => (
                <span
                  key={s.id}
                  className={`workflow-step ${i <= (INSPECTION_WORKFLOW_STAGES.findIndex((x) => x.id === insp.workflow_stage)) ? 'done' : ''}`}
                  title={s.label}
                />
              ))}
            </div>
          </div>
        </div>
      ))}
      {!filteredInspections.length && <div className="empty-state">Осмотров не найдено.</div>}
    </>
  );
}
