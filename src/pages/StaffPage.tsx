import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAnalyticsVisibility } from '../hooks/useAnalyticsVisibility';
import { AnalyticsToggle } from '../components/dashboard/AnalyticsToggle';
import { Pencil, Trash2 } from 'lucide-react';
import { db } from '../lib/localdb';
import { useLocalQuery } from '../hooks/useLocalData';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { canManageStaff } from '../lib/permissions';
import { fmt, fmtDate } from '../lib/constants';
import { AssetManager } from '../components/AssetManager';
import { StaffDashboard } from '../components/dashboard/PageDashboards';
import { EmployeeDashboard } from '../components/dashboard/EmployeeDashboard';
import { FILE_CATEGORIES } from '../lib/r2Storage';
import {
  AVAILABILITY_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  SCHEDULE_TYPE_LABELS,
  TASK_STATUS_LABELS,
  availabilityClass,
  buildSkillsMatrix,
  calcAttendanceHours,
  computeStaffPerformance,
  downloadCSV,
  exportStaffCSV,
  getExpiringTraining,
  todayBookingsForStaff,
  weekDates,
} from '../lib/staff';
import type {
  Booking,
  Staff,
  StaffAttendance,
  StaffSchedule,
  StaffSkill,
  StaffTask,
  StaffTraining,
} from '../types/database';

type StaffTab =
  | 'dashboard'
  | 'team'
  | 'profile'
  | 'technicians'
  | 'schedule'
  | 'attendance'
  | 'performance'
  | 'training'
  | 'tasks'
  | 'documents';

const TABS: { id: StaffTab; label: string }[] = [
  { id: 'dashboard', label: 'Дашборд' },
  { id: 'team', label: 'Команда' },
  { id: 'profile', label: 'Профиль' },
  { id: 'technicians', label: 'Техники' },
  { id: 'schedule', label: 'График' },
  { id: 'attendance', label: 'Посещаемость' },
  { id: 'performance', label: 'Производительность' },
  { id: 'training', label: 'Обучение' },
  { id: 'tasks', label: 'Задачи' },
  { id: 'documents', label: 'Документы' },
];

