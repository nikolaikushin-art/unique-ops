/**
 * Employee dashboard — the working view of the «Команда» page (NO analytics: no KPIs, charts or percentages —
 * those stay hidden behind the «Аналитика» button). A live picture of the studio floor: who is in, who is free,
 * what is on which bay, what needs attention — with a filter panel (period · status · department · search).
 */
import { useMemo, useState } from 'react';
import { CalendarDays, CalendarRange, Search, X, Users, UserCheck, Coffee, Wrench, AlertTriangle, Plane, BadgeCheck, Clock } from 'lucide-react';
import { DxCard } from '../charts';
import { fmtDate, fmtTime } from '../../lib/constants';
import { AVAILABILITY_LABELS, SCHEDULE_TYPE_LABELS, availabilityClass } from '../../lib/staff';
import type { Booking, Staff, StaffAttendance, StaffSchedule, StaffTask, StaffTraining } from '../../types/database';

interface Props {
  staff: Staff[];
  attendance: StaffAttendance[];
  bookings: Booking[];
  tasks: StaffTask[];
  training: StaffTraining[];
  schedules: StaffSchedule[];
  jobCounts: Record<string, { active: number; completed: number }>;
  canManage: boolean;
  onOpenProfile: (id: string) => void;
  onCheckIn: (staffId: string) => void;
  onCheckOut: (attendanceId: string) => void;
  onOpenTab: (tab: 'tasks' | 'schedule' | 'attendance' | 'training') => void;
  onAddStaff: () => void;
}

type Period = 'today' | 'week';
type Presence = 'all' | 'in' | 'free' | 'away';

const initials = (name: string) => name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const keyOfIso = (iso: string) => dayKey(new Date(iso));
const plural = (n: number, one: string, few: string, many: string) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
};
const duration = (ms: number) => {
  const min = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h} ч ${String(m).padStart(2, '0')} мин` : `${m} мин`;
};
const dayLabel = (key: string, todayKey: string) => {
  if (key === todayKey) return 'Сегодня';
  return new Date(`${key}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' });
};
const dueText = (deadline: string, todayKey: string) => {
  const diff = Math.round((new Date(`${keyOfIso(deadline)}T12:00:00`).getTime() - new Date(`${todayKey}T12:00:00`).getTime()) / 86400000);
  if (diff < 0) return { text: `просрочено на ${-diff} ${plural(-diff, 'день', 'дня', 'дней')}`, late: true };
  if (diff === 0) return { text: 'срок — сегодня', late: false };
  if (diff === 1) return { text: 'срок — завтра', late: false };
  return { text: `через ${diff} ${plural(diff, 'день', 'дня', 'дней')}`, late: false };
};

