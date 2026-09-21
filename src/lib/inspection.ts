import { fmt, fmtDate, vehicleDisplayName } from './constants';
import { normalizeServiceCategory } from './services';
import type { Inspection, Service, Vehicle } from '../types/database';

export const INSPECTION_WORKFLOW_STAGES = [
  { id: 'vehicle_arrival', label: 'Приём авто' },
  { id: 'customer_handover', label: 'Передача клиенту' },
  { id: 'initial_inspection', label: 'Первичный осмотр' },
  { id: 'damage_assessment', label: 'Оценка повреждений' },
  { id: 'service_recommendation', label: 'Рекомендации' },
  { id: 'customer_approval', label: 'Одобрение клиента' },
  { id: 'work_authorisation', label: 'Авторизация работ' },
  { id: 'inspection_completion', label: 'Завершение осмотра' },
  { id: 'handover_documentation', label: 'Документы выдачи' },
] as const;

export type InspectionWorkflowStage = (typeof INSPECTION_WORKFLOW_STAGES)[number]['id'];
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type DamageSeverity = 'minor' | 'moderate' | 'severe';

export interface CheckItemValue {
  checked?: boolean;
  rating?: number;
  condition?: string;
  notes?: string;
}

export type ChecklistData = Record<string, CheckItemValue>;

export interface DamageEntry {
  area: string;
  severity: DamageSeverity;
  notes: string;
  photo_keys: string[];
}

export interface RecommendedServiceEntry {
  service_id?: string;
  name: string;
  price?: number;
  notes?: string;
}

export const INSPECTION_MEDIA_CATEGORIES = [
  { id: 'before_photo', label: 'Фото до' },
  { id: 'damage', label: 'Повреждения' },
  { id: 'inspection', label: 'Осмотр' },
  { id: 'after_photo', label: 'Фото после' },
  { id: 'video', label: 'Видео' },
] as const;

/**
 * Damage zones. The original ids (front_bumper … trunk) are unchanged so
 * existing inspections keep working; new ids only add finer detail.
 */
export const DAMAGE_AREAS = [
  { id: 'front_bumper', label: 'Передний бампер' },
  { id: 'bonnet', label: 'Капот' },
  { id: 'windshield', label: 'Лобовое стекло' },
  { id: 'roof', label: 'Крыша' },
  { id: 'rear_window', label: 'Заднее стекло' },
  { id: 'trunk', label: 'Багажник' },
  { id: 'rear_bumper', label: 'Задний бампер' },
  { id: 'front_left_fender', label: 'Переднее левое крыло' },
  { id: 'front_right_fender', label: 'Переднее правое крыло' },
  { id: 'front_left_door', label: 'Передняя левая дверь' },
  { id: 'front_right_door', label: 'Передняя правая дверь' },
  { id: 'rear_left_door', label: 'Задняя левая дверь' },
  { id: 'rear_right_door', label: 'Задняя правая дверь' },
  { id: 'rear_left_quarter', label: 'Заднее левое крыло' },
  { id: 'rear_right_quarter', label: 'Заднее правое крыло' },
  { id: 'left_side', label: 'Левая сторона (порог)' },
  { id: 'right_side', label: 'Правая сторона (порог)' },
  { id: 'left_mirror', label: 'Левое зеркало' },
  { id: 'right_mirror', label: 'Правое зеркало' },
  { id: 'front_left_wheel', label: 'Переднее левое колесо' },
  { id: 'front_right_wheel', label: 'Переднее правое колесо' },
  { id: 'rear_left_wheel', label: 'Заднее левое колесо' },
  { id: 'rear_right_wheel', label: 'Заднее правое колесо' },
] as const;

export const SEVERITY_LABELS: Record<DamageSeverity, string> = {
  minor: 'Незначительное',
  moderate: 'Среднее',
  severe: 'Серьёзное',
};

export const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  pending: 'Ожидает',
  approved: 'Одобрено',
  rejected: 'Отклонено',
};

export const WORKFLOW_LABELS = Object.fromEntries(
  INSPECTION_WORKFLOW_STAGES.map((s) => [s.id, s.label])
) as Record<InspectionWorkflowStage, string>;