export function StaffPage({ onEdit }: { onEdit: (s: Staff | null) => void }) {
  const [showCharts, toggleCharts] = useAnalyticsVisibility('staff');
  const { data: staff, remove, update, refetch: refetchStaff } = useLocalQuery<Staff>('staff', '*', { orderBy: 'full_name', ascending: true });
  const { data: attendance, refetch: refetchAtt } = useLocalQuery<StaffAttendance>('staff_attendance', '*, staff(*)', { orderBy: 'check_in' });
  const { toast } = useToast();
  const { profile } = useAuth();
  const canManage = canManageStaff(profile?.role);

  const [tab, setTab] = useState<StaffTab>('dashboard');

  // Analytics is always hidden by default: leaving the dashboard tab hides it again.
  useEffect(() => {
    if (tab !== 'dashboard' && showCharts) toggleCharts();
  }, [tab, showCharts, toggleCharts]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [jobCounts, setJobCounts] = useState<Record<string, { active: number; completed: number }>>({});
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [skills, setSkills] = useState<StaffSkill[]>([]);
  const [schedules, setSchedules] = useState<StaffSchedule[]>([]);
  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const [training, setTraining] = useState<StaffTraining[]>([]);

  const [schedStaff, setSchedStaff] = useState('');
  const [schedDate, setSchedDate] = useState(new Date().toISOString().slice(0, 10));
  const [schedStart, setSchedStart] = useState('09:00');
  const [schedEnd, setSchedEnd] = useState('18:00');
  const [schedType, setSchedType] = useState<StaffSchedule['type']>('work');
  const [schedNotes, setSchedNotes] = useState('');

  const [taskTitle, setTaskTitle] = useState('');
  const [taskDesc, setTaskDesc] = useState('');
  const [taskStaff, setTaskStaff] = useState('');
  const [taskDeadline, setTaskDeadline] = useState('');

  const loadExtra = useCallback(async () => {
    const [bk, sk, sc, tk, tr] = await Promise.all([
      db.from('bookings').select('*, services(price)').order('scheduled_at', { ascending: false }).limit(500),
      db.from('staff_skills').select('*'),
      db.from('staff_schedules').select('*').order('date'),
      db.from('staff_tasks').select('*').order('created_at', { ascending: false }),
      db.from('staff_training').select('*').order('expires_at'),
    ]);
    setBookings((bk.data as Booking[]) ?? []);
    setSkills((sk.data as StaffSkill[]) ?? []);
    setSchedules((sc.data as StaffSchedule[]) ?? []);
    setTasks((tk.data as StaffTask[]) ?? []);
    setTraining((tr.data as StaffTraining[]) ?? []);

    const counts: Record<string, { active: number; completed: number }> = {};
    (bk.data ?? []).forEach((b: Booking) => {
      if (!b.assigned_technician_id) return;
      if (!counts[b.assigned_technician_id]) counts[b.assigned_technician_id] = { active: 0, completed: 0 };
      if (['completed', 'delivered'].includes(b.status)) counts[b.assigned_technician_id].completed++;
      else if (b.status !== 'cancelled') counts[b.assigned_technician_id].active++;
    });
    setJobCounts(counts);
  }, []);

  useEffect(() => { loadExtra(); }, [loadExtra]);

  const selected = staff.find((s) => s.id === selectedId) ?? staff[0] ?? null;
  const openShifts = attendance.filter((a) => !a.check_out);
  const week = weekDates();

  const selectedSkills = useMemo(
    () => skills.filter((s) => s.staff_id === selected?.id),
    [skills, selected?.id]
  );

  const skillsMatrix = useMemo(() => buildSkillsMatrix(selectedSkills), [selectedSkills]);

  const checkIn = async (staffId: string) => {
    const { error } = await db.from('staff_attendance').insert({ staff_id: staffId, check_in: new Date().toISOString() });
    if (error) toast('Ошибка: ' + error.message);
    else { toast('Приход отмечен'); refetchAtt(); loadExtra(); }
  };

  const checkOut = async (attendanceId: string) => {
    const att = attendance.find((a) => a.id === attendanceId);
    if (!att) return;
    const checkOutTime = new Date().toISOString();
    const hours = calcAttendanceHours({ ...att, check_out: checkOutTime });
    const { error } = await db.from('staff_attendance').update({
      check_out: checkOutTime,
      hours_worked: hours != null ? Math.round(hours * 100) / 100 : null,
    }).eq('id', attendanceId);
    if (error) toast('Ошибка: ' + error.message);
    else { toast('Уход отмечен'); refetchAtt(); }
  };

  const toggleActive = async (s: Staff) => {
    const err = await update(s.id, { is_active: !s.is_active } as Partial<Staff>);
    if (err) toast('Ошибка: ' + err);
    else toast(s.is_active ? 'Сотрудник отключён' : 'Сотрудник активен');
  };

  const saveSkillLevel = async (skillKey: string, level: number) => {
    if (!selected || !canManage) return;
    const existing = selectedSkills.find((s) => s.skill_key === skillKey);
    if (existing) {
      const { error } = await db.from('staff_skills').update({ level }).eq('id', existing.id);
      if (error) toast('Ошибка: ' + error.message);
    } else {
      const { error } = await db.from('staff_skills').insert({ staff_id: selected.id, skill_key: skillKey, level });
      if (error) toast('Ошибка: ' + error.message);
    }
    loadExtra();
  };

  const addSchedule = async () => {
    if (!schedStaff || !canManage) return;
    const { error } = await db.from('staff_schedules').insert({
      staff_id: schedStaff,
      date: schedDate,
      start_time: schedStart,
      end_time: schedEnd,
      type: schedType,
      notes: schedNotes || null,
    });
    if (error) toast('Ошибка: ' + error.message);
    else { toast('Запись добавлена'); setSchedNotes(''); loadExtra(); }
  };

  const addTask = async () => {
    if (!taskStaff || !taskTitle || !canManage) return;
    const { error } = await db.from('staff_tasks').insert({
      staff_id: taskStaff,
      title: taskTitle,
      description: taskDesc || null,
      deadline: taskDeadline ? new Date(taskDeadline).toISOString() : null,
      assigned_by: profile?.id ?? null,
    });
    if (error) toast('Ошибка: ' + error.message);
    else { toast('Задача создана'); setTaskTitle(''); setTaskDesc(''); setTaskDeadline(''); loadExtra(); }
  };

  const updateTaskStatus = async (task: StaffTask, status: StaffTask['status']) => {
    const patch: Partial<StaffTask> = { status };
    if (status === 'completed') patch.completed_at = new Date().toISOString();
    const { error } = await db.from('staff_tasks').update(patch).eq('id', task.id);
    if (error) toast('Ошибка: ' + error.message);
    else loadExtra();
  };

  const expiringTraining = getExpiringTraining(training);

  return (
    <>
      <div className="header-row">
        <div>
          <div className="eyebrow"><span className="dot"></span>Команда</div>
          <h1 className="page-title">Команда</h1>
          <p className="page-sub">Персонал: KPI, навыки, график, посещаемость, обучение и документы R2.</p>
        </div>
        <div className="tag-row">
          <AnalyticsToggle
            visible={showCharts}
            onToggle={() => {
              if (tab !== 'dashboard') {
                setTab('dashboard');
                if (!showCharts) toggleCharts();
              } else {
                toggleCharts();
              }
            }}
          />
          {canManage && <div className="tag add" onClick={() => onEdit(null)}>+ Новый сотрудник</div>}
          <div className="tag ghost" onClick={() => { downloadCSV(exportStaffCSV(staff, jobCounts), 'staff.csv'); toast('Файл выгружен'); }}>Экспорт CSV</div>
        </div>
      </div>

      <div className="filter-row tab-scroll" style={{ padding: 0, marginBottom: 28 }}>
        {TABS.map((t) => (
          <div key={t.id} className={`filter-pill ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</div>
        ))}
      </div>

      {tab === 'dashboard' && (
        <>
          <EmployeeDashboard
            staff={staff}
            attendance={attendance}
            bookings={bookings}
            tasks={tasks}
            training={training}
            schedules={schedules}
            jobCounts={jobCounts}
            canManage={canManage}
            onOpenProfile={(id) => { setSelectedId(id); setTab('profile'); }}
            onCheckIn={checkIn}
            onCheckOut={checkOut}
            onOpenTab={setTab}
            onAddStaff={() => onEdit(null)}
          />
          {showCharts && <StaffDashboard staff={staff} jobCounts={jobCounts} training={training} openShifts={openShifts.length} />}
        </>
      )}

      {tab === 'team' && (
        <div className="staff-grid">
          {staff.map((s) => (
            <div className="staff-card" key={s.id} style={!s.is_active ? { opacity: 0.65 } : undefined} onClick={() => { setSelectedId(s.id); setTab('profile'); }}>
              <div className="staff-top">
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div className="list-row-icon tone-info" style={{ marginTop: 2 }}>
                    {s.full_name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div>
                  <div className="staff-name">
                    {s.full_name}
                    <span className={`module-badge ${availabilityClass(s.availability_status)}`} style={{ marginLeft: 8 }}>
                      {AVAILABILITY_LABELS[s.availability_status ?? 'available']}
                    </span>
                    {!s.is_active && <span className="module-badge muted" style={{ marginLeft: 4 }}>Неактивен</span>}
                  </div>
                  <div className="staff-role">{s.role}{s.department ? ` · ${s.department}` : ''}</div>
                  <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 4 }}>
                    {jobCounts[s.id]?.completed ?? 0} завершено · {jobCounts[s.id]?.active ?? 0} активных
                  </div>
                  </div>
                </div>
                <div className="staff-top-meta">
                  <div className="staff-pct">{s.workload_pct}%</div>
                  {canManage && (
                    <div className="icon-actions staff-card-actions">
                      <span className="icon-btn" onClick={(e) => { e.stopPropagation(); onEdit(s); }}><Pencil size={13} strokeWidth={1.75} /></span>
                      <span className="icon-btn" onClick={(e) => { e.stopPropagation(); toggleActive(s); }}>{s.is_active ? '◌' : '●'}</span>
                      <span className="icon-btn danger" onClick={async (e) => {
                        e.stopPropagation();
                        const err = await remove(s.id);
                        if (err) toast('Ошибка: ' + err);
                        else { toast('Удалён'); refetchStaff(); }
                      }}><Trash2 size={13} strokeWidth={1.75} /></span>
                    </div>
                  )}
                </div>
              </div>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${s.workload_pct}%` }} /></div>
            </div>
          ))}
        </div>
      )}

      {tab === 'profile' && selected && (
        <div className="two-col-layout">
          <div className="section-block">
            <div className="section-head">
              <div className="section-title">{selected.full_name}</div>
              {canManage && <div className="tag blue" onClick={() => onEdit(selected)}>Редактировать</div>}
            </div>
            <div className="side-panel-fields">
              <div><span className="side-field-label">ID</span><div>{selected.employee_id ?? '—'}</div></div>
              <div><span className="side-field-label">Email</span><div>{selected.email ?? '—'}</div></div>
              <div><span className="side-field-label">Телефон</span><div>{selected.phone ?? '—'}</div></div>
              <div><span className="side-field-label">Отдел</span><div>{selected.department ?? '—'}</div></div>
              <div><span className="side-field-label">Статус</span><div>{EMPLOYMENT_STATUS_LABELS[selected.employment_status ?? 'active']}</div></div>
              <div><span className="side-field-label">Тип занятости</span><div>{selected.employment_type ?? '—'}</div></div>
              <div><span className="side-field-label">Начало работы</span><div>{selected.start_date ? fmtDate(selected.start_date) : '—'}</div></div>
              <div><span className="side-field-label">Локация</span><div>{selected.working_location ?? '—'}</div></div>
              {selected.internal_notes && <div><span className="side-field-label">Заметки</span><div>{selected.internal_notes}</div></div>}
            </div>
            <select className="field-select" value={selected.id} onChange={(e) => setSelectedId(e.target.value)} style={{ marginTop: 16, maxWidth: 320 }}>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </div>
          <div className="section-block">
            <div className="section-head"><div className="section-title">Матрица навыков</div></div>
            {skillsMatrix.map((row) => (
              <div className="integration-card" key={row.key} style={{ padding: '10px 14px' }}>
                <div style={{ flex: 1 }}>
                  <div className="integration-name" style={{ fontSize: 13 }}>{row.label}</div>
                  <div className="integration-desc">
                    Уровень: {row.record?.level ?? 0}/5
                    {row.record?.certified ? ' · Сертифицирован' : ''}
                  </div>
                </div>
                {canManage && (
                  <select
                    className="field-select"
                    style={{ width: 80 }}
                    value={row.record?.level ?? 0}
                    onChange={(e) => saveSkillLevel(row.key, +e.target.value)}
                  >
                    {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === 'profile' && !selected && <div className="empty-state">Сотрудников нет</div>}

      {tab === 'technicians' && (
        <div className="section-block">
          <div className="section-head"><div className="section-title">Работы на сегодня (live)</div></div>
          {staff.filter((s) => s.is_active).map((s) => {
            const todayJobs = todayBookingsForStaff(s.id, bookings);
            return (
              <div className="integration-card" key={s.id}>
                <div style={{ flex: 1 }}>
                  <div className="integration-name">{s.full_name} · {AVAILABILITY_LABELS[s.availability_status ?? 'available']}</div>
                  <div className="integration-desc">
                    {todayJobs.length ? todayJobs.map((b) => `${b.services?.name ?? 'Заказ'} (${b.bay})`).join(' · ') : 'Нет назначений на сегодня'}
                  </div>
                </div>
                <div className="staff-pct">{s.workload_pct}%</div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'schedule' && (
        <>
          {canManage && (
            <div className="section-block" style={{ marginBottom: 20 }}>
              <div className="section-head"><div className="section-title">Добавить запись</div></div>
              <div className="field-row2">
                <select className="field-select" value={schedStaff} onChange={(e) => setSchedStaff(e.target.value)}>
                  <option value="">Сотрудник…</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
                <input className="field-input" type="date" value={schedDate} onChange={(e) => setSchedDate(e.target.value)} />
              </div>
              <div className="field-row2">
                <input className="field-input" type="time" value={schedStart} onChange={(e) => setSchedStart(e.target.value)} />
                <input className="field-input" type="time" value={schedEnd} onChange={(e) => setSchedEnd(e.target.value)} />
              </div>
              <select className="field-select" value={schedType} onChange={(e) => setSchedType(e.target.value as StaffSchedule['type'])}>
                {Object.entries(SCHEDULE_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <div className="tag add" style={{ marginTop: 12 }} onClick={addSchedule}>+ Добавить</div>
            </div>
          )}
          <div className="section-block">
            <div className="section-head"><div className="section-title">Неделя</div></div>
            <div className="table-wrap">
              <div className="table-scroll staff-table-scroll">
              <table className="data-table staff-schedule-table">
                <thead>
                  <tr>
                    <th>Сотрудник</th>
                    {week.map((d) => <th key={d}>{new Date(d).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' })}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {staff.filter((s) => s.is_active).map((s) => (
                    <tr key={s.id}>
                      <td>{s.full_name}</td>
                      {week.map((d) => {
                        const entries = schedules.filter((sc) => sc.staff_id === s.id && sc.date === d);
                        return (
                          <td key={d} style={{ fontSize: 11 }}>
                            {entries.length
                              ? entries.map((e) => SCHEDULE_TYPE_LABELS[e.type]?.slice(0, 3) ?? e.type).join(', ')
                              : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </>
      )}

      {tab === 'attendance' && (
        <div className="section-block">
          <div className="section-head"><div className="section-title">Посещаемость</div></div>
          {openShifts.length > 0 && (
            <div style={{ marginBottom: 16, fontSize: 12, color: 'var(--muted)' }}>{openShifts.length} сотрудников в смене</div>
          )}
          {canManage && (
            <div className="tag-row" style={{ marginBottom: 16 }}>
              {staff.filter((s) => s.is_active).slice(0, 6).map((s) => (
                <div key={s.id} className="tag ghost" onClick={() => checkIn(s.id)}>+ {s.full_name.split(' ')[0]}</div>
              ))}
            </div>
          )}
          <div className="table-wrap">
            <div className="table-scroll staff-table-scroll">
            <table className="data-table staff-attendance-table">
              <thead>
                <tr><th>Сотрудник</th><th>Приход</th><th>Уход</th><th>Часы</th><th>Перерыв</th><th></th></tr>
              </thead>
              <tbody>
                {attendance.slice(-30).reverse().map((a) => (
                  <tr key={a.id}>
                    <td>{a.staff?.full_name ?? '—'}</td>
                    <td>{new Date(a.check_in).toLocaleString('ru-RU')}</td>
                    <td>{a.check_out ? new Date(a.check_out).toLocaleTimeString('ru-RU') : 'в смене'}</td>
                    <td>{a.hours_worked ?? (a.check_out ? calcAttendanceHours(a)?.toFixed(1) : '—')}</td>
                    <td>{a.break_minutes ?? 0} мин</td>
                    <td>{!a.check_out && canManage && <div className="tag add" onClick={() => checkOut(a.id)}>Уход</div>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          {!attendance.length && <div className="empty-state">Записей посещаемости нет.</div>}
        </div>
      )}

      {tab === 'performance' && (
        <div className="section-block">
          <div className="section-head"><div className="section-title">Производительность (live bookings)</div></div>
          {staff.filter((s) => s.is_active).map((s) => {
            const perf = computeStaffPerformance(s.id, bookings, jobCounts);
            return (
              <div className="integration-card" key={s.id}>
                <div style={{ flex: 1 }}>
                  <div className="integration-name">{s.full_name}</div>
                  <div className="integration-desc">
                    {perf.completed} завершено · {perf.active} активных · выручка {fmt(perf.revenue)} · ср. {perf.avgHours.toFixed(1)} ч{Number(s.commission_pct) > 0 ? ` · к выплате ${fmt(Math.round((perf.revenue * Number(s.commission_pct)) / 100))} (${s.commission_pct}%)` : ''}
                  </div>
                  <div className="bar-track" style={{ marginTop: 8 }}><div className="bar-fill" style={{ width: `${s.workload_pct}%` }} /></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'training' && (
        <>
          {expiringTraining.length > 0 && (
            <div className="section-block" style={{ marginBottom: 20 }}>
              <div className="section-head"><div className="section-title">Истекающие сертификаты</div></div>
              {expiringTraining.map((t) => (
                <div className="integration-card" key={t.id}>
                  <div>
                    <div className="integration-name">{t.course_name}</div>
                    <div className="integration-desc">{staff.find((s) => s.id === t.staff_id)?.full_name} · до {fmtDate(t.expires_at!)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="section-block">
            <div className="section-head"><div className="section-title">Все записи обучения</div></div>
            {training.map((t) => (
              <div className="integration-card" key={t.id}>
                <div>
                  <div className="integration-name">{t.course_name}</div>
                  <div className="integration-desc">
                    {staff.find((s) => s.id === t.staff_id)?.full_name}
                    {t.completed_at ? ` · завершено ${fmtDate(t.completed_at)}` : ''}
                    {t.expires_at ? ` · до ${fmtDate(t.expires_at)}` : ''}
                  </div>
                </div>
              </div>
            ))}
            {!training.length && <div className="empty-state">Записей обучения нет.</div>}
          </div>
        </>
      )}

      {tab === 'tasks' && (
        <>
          {canManage && (
            <div className="section-block" style={{ marginBottom: 20 }}>
              <div className="section-head"><div className="section-title">Новая задача</div></div>
              <select className="field-select" value={taskStaff} onChange={(e) => setTaskStaff(e.target.value)}>
                <option value="">Сотрудник…</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
              </select>
              <input className="field-input" placeholder="Название" value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} />
              <input className="field-input" placeholder="Описание" value={taskDesc} onChange={(e) => setTaskDesc(e.target.value)} style={{ marginTop: 8 }} />
              <input className="field-input" type="date" value={taskDeadline} onChange={(e) => setTaskDeadline(e.target.value)} style={{ marginTop: 8 }} />
              <div className="tag add" style={{ marginTop: 12 }} onClick={addTask}>Создать</div>
            </div>
          )}
          <div className="section-block">
            {tasks.map((t) => (
              <div className="integration-card" key={t.id}>
                <div style={{ flex: 1 }}>
                  <div className="integration-name">{t.title}</div>
                  <div className="integration-desc">
                    {staff.find((s) => s.id === t.staff_id)?.full_name} · {TASK_STATUS_LABELS[t.status]}
                    {t.deadline ? ` · до ${fmtDate(t.deadline)}` : ''}
                  </div>
                </div>
                {canManage && t.status !== 'completed' && (
                  <div className="tag green" onClick={() => updateTaskStatus(t, 'completed')}>✓</div>
                )}
              </div>
            ))}
            {!tasks.length && <div className="empty-state">Задач нет.</div>}
          </div>
        </>
      )}

      {tab === 'documents' && selected && (
        <div className="section-block">
          <div className="section-head">
            <div className="section-title">Документы · {selected.full_name}</div>
          </div>
          <select className="field-select" value={selected.id} onChange={(e) => setSelectedId(e.target.value)} style={{ marginBottom: 16, maxWidth: 320 }}>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
          <AssetManager
            entityType="staff"
            entityId={selected.id}
            categories={FILE_CATEGORIES.staff.map((c) => ({ ...c }))}
            title="HR и сертификаты (R2)"
          />
        </div>
      )}
      {tab === 'documents' && !selected && <div className="empty-state">Сотрудников нет</div>}
    </>
  );
}