export function EmployeeDashboard({ staff, attendance, bookings, tasks, training, schedules, jobCounts, canManage, onOpenProfile, onCheckIn, onCheckOut, onOpenTab, onAddStaff }: Props) {
  const [period, setPeriod] = useState<Period>('today');
  const [presence, setPresence] = useState<Presence>('all');
  const [dept, setDept] = useState('all');
  const [q, setQ] = useState('');

  const d = useMemo(() => {
    const now = Date.now();
    const today = new Date();
    const todayKey = dayKey(today);
    const days = Array.from({ length: period === 'week' ? 7 : 1 }, (_, i) => dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)));
    const daySet = new Set(days);

    const active = staff.filter((s) => s.is_active && s.employment_status !== 'terminated');
    const openShifts = attendance.filter((a) => !a.check_out);
    const shiftByStaff = new Map(openShifts.map((a) => [a.staff_id, a]));

    // who is away today (schedule: off / sick / holiday, or availability = leave)
    const awayReason = new Map<string, string>();
    schedules.filter((sc) => sc.date === todayKey && sc.type !== 'work' && sc.type !== 'overtime')
      .forEach((sc) => awayReason.set(sc.staff_id, SCHEDULE_TYPE_LABELS[sc.type] ?? sc.type));
    active.forEach((s) => { if (s.availability_status === 'leave' && !awayReason.has(s.id)) awayReason.set(s.id, AVAILABILITY_LABELS.leave); });

    const jobs = bookings
      .filter((b) => b.assigned_technician_id && b.status !== 'cancelled' && daySet.has(keyOfIso(b.scheduled_at)))
      .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    const jobsByStaff = new Map<string, Booking[]>();
    jobs.forEach((b) => jobsByStaff.set(b.assigned_technician_id!, [...(jobsByStaff.get(b.assigned_technician_id!) ?? []), b]));
    const todayJobsByStaff = new Map<string, Booking[]>();
    jobs.filter((b) => keyOfIso(b.scheduled_at) === todayKey).forEach((b) => todayJobsByStaff.set(b.assigned_technician_id!, [...(todayJobsByStaff.get(b.assigned_technician_id!) ?? []), b]));

    const depts = Array.from(new Set(active.map((s) => s.department).filter(Boolean) as string[])).sort();
    return { now, todayKey, days, daySet, active, openShifts, shiftByStaff, awayReason, jobs, jobsByStaff, todayJobsByStaff, depts };
  }, [staff, attendance, bookings, schedules, period]);

  const statusOf = (s: Staff): Presence => (d.awayReason.has(s.id) ? 'away' : d.shiftByStaff.has(s.id) ? 'in' : 'free');

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return d.active.filter((s) => {
      if (dept !== 'all' && s.department !== dept) return false;
      if (needle && !`${s.full_name} ${s.role} ${s.department ?? ''}`.toLowerCase().includes(needle)) return false;
      if (presence === 'in') return d.shiftByStaff.has(s.id);
      if (presence === 'away') return d.awayReason.has(s.id);
      if (presence === 'free') return !d.shiftByStaff.has(s.id) && !d.awayReason.has(s.id);
      return true;
    });
  }, [d, q, dept, presence]);
  const vis = useMemo(() => new Set(visible.map((s) => s.id)), [visible]);
  const filtersOn = period !== 'today' || presence !== 'all' || dept !== 'all' || q.trim() !== '';
  const reset = () => { setPeriod('today'); setPresence('all'); setDept('all'); setQ(''); };

  const nameOf = (id: string) => staff.find((s) => s.id === id)?.full_name ?? '—';
  const firstName = (s: Staff) => s.full_name.split(' ')[0];

  // ── derived per-filter data ──────────────────────────────────────────────
  const inNow = d.openShifts.filter((a) => vis.has(a.staff_id));
  const freeNow = visible.filter((s) => d.shiftByStaff.has(s.id) && !(d.todayJobsByStaff.get(s.id)?.length));
  const notIn = visible.filter((s) => !d.shiftByStaff.has(s.id) && !d.awayReason.has(s.id));
  const awayList = visible.filter((s) => d.awayReason.has(s.id));
  const jobs = d.jobs.filter((b) => vis.has(b.assigned_technician_id!));

  const openTasks = tasks
    .filter((t) => (t.status === 'pending' || t.status === 'in_progress') && vis.has(t.staff_id))
    .sort((a, b) => (a.deadline ? new Date(a.deadline).getTime() : Infinity) - (b.deadline ? new Date(b.deadline).getTime() : Infinity));
  const lateTasks = openTasks.filter((t) => t.deadline && new Date(t.deadline).getTime() < d.now).length;

  const bays = useMemo(() => {
    const m = new Map<string, Booking[]>();
    jobs.forEach((b) => { const k = b.bay || 'Без поста'; m.set(k, [...(m.get(k) ?? []), b]); });
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], 'ru', { numeric: true }));
  }, [jobs]);

  const timeline = useMemo(() => {
    type Item = { id: string; key: string; time: string; title: string; sub: string; tone: 'job' | 'shift' | 'off'; staffId: string };
    const items: Item[] = [];
    jobs.forEach((b) => items.push({
      id: `j${b.id}`, key: keyOfIso(b.scheduled_at), time: fmtTime(b.scheduled_at), tone: 'job', staffId: b.assigned_technician_id!,
      title: b.services?.name ?? 'Заказ', sub: `${nameOf(b.assigned_technician_id!)}${b.bay ? ` · ${b.bay}` : ''}`,
    }));
    schedules.filter((sc) => d.daySet.has(sc.date) && vis.has(sc.staff_id)).forEach((sc) => {
      const away = sc.type !== 'work' && sc.type !== 'overtime';
      items.push({
        id: `s${sc.id}`, key: sc.date, tone: away ? 'off' : 'shift', staffId: sc.staff_id,
        time: sc.start_time ? String(sc.start_time).slice(0, 5) : '—',
        title: away ? (SCHEDULE_TYPE_LABELS[sc.type] ?? sc.type) : `Смена${sc.type === 'overtime' ? ' (сверхурочно)' : ''}`,
        sub: `${nameOf(sc.staff_id)}${sc.start_time && sc.end_time ? ` · ${String(sc.start_time).slice(0, 5)}–${String(sc.end_time).slice(0, 5)}` : ''}`,
      });
    });
    return items.sort((a, b) => a.key.localeCompare(b.key) || a.time.localeCompare(b.time));
  }, [jobs, schedules, d.daySet, vis]); // eslint-disable-line react-hooks/exhaustive-deps

  const certs = training
    .filter((t) => t.expires_at && new Date(t.expires_at).getTime() <= d.now + 30 * 86400000 && vis.has(t.staff_id))
    .sort((a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime());

  const setP = (v: Presence) => setPresence((cur) => (cur === v ? 'all' : v));
  const Empty = ({ children }: { children: string }) => <div className="ed-empty">{children}</div>;

  return (
    <div className="dx ed" style={{ marginBottom: 28 }}>
      {/* ───────── filter panel ───────── */}
      <div className="ed-filters">
        <div className="seg" role="tablist" aria-label="Период">
          <button type="button" role="tab" aria-selected={period === 'today'} className={`seg-btn${period === 'today' ? ' is-on' : ''}`} onClick={() => setPeriod('today')}><CalendarDays size={16} strokeWidth={1.9} />Сегодня</button>
          <button type="button" role="tab" aria-selected={period === 'week'} className={`seg-btn${period === 'week' ? ' is-on' : ''}`} onClick={() => setPeriod('week')}><CalendarRange size={16} strokeWidth={1.9} />7 дней</button>
        </div>
        <div className="seg" role="tablist" aria-label="Статус">
          {([['all', 'Все', Users], ['in', 'На смене', UserCheck], ['free', 'Не пришли', Coffee], ['away', 'Отсутствуют', Plane]] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={presence === id} className={`seg-btn${presence === id ? ' is-on' : ''}`} onClick={() => setPresence(id)}><Icon size={16} strokeWidth={1.9} /><span>{label}</span></button>
          ))}
        </div>
        {d.depts.length > 0 && (
          <select className="ed-select" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Отдел">
            <option value="all">Все отделы</option>
            {d.depts.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        )}
        <label className="ed-search">
          <Search size={15} strokeWidth={2} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя или должность" aria-label="Поиск сотрудника" />
          {q && <button type="button" onClick={() => setQ('')} aria-label="Очистить"><X size={14} /></button>}
        </label>
        <div className="ed-filters-meta">
          <span>Показано {visible.length} из {d.active.length}</span>
          {filtersOn && <button type="button" className="ed-reset" onClick={reset}>Сбросить</button>}
        </div>
      </div>

      {/* ───────── live tiles ───────── */}
      <div className="ed-tiles">
        <button type="button" className={`ed-tile${presence === 'in' ? ' is-on' : ''}`} onClick={() => setP('in')}>
          <span className="ed-tile-ico tone-green"><UserCheck size={18} strokeWidth={1.9} /></span>
          <span className="ed-tile-num">{d.openShifts.length}<small> / {d.active.length}</small></span>
          <span className="ed-tile-lbl">на смене</span>
        </button>
        <button type="button" className="ed-tile" onClick={() => setPresence('in')}>
          <span className="ed-tile-ico tone-blue"><Wrench size={18} strokeWidth={1.9} /></span>
          <span className="ed-tile-num">{new Set(d.jobs.filter((b) => keyOfIso(b.scheduled_at) === d.todayKey).map((b) => b.assigned_technician_id)).size}</span>
          <span className="ed-tile-lbl">заняты работами</span>
        </button>
        <div className="ed-tile is-static">
          <span className="ed-tile-ico tone-teal"><Coffee size={18} strokeWidth={1.9} /></span>
          <span className="ed-tile-num">{d.openShifts.filter((a) => !(d.todayJobsByStaff.get(a.staff_id)?.length)).length}</span>
          <span className="ed-tile-lbl">свободны сейчас</span>
        </div>
        <button type="button" className="ed-tile" onClick={() => onOpenTab('tasks')}>
          <span className={`ed-tile-ico ${lateTasks ? 'tone-red' : 'tone-orange'}`}><AlertTriangle size={18} strokeWidth={1.9} /></span>
          <span className="ed-tile-num">{openTasks.length}{lateTasks > 0 && <small className="is-late"> · {lateTasks} просрочено</small>}</span>
          <span className="ed-tile-lbl">открытых задач</span>
        </button>
        <button type="button" className={`ed-tile${presence === 'away' ? ' is-on' : ''}`} onClick={() => setP('away')}>
          <span className="ed-tile-ico tone-purple"><Plane size={18} strokeWidth={1.9} /></span>
          <span className="ed-tile-num">{d.awayReason.size}</span>
          <span className="ed-tile-lbl">отсутствуют</span>
        </button>
      </div>

      {/* ───────── panels ───────── */}
      <div className="dx-grid dx-2">
        <DxCard eyebrow="Прямо сейчас" title="В студии" right={<span className="ch-badge is-gray">{inNow.length} {plural(inNow.length, 'человек', 'человека', 'человек')}</span>}>
          {inNow.length === 0 && <Empty>{filtersOn ? 'По выбранным фильтрам никого нет на смене.' : 'Смена ещё не началась — никто не отметил приход.'}</Empty>}
          {inNow.map((a) => {
            const s = staff.find((x) => x.id === a.staff_id);
            const started = a.check_in || a.created_at;
            const busy = d.todayJobsByStaff.get(a.staff_id)?.length ?? 0;
            return (
              <div className="ed-row" key={a.id}>
                <div className="ed-ava tone-green" onClick={() => onOpenProfile(a.staff_id)}>{initials(s?.full_name ?? a.staff?.full_name ?? '?')}</div>
                <div className="ed-main" onClick={() => onOpenProfile(a.staff_id)}>
                  <div className="ed-name">{s?.full_name ?? a.staff?.full_name ?? nameOf(a.staff_id)}</div>
                  <div className="ed-sub">На смене {duration(d.now - new Date(started).getTime())} · пришёл в {fmtTime(started)}</div>
                </div>
                <span className={`ed-chip ${busy ? 'is-blue' : 'is-green'}`}>{busy ? `${busy} ${plural(busy, 'работа', 'работы', 'работ')}` : 'Свободен'}</span>
                {canManage && <button type="button" className="ed-btn" onClick={() => onCheckOut(a.id)}>Завершить смену</button>}
              </div>
            );
          })}
          {canManage && notIn.length > 0 && (
            <>
              <div className="ed-sec">Ещё не пришли — отметить</div>
              <div className="ed-chips">
                {notIn.slice(0, 10).map((s) => <button type="button" key={s.id} className="ed-chip-btn" onClick={() => onCheckIn(s.id)}>+ {firstName(s)}</button>)}
              </div>
            </>
          )}
        </DxCard>

        <DxCard eyebrow="Внимание" title="Что нужно сделать" right={<span className="ch-badge is-gray" style={{ cursor: 'pointer' }} onClick={() => onOpenTab('tasks')}>Все задачи</span>}>
          {openTasks.length === 0 && <Empty>Открытых задач нет — всё под контролем.</Empty>}
          {openTasks.slice(0, 5).map((t) => {
            const due = t.deadline ? dueText(t.deadline, d.todayKey) : null;
            return (
              <div className="ed-row" key={t.id}>
                <span className={`ed-dot ${due?.late ? 'is-red' : t.status === 'in_progress' ? 'is-blue' : 'is-gray'}`} />
                <div className="ed-main">
                  <div className="ed-name">{t.title}</div>
                  <div className={`ed-sub${due?.late ? ' is-late' : ''}`}>{nameOf(t.staff_id)}{t.deadline ? ` · ${fmtDate(t.deadline)}` : ''}{due ? ` · ${due.text}` : ''}</div>
                </div>
                <span className={`ed-chip ${t.status === 'in_progress' ? 'is-blue' : 'is-gray'}`}>{t.status === 'in_progress' ? 'В работе' : 'Ждёт'}</span>
              </div>
            );
          })}
          {openTasks.length > 5 && <div className="ed-more" onClick={() => onOpenTab('tasks')}>Ещё {openTasks.length - 5}…</div>}
        </DxCard>

        <DxCard eyebrow="Боксы и посты" title="Загрузка постов" right={<span className="ch-badge is-gray">{bays.length} {plural(bays.length, 'пост', 'поста', 'постов')}</span>}>
          {bays.length === 0 && <Empty>{period === 'today' ? 'На сегодня работы по постам не распределены.' : 'На ближайшие 7 дней работы по постам не распределены.'}</Empty>}
          {bays.map(([bay, list]) => (
            <div className="ed-bay" key={bay}>
              <div className="ed-bay-head"><span>{bay}</span><span className="ed-chip is-blue">{list.length}</span></div>
              {list.slice(0, 3).map((b) => (
                <div className="ed-bay-job" key={b.id}>
                  <span className="ed-bay-time">{period === 'week' ? `${dayLabel(keyOfIso(b.scheduled_at), d.todayKey)}, ` : ''}{fmtTime(b.scheduled_at)}</span>
                  <span className="ed-bay-what">{b.services?.name ?? 'Заказ'}</span>
                  <span className="ed-bay-who">{nameOf(b.assigned_technician_id!)}</span>
                </div>
              ))}
              {list.length > 3 && <div className="ed-more">и ещё {list.length - 3}</div>}
            </div>
          ))}
        </DxCard>

        <DxCard eyebrow={period === 'today' ? 'Порядок дня' : 'Ближайшая неделя'} title="Хронология" right={<span className="ch-badge is-gray" style={{ cursor: 'pointer' }} onClick={() => onOpenTab('schedule')}>Календарь смен</span>}>
          {timeline.length === 0 && <Empty>{period === 'today' ? 'На сегодня событий нет.' : 'На эти дни событий нет.'}</Empty>}
          {timeline.slice(0, 9).map((it, i, arr) => (
            <div key={it.id}>
              {(i === 0 || arr[i - 1].key !== it.key) && period === 'week' && <div className="ed-sec" style={{ marginTop: i ? 12 : 0 }}>{dayLabel(it.key, d.todayKey)}</div>}
              <div className="ed-tl" onClick={() => onOpenProfile(it.staffId)}>
                <span className="ed-tl-time">{it.time}</span>
                <span className={`ed-dot ${it.tone === 'job' ? 'is-blue' : it.tone === 'shift' ? 'is-green' : 'is-orange'}`} />
                <span className="ed-tl-text"><b>{it.title}</b><em>{it.sub}</em></span>
              </div>
            </div>
          ))}
          {timeline.length > 9 && <div className="ed-more" onClick={() => onOpenTab('schedule')}>Ещё {timeline.length - 9}…</div>}
        </DxCard>

        <DxCard eyebrow="Резерв" title="Кто свободен" right={<span className="ch-badge is-gray">{freeNow.length}</span>}>
          {freeNow.length === 0 && <Empty>Все, кто на смене, заняты — свободных рук нет.</Empty>}
          <div className="ed-chips">
            {freeNow.map((s) => (
              <button type="button" key={s.id} className="ed-person" onClick={() => onOpenProfile(s.id)}>
                <span className="ed-ava is-sm tone-green">{initials(s.full_name)}</span>
                <span><b>{s.full_name}</b><em>{s.role}</em></span>
              </button>
            ))}
          </div>
        </DxCard>

        <DxCard eyebrow="Кадры" title="Отсутствуют и в отпуске" right={<span className="ch-badge is-gray">{awayList.length}</span>}>
          {awayList.length === 0 && <Empty>Сегодня все на месте.</Empty>}
          {awayList.map((s) => (
            <div className="ed-row" key={s.id} onClick={() => onOpenProfile(s.id)} style={{ cursor: 'pointer' }}>
              <div className="ed-ava tone-purple">{initials(s.full_name)}</div>
              <div className="ed-main"><div className="ed-name">{s.full_name}</div><div className="ed-sub">{s.role}</div></div>
              <span className="ed-chip is-purple">{d.awayReason.get(s.id)}</span>
            </div>
          ))}
        </DxCard>
      </div>

      {/* ───────── roster ───────── */}
      <DxCard eyebrow="Состав" title="Команда" right={<span className="ch-badge is-gray">{visible.length} из {d.active.length}</span>}>
        {d.active.length === 0 && (
          <div className="ed-empty" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            Сотрудников пока нет.
            {canManage && <button type="button" className="ed-btn" onClick={onAddStaff}>+ Новый сотрудник</button>}
          </div>
        )}
        {d.active.length > 0 && visible.length === 0 && <Empty>Никого не найдено — измените фильтры.</Empty>}
        <div className="staff-grid">
          {visible.map((s) => {
            const st = statusOf(s);
            const shift = d.shiftByStaff.get(s.id);
            const myJobs = d.jobsByStaff.get(s.id) ?? [];
            return (
              <div className="staff-card" key={s.id} onClick={() => onOpenProfile(s.id)}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div className={`ed-ava ${st === 'in' ? 'tone-green' : st === 'away' ? 'tone-purple' : 'tone-gray'}`}>{initials(s.full_name)}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="staff-name">
                      {s.full_name}
                      <span className={`module-badge ${availabilityClass(s.availability_status)}`} style={{ marginLeft: 8 }}>{AVAILABILITY_LABELS[s.availability_status ?? 'available']}</span>
                    </div>
                    <div className="staff-role">{s.role}{s.department ? ` · ${s.department}` : ''}</div>
                    <div className={`ed-state is-${st}`}>
                      <Clock size={12} strokeWidth={2} />
                      {st === 'away' ? d.awayReason.get(s.id) : shift ? `На смене с ${fmtTime(shift.check_in || shift.created_at)}` : 'Не отмечен'}
                      {' · '}{jobCounts[s.id]?.active ?? 0} в работе
                    </div>
                  </div>
                </div>
                <div className="ed-card-jobs">
                  {myJobs.length
                    ? myJobs.slice(0, 3).map((b) => (
                        <div key={b.id}><b>{period === 'week' ? `${dayLabel(keyOfIso(b.scheduled_at), d.todayKey)}, ` : ''}{fmtTime(b.scheduled_at)}</b> {b.services?.name ?? 'Заказ'}{b.bay ? ` · ${b.bay}` : ''}</div>
                      ))
                    : <span>{period === 'today' ? 'На сегодня работ не назначено' : 'На неделю работ не назначено'}</span>}
                  {myJobs.length > 3 && <span>и ещё {myJobs.length - 3}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </DxCard>

      <DxCard eyebrow="Обучение" title="Сертификаты и допуски" right={<span className="ch-badge is-gray" style={{ cursor: 'pointer' }} onClick={() => onOpenTab('training')}>Все записи</span>}>
        {certs.length === 0 && <div className="ed-empty ed-ok"><BadgeCheck size={16} strokeWidth={2} /> Ближайшие 30 дней ничего не истекает.</div>}
        {certs.slice(0, 6).map((t) => {
          const expired = new Date(t.expires_at!).getTime() <= d.now;
          return (
            <div className="ed-row" key={t.id}>
              <span className={`ed-dot ${expired ? 'is-red' : 'is-orange'}`} />
              <div className="ed-main">
                <div className="ed-name">{t.course_name}</div>
                <div className={`ed-sub${expired ? ' is-late' : ''}`}>{nameOf(t.staff_id)} · {expired ? 'истёк' : 'действует до'} {fmtDate(t.expires_at!)}</div>
              </div>
            </div>
          );
        })}
      </DxCard>
    </div>
  );
}
