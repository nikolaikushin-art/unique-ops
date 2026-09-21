import type { Booking, Staff, StaffAttendance, StaffSkill, StaffTraining } from '../types/database';

export const DETAILING_SKILLS = [
  { key: 'wash', label: 'Мойка / подготовка' },
  { key: 'decon', label: 'Деконтаминация' },
  { key: 'clay', label: 'Глина / очистка' },
  { key: 'polish', label: 'Полировка' },
  { key: 'compound', label: 'Абразивная коррекция' },
  { key: 'finishing', label: 'Финишная полировка' },
  { key: 'coating', label: 'Керамика / покрытия' },
  { key: 'ppf', label: 'PPF / антигравий' },
  { key: 'ppf_install', label: 'Монтаж PPF' },
  { key: 'interior', label: 'Химчистка салона' },
  { key: 'leather', label: 'Уход за кожей' },
  { key: 'engine', label: 'Моторный отсек' },
  { key: 'wheel', label: 'Диски / тормоза' },
  { key: 'glass', label: 'Стёкла' },
  { key: 'headlight', label: 'Фары / восстановление' },
  { key: 'paint_correction', label: 'Коррекция ЛКП' },
  { key: 'qc', label: 'Контроль качества' },
  { key: 'inspection', label: 'Осмотр / приёмка' },
  { key: 'customer_service', label: 'Работа с клиентом' },
] as const;

export type SkillKey = (typeof DETAILING_SKILLS)[number]['key'];

export const AVAILABILITY_LABELS: Record<string, string> = {
  available: 'Доступен',
  busy: 'Занят',
  off: 'Не на смене',
  leave: 'Отпуск',
};

export const EMPLOYMENT_STATUS_LABELS: Record<string, string> = {
  active: 'Активен',
  inactive: 'Неактивен',
  on_leave: 'В отпуске',
  terminated: 'Уволен',
};

export const SCHEDULE_TYPE_LABELS: Record<string, string> = {
  work: 'Работа',
  off: 'Выходной',
  holiday: 'Праздник',
  sick: 'Больничный',
  overtime: 'Сверхурочно',
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  in_progress: 'В работе',
  completed: 'Выполнено',
  cancelled: 'Отменено',
};

export function skillLabel(key: string): string {
  return DETAILING_SKILLS.find((s) => s.key === key)?.label ?? key;
}

export interface StaffKpis {
  total: number;
  active: number;
  available: number;
  avgWorkload: number;
  jobsCompleted: number;
  jobsActive: number;
  trainingExpiring: number;
  docAlerts: number;
}

export function computeStaffKpis(
  staff: Staff[],
  jobCounts: Record<string, { active: number; completed: number }>,
  training: StaffTraining[],
  openShifts: number
): StaffKpis {
  const active = staff.filter((s) => s.is_active && s.employment_status !== 'terminated');
  const available = active.filter((s) => (s.availability_status ?? 'available') === 'available');
  const avgWorkload = active.length
    ? Math.round(active.reduce((s, m) => s + m.workload_pct, 0) / active.length)
    : 0;
  const jobsCompleted = Object.values(jobCounts).reduce((s, c) => s + c.completed, 0);
  const jobsActive = Object.values(jobCounts).reduce((s, c) => s + c.active, 0);
  const in30 = Date.now() + 30 * 86400000;
  const trainingExpiring = training.filter((t) => {
    if (!t.expires_at) return false;
    const exp = new Date(t.expires_at).getTime();
    return exp > Date.now() && exp <= in30;
  }).length;

  return {
    total: staff.length,
    active: active.length,
    available: available.length,
    avgWorkload,
    jobsCompleted,
    jobsActive,
    trainingExpiring,
    docAlerts: openShifts,
  };
}

export function computeStaffPerformance(
  staffId: string,
  bookings: Booking[],
  jobCounts: Record<string, { active: number; completed: number }>
) {
  const mine = bookings.filter((b) => b.assigned_technician_id === staffId);
  const completed = mine.filter((b) => ['completed', 'delivered'].includes(b.status));
  const revenue = completed.reduce((s, b) => s + (b.estimated_value ?? b.services?.price ?? 0), 0);
  const durations = completed
    .filter((b) => b.completed_at && b.scheduled_at)
    .map((b) => (new Date(b.completed_at!).getTime() - new Date(b.scheduled_at).getTime()) / 3600000);
  const avgHours = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

  return {
    completed: jobCounts[staffId]?.completed ?? completed.length,
    active: jobCounts[staffId]?.active ?? 0,
    revenue,
    avgHours,
  };
}

export function getExpiringTraining(training: StaffTraining[], days = 30): StaffTraining[] {
  const limit = Date.now() + days * 86400000;
  return training.filter((t) => {
    if (!t.expires_at) return false;
    const exp = new Date(t.expires_at).getTime();
    return exp > Date.now() && exp <= limit;
  });
}

export function exportStaffCSV(
  staff: Staff[],
  jobCounts: Record<string, { active: number; completed: number }>
): string {
  const rows = [
    ['ID', 'Имя', 'Роль', 'Отдел', 'Статус', 'Доступность', 'Загрузка %', 'Активных', 'Завершено', 'Телефон', 'Email'],
    ...staff.map((s) => [
      s.employee_id ?? '',
      s.full_name,
      s.role,
      s.department ?? '',
      EMPLOYMENT_STATUS_LABELS[s.employment_status ?? 'active'] ?? s.employment_status,
      AVAILABILITY_LABELS[s.availability_status ?? 'available'] ?? s.availability_status,
      s.workload_pct,
      jobCounts[s.id]?.active ?? 0,
      jobCounts[s.id]?.completed ?? 0,
      s.phone ?? '',
      s.email ?? '',
    ]),
  ];
  return rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function buildSkillsMatrix(skills: StaffSkill[]) {
  const map = new Map(skills.map((s) => [s.skill_key, s]));
  return DETAILING_SKILLS.map((def) => ({
    ...def,
    record: map.get(def.key) ?? null,
  }));
}

export function weekDates(base = new Date()): string[] {
  const start = new Date(base);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

export function availabilityClass(status?: string): string {
  switch (status) {
    case 'available': return 'green';
    case 'busy': return 'warn';
    case 'leave': return 'muted';
    default: return '';
  }
}

export function todayBookingsForStaff(staffId: string, bookings: Booking[]) {
  const today = new Date().toISOString().slice(0, 10);
  return bookings.filter(
    (b) => b.assigned_technician_id === staffId && b.scheduled_at.startsWith(today) && b.status !== 'cancelled'
  );
}

export function calcAttendanceHours(att: StaffAttendance): number | null {
  if (!att.check_out) return null;
  const ms = new Date(att.check_out).getTime() - new Date(att.check_in).getTime();
  const breakMin = att.break_minutes ?? 0;
  const overtime = att.overtime_hours ?? 0;
  return Math.max(0, ms / 3600000 - breakMin / 60 + overtime);
}