export interface ChecklistFieldDef {
  key: string;
  label: string;
  type: 'checkbox' | 'rating' | 'select' | 'notes';
  options?: { value: string; label: string }[];
}

export const EXTERIOR_CHECKLIST: ChecklistFieldDef[] = [
  { key: 'paint', label: 'ЛКП / краска', type: 'rating' },
  { key: 'scratches', label: 'Царапины', type: 'select', options: [
    { value: 'none', label: 'Нет' }, { value: 'light', label: 'Лёгкие' }, { value: 'deep', label: 'Глубокие' },
  ]},
  { key: 'swirls', label: 'Паутинки / голogram', type: 'select', options: [
    { value: 'none', label: 'Нет' }, { value: 'minor', label: 'Незначительные' }, { value: 'visible', label: 'Заметные' },
  ]},
  { key: 'chips', label: 'Сколы', type: 'select', options: [
    { value: 'none', label: 'Нет' }, { value: 'few', label: 'Единичные' }, { value: 'many', label: 'Многочисленные' },
  ]},
  { key: 'dents', label: 'Вмятины', type: 'select', options: [
    { value: 'none', label: 'Нет' }, { value: 'minor', label: 'Мелкие' }, { value: 'major', label: 'Крупные' },
  ]},
  { key: 'glass', label: 'Стекло', type: 'rating' },
  { key: 'wheels', label: 'Диски / колёса', type: 'rating' },
  { key: 'lights', label: 'Фары / фонари', type: 'checkbox' },
  { key: 'trim', label: 'Молдинги / trim', type: 'rating' },
  { key: 'exterior_notes', label: 'Примечания экстерьера', type: 'notes' },
];

export const INTERIOR_CHECKLIST: ChecklistFieldDef[] = [
  { key: 'seats', label: 'Сиденья', type: 'rating' },
  { key: 'dashboard', label: 'Панель / приборы', type: 'rating' },
  { key: 'steering', label: 'Руль', type: 'rating' },
  { key: 'carpets', label: 'Ковролин', type: 'rating' },
  { key: 'mats', label: 'Коврики', type: 'checkbox' },
  { key: 'doors', label: 'Дверные карты', type: 'rating' },
  { key: 'plastics', label: 'Пластик', type: 'rating' },
  { key: 'odour', label: 'Запах', type: 'select', options: [
    { value: 'none', label: 'Нет' }, { value: 'mild', label: 'Слабый' }, { value: 'strong', label: 'Сильный' },
  ]},
  { key: 'interior_damage', label: 'Повреждения салона', type: 'notes' },
  { key: 'interior_notes', label: 'Примечания салона', type: 'notes' },
];

export const TECHNICAL_CHECKLIST: ChecklistFieldDef[] = [
  { key: 'modifications', label: 'Модификации', type: 'notes' },
  { key: 'previous_treatments', label: 'Предыдущие обработки', type: 'notes' },
  { key: 'ceramic', label: 'Керамика', type: 'select', options: [
    { value: 'none', label: 'Нет' }, { value: 'partial', label: 'Частично' }, { value: 'full', label: 'Полное покрытие' },
  ]},
  { key: 'ppf', label: 'PPF / антигравийная плёнка', type: 'select', options: [
    { value: 'none', label: 'Нет' }, { value: 'partial', label: 'Частично' }, { value: 'full', label: 'Полностью' },
  ]},
  { key: 'accessories', label: 'Аксессуары', type: 'notes' },
  { key: 'special_requests', label: 'Особые пожелания', type: 'notes' },
  { key: 'technical_notes', label: 'Технические примечания', type: 'notes' },
];

export function parseChecklist(raw: unknown): ChecklistData {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as ChecklistData;
  return {};
}

export function parseDamageMap(raw: unknown): DamageEntry[] {
  if (Array.isArray(raw)) return raw as DamageEntry[];
  return [];
}

export function parseRecommendedServices(raw: unknown): RecommendedServiceEntry[] {
  if (Array.isArray(raw)) return raw as RecommendedServiceEntry[];
  return [];
}

export function workflowStageIndex(stage: string): number {
  return INSPECTION_WORKFLOW_STAGES.findIndex((s) => s.id === stage);
}

