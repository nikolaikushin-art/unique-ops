import { WORKFLOW_STAGES } from './constants';
import { db } from './localdb';
import type { BookingStatus } from '../types/database';

/** Map legacy seed pipeline_stage values to 7-column Kanban */
export const LEGACY_STAGE_MAP: Record<string, string> = {
  'Приёмка': 'Входящие авто',
  'Мойка': 'Осмотр',
  'Полировка': 'В работе',
  'Керамика / PPF': 'В работе',
  'Финиш': 'Контроль качества',
  'Контроль качества': 'Контроль качества',
};

export function normalizePipelineStage(stage: string): string {
  if (WORKFLOW_STAGES.includes(stage as (typeof WORKFLOW_STAGES)[number])) return stage;
  // Some data stores a booking-status id in pipeline_stage ("in_progress") — map it to its Kanban column.
  return LEGACY_STAGE_MAP[stage] ?? STATUS_TO_KANBAN[stage] ?? 'Входящие авто';
}

export function vehiclesInWorkshop<T extends { pipeline_stage: string }>(vehicles: T[]): T[] {
  const terminal = new Set(['Завершено', 'Готов к выдаче']);
  return vehicles.filter((v) => !terminal.has(normalizePipelineStage(v.pipeline_stage)));
}

export function groupVehiclesByStage<T extends { pipeline_stage: string }>(vehicles: T[]): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const stage of WORKFLOW_STAGES) groups[stage] = [];
  for (const v of vehicles) {
    const stage = normalizePipelineStage(v.pipeline_stage);
    groups[stage]?.push(v);
  }
  return groups;
}

/** Full job workflow — maps to booking_status enum */
export const JOB_WORKFLOW_CYCLE: BookingStatus[] = [
  'new_enquiry',
  'confirmed',
  'vehicle_received',
  'inspection',
  'awaiting_approval',
  'in_progress',
  'quality_check',
  'completed',
  'delivered',
];

export const KANBAN_TO_STATUS: Record<string, BookingStatus> = {
  'Входящие авто': 'vehicle_received',
  'Осмотр': 'inspection',
  'Ожидает одобрения': 'awaiting_approval',
  'В работе': 'in_progress',
  'Контроль качества': 'quality_check',
  'Готов к выдаче': 'completed',
  'Завершено': 'delivered',
};

export const STATUS_TO_KANBAN: Record<string, string> = {
  new_enquiry: 'Входящие авто',
  confirmed: 'Ожидает одобрения',
  vehicle_received: 'Входящие авто',
  inspection: 'Осмотр',
  awaiting_approval: 'Ожидает одобрения',
  in_progress: 'В работе',
  quality_check: 'Контроль качества',
  completed: 'Готов к выдаче',
  delivered: 'Завершено',
};

/** Sync vehicle kanban stage from booking status; skips terminal/cancelled */
export async function syncVehicleFromBookingStatus(
  vehicleId: string | null | undefined,
  status: string
): Promise<string | null> {
  if (!vehicleId || status === 'cancelled') return null;
  const stage = STATUS_TO_KANBAN[status];
  if (!stage) return null;
  const { error } = await db.from('vehicles').update({ pipeline_stage: stage }).eq('id', vehicleId);
  return error?.message ?? null;
}

export async function syncBookingFromKanbanStage(
  vehicleId: string,
  stage: string
): Promise<string | null> {
  const bookingStatus = KANBAN_TO_STATUS[stage];
  if (!bookingStatus) return null;
  const { data: bookings, error: fetchErr } = await db
    .from('bookings')
    .select('id, status')
    .eq('vehicle_id', vehicleId)
    .not('status', 'in', '("completed","delivered","cancelled")')
    .order('scheduled_at', { ascending: false })
    .limit(1);
  if (fetchErr) return fetchErr.message;
  if (!bookings?.[0]) return null;
  const updates: Record<string, unknown> = { status: bookingStatus };
  if (['completed', 'delivered'].includes(bookingStatus)) updates.completed_at = new Date().toISOString();
  const { error } = await db.from('bookings').update(updates).eq('id', bookings[0].id);
  return error?.message ?? null;
}

export function nextJobStatus(current: string): BookingStatus {
  const cycle = JOB_WORKFLOW_CYCLE as string[];
  const idx = cycle.indexOf(current);
  if (idx === -1) return 'new_enquiry';
  return JOB_WORKFLOW_CYCLE[(idx + 1) % JOB_WORKFLOW_CYCLE.length];
}

export function jobWorkflowStep(status: string): number {
  const idx = (JOB_WORKFLOW_CYCLE as string[]).indexOf(status);
  return idx === -1 ? 0 : idx;
}