export function isInspectionComplete(stage: string): boolean {
  return stage === 'handover_documentation';
}

export function computeInspectionAnalytics(inspections: Inspection[], range?: { start: Date; end: Date }) {
  const filtered = range
    ? inspections.filter((i) => {
        const t = new Date(i.created_at).getTime();
        return t >= range.start.getTime() && t <= range.end.getTime();
      })
    : inspections;

  const total = filtered.length;
  const completed = filtered.filter((i) => isInspectionComplete(i.workflow_stage ?? '')).length;
  const pendingApprovals = filtered.filter((i) => i.approval_status === 'pending').length;
  const approved = filtered.filter((i) => i.approval_status === 'approved').length;

  const durations: number[] = [];
  for (const i of filtered) {
    const start = new Date(i.created_at).getTime();
    const end = i.approved_at ? new Date(i.approved_at).getTime() : new Date(i.updated_at).getTime();
    if (end > start) durations.push((end - start) / 3600000);
  }
  const avgHours = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  const issueCounts: Record<string, number> = {};
  for (const i of filtered) {
    for (const d of parseDamageMap(i.damage_map)) {
      issueCounts[d.area] = (issueCounts[d.area] ?? 0) + 1;
    }
  }
  const commonIssues = Object.entries(issueCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([area, count]) => ({
      area: DAMAGE_AREAS.find((a) => a.id === area)?.label ?? area,
      count,
    }));

  const conversionRate = total ? Math.round((approved / total) * 100) : 0;
  const recommendedTotal = filtered.reduce((s, i) => {
    return s + parseRecommendedServices(i.recommended_services).reduce((a, r) => a + (r.price ?? 0), 0);
  }, 0);

  return { total, completed, pendingApprovals, avgHours, commonIssues, conversionRate, approved, recommendedTotal };
}

export function buildInspectionReportHtml(
  insp: Inspection,
  vehicle: Vehicle | undefined,
  inspectorName: string,
  _services: Service[]
): string {
  const customer = vehicle?.customers;
  const exterior = parseChecklist(insp.exterior_checks);
  const interior = parseChecklist(insp.interior_checks);
  const technical = parseChecklist(insp.technical_checks);
  const damage = parseDamageMap(insp.damage_map);
  const recommended = parseRecommendedServices(insp.recommended_services);
  const totalCost = recommended.reduce((s, r) => s + (r.price ?? 0), 0);

  const checklistRows = (fields: ChecklistFieldDef[], data: ChecklistData) =>
    fields.filter((f) => f.type !== 'notes').map((f) => {
      const v = data[f.key];
      let val = '—';
      if (f.type === 'checkbox') val = v?.checked ? 'Да' : 'Нет';
      else if (f.type === 'rating') val = v?.rating ? `${v.rating}/5` : '—';
      else if (f.type === 'select') val = f.options?.find((o) => o.value === v?.condition)?.label ?? v?.condition ?? '—';
      return `<tr><td>${f.label}</td><td>${val}</td><td>${v?.notes ?? ''}</td></tr>`;
    }).join('');

  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>Отчёт осмотра</title>
<style>
@page { size: A4; margin: 18mm 15mm; }
* { box-sizing: border-box; }
body{font-family:'Inter',system-ui,-apple-system,sans-serif;padding:32px 40px;color:#111;max-width:900px;margin:0 auto;line-height:1.45;font-size:13px}
h1{font-size:22px;margin:0 0 4px;font-weight:700;letter-spacing:-0.02em}
.subtitle{font-size:12px;color:#666;margin-bottom:24px}
h2{font-size:11px;margin:24px 0 8px;text-transform:uppercase;letter-spacing:.1em;color:#444;font-weight:600;border-bottom:1px solid #e5e5e5;padding-bottom:6px}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;font-size:12px;margin-bottom:20px;background:#fafafa;border:1px solid #eee;border-radius:8px;padding:14px 16px}
.meta strong{color:#333;font-weight:600}
table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px;page-break-inside:avoid}
th,td{border:1px solid #ddd;padding:7px 10px;text-align:left;vertical-align:top}
th{background:#f0f0f0;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
tr:nth-child(even) td{background:#fafafa}
.total{font-size:15px;font-weight:700;margin-top:10px;padding:10px 14px;background:#111;color:#fff;border-radius:6px;display:inline-block}
.notes{font-size:12px;color:#444;margin:8px 0;padding:10px;background:#f9f9f9;border-left:3px solid #ccc}
.footer{margin-top:36px;padding-top:12px;border-top:1px solid #ddd;font-size:10px;color:#888}
@media print{
  body{padding:0;max-width:none;font-size:11px}
  h2{page-break-after:avoid}
  table{page-break-inside:auto}
  tr{page-break-inside:avoid;page-break-after:auto}
  .total{-webkit-print-color-adjust:exact;print-color-adjust:exact}
}
</style></head><body>
<h1>Отчёт осмотра</h1>
<div class="subtitle">Unique Detailing · Unique Operations</div>
<div class="meta">
  <div><strong>Клиент:</strong> ${customer?.full_name ?? '—'}</div>
  <div><strong>Email:</strong> ${customer?.email ?? '—'}</div>
  <div><strong>Автомобиль:</strong> ${vehicle ? vehicleDisplayName(vehicle) : '—'}</div>
  <div><strong>Гос. номер:</strong> ${vehicle?.registration_number ?? '—'}</div>
  <div><strong>Дата осмотра:</strong> ${fmtDate(insp.created_at)}</div>
  <div><strong>Инспектор:</strong> ${inspectorName || '—'}</div>
  <div><strong>Этап:</strong> ${WORKFLOW_LABELS[insp.workflow_stage as InspectionWorkflowStage] ?? insp.workflow_stage}</div>
  <div><strong>Одобрение:</strong> ${APPROVAL_LABELS[insp.approval_status as ApprovalStatus] ?? insp.approval_status}</div>
</div>
<h2>Экстерьер</h2><table><thead><tr><th>Пункт</th><th>Оценка</th><th>Примечания</th></tr></thead><tbody>${checklistRows(EXTERIOR_CHECKLIST, exterior)}</tbody></table>
<h2>Салон</h2><table><thead><tr><th>Пункт</th><th>Оценка</th><th>Примечания</th></tr></thead><tbody>${checklistRows(INTERIOR_CHECKLIST, interior)}</tbody></table>
<h2>Техническое</h2><table><thead><tr><th>Пункт</th><th>Значение</th><th>Примечания</th></tr></thead><tbody>${checklistRows(TECHNICAL_CHECKLIST, technical)}</tbody></table>
<h2>Карта повреждений</h2>
${damage.length ? `<table><thead><tr><th>Зона</th><th>Серьёзность</th><th>Примечания</th></tr></thead><tbody>
${damage.map((d) => `<tr><td>${DAMAGE_AREAS.find((a) => a.id === d.area)?.label ?? d.area}</td><td>${SEVERITY_LABELS[d.severity]}</td><td>${d.notes}</td></tr>`).join('')}
</tbody></table>` : '<p>Повреждений не зафиксировано.</p>'}
<h2>Рекомендуемые услуги</h2>
${recommended.length ? `<table><thead><tr><th>Услуга</th><th>Стоимость</th><th>Примечания</th></tr></thead><tbody>
${recommended.map((r) => `<tr><td>${r.name}</td><td>${r.price != null ? fmt(r.price) : '—'}</td><td>${r.notes ?? ''}</td></tr>`).join('')}
</tbody></table><div class="total">Итого: ${fmt(totalCost)}</div>` : '<p>Рекомендации не добавлены.</p>'}
${insp.customer_comments ? `<h2>Комментарии клиента</h2><div class="notes">${insp.customer_comments}</div>` : ''}
${insp.technician_notes ? `<h2>Заметки техника</h2><div class="notes">${insp.technician_notes}</div>` : ''}
<div class="footer">Сгенерировано ${new Date().toLocaleString('ru-RU')} · Unique Operations</div>
</body></html>`;
}

export function buildInspectionMailto(
  insp: Inspection,
  vehicle: Vehicle | undefined,
  email: string
): string {
  const recommended = parseRecommendedServices(insp.recommended_services);
  const totalCost = recommended.reduce((s, r) => s + (r.price ?? 0), 0);
  const damage = parseDamageMap(insp.damage_map);
  const body = [
    `Здравствуйте, ${vehicle?.customers?.full_name ?? ''}!`,
    '',
    'Краткий отчёт осмотра вашего автомобиля:',
    `${vehicle ? vehicleDisplayName(vehicle) : 'Автомобиль'} · ${vehicle?.registration_number ?? ''}`,
    `Дата: ${fmtDate(insp.created_at)}`,
    `Этап: ${WORKFLOW_LABELS[insp.workflow_stage as InspectionWorkflowStage] ?? insp.workflow_stage}`,
    `Статус одобрения: ${APPROVAL_LABELS[insp.approval_status as ApprovalStatus] ?? insp.approval_status}`,
    '',
    damage.length ? `Зафиксировано повреждений: ${damage.length}` : 'Критических повреждений не выявлено.',
    recommended.length ? `Рекомендуемые услуги (${recommended.length}):` : '',
    ...recommended.map((r) => `• ${r.name}${r.price != null ? ` — ${fmt(r.price)}` : ''}`),
    totalCost ? `\nОриентировочная стоимость: ${fmt(totalCost)}` : '',
    '',
    'Полный отчёт доступен в студии. С уважением, Unique Detailing',
  ].filter(Boolean).join('\n');

  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Отчёт осмотра — ${vehicle ? vehicleDisplayName(vehicle) : 'Unique Detailing'}`)}&body=${encodeURIComponent(body)}`;
}

export interface InspectionTemplate {
  id: string;
  name: string;
  checklist: {
    exterior?: ChecklistData;
    interior?: ChecklistData;
    technical?: ChecklistData;
  };
}

export function suggestServicesFromInspection(
  insp: Inspection,
  services: Service[]
): RecommendedServiceEntry[] {
  const damage = parseDamageMap(insp.damage_map);
  const suggestions: RecommendedServiceEntry[] = [];
  const exterior = parseChecklist(insp.exterior_checks);

  if (damage.length > 0 || exterior.scratches?.condition === 'deep' || exterior.scratches?.condition === 'light') {
    const polish = services.find((s) => normalizeServiceCategory(s.category) === 'polishing' || s.name.toLowerCase().includes('полир'));
    if (polish) suggestions.push({ service_id: polish.id, name: polish.name, price: polish.base_price ?? polish.price });
  }
  if (exterior.swirls?.condition === 'visible' || exterior.paint?.rating != null && (exterior.paint.rating ?? 5) <= 3) {
    const correction = services.find((s) => normalizeServiceCategory(s.category) === 'correction' || s.name.toLowerCase().includes('коррек'));
    if (correction) suggestions.push({ service_id: correction.id, name: correction.name, price: correction.base_price ?? correction.price });
  }
  if (damage.some((d) => d.severity === 'severe')) {
    const ppf = services.find((s) => normalizeServiceCategory(s.category) === 'ppf');
    if (ppf) suggestions.push({ service_id: ppf.id, name: ppf.name, price: ppf.base_price ?? ppf.price });
  }

  const unique = new Map<string, RecommendedServiceEntry>();
  for (const s of suggestions) {
    if (s.service_id) unique.set(s.service_id, s);
  }
  return [...unique.values()];
}

export function emptyInspectionForm(vehicleId = '', templateId = '') {
  return {
    vehicle_id: vehicleId,
    booking_id: '',
    template_id: templateId,
    workflow_stage: 'vehicle_arrival' as InspectionWorkflowStage,
    approval_status: 'pending' as ApprovalStatus,
    exterior_checks: {} as ChecklistData,
    interior_checks: {} as ChecklistData,
    technical_checks: {} as ChecklistData,
    damage_map: [] as DamageEntry[],
    recommended_services: [] as RecommendedServiceEntry[],
    approved_services: [] as RecommendedServiceEntry[],
    customer_comments: '',
    technician_notes: '',
    exterior_condition: '',
    scratches: '',
    paint_condition: '',
    interior_condition: '',
    existing_damage: '',
    customer_requests: '',
  };
}
