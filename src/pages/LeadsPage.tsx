import { SourceIcon } from '../components/leads/SourceIcon';
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  ArrowLeft, ArrowRight, CalendarClock, Check, ChevronDown, ChevronUp, Clock, LayoutGrid, List,
  ListChecks, Mail, MessageCircle, Maximize2, Minimize2, Pencil, Phone, RotateCcw, Search, Trash2, X,
} from 'lucide-react';
import { useAnalyticsVisibility } from '../hooks/useAnalyticsVisibility';
import { AnalyticsToggle } from '../components/dashboard/AnalyticsToggle';
import { LeadsDashboardPro, type DashPreset } from '../components/leads/LeadsDashboardPro';
import { useLocalQuery } from '../hooks/useLocalData';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { canManageLeads, isAdmin } from '../lib/permissions';
import { useDataRefresh } from '../contexts/DataRefreshContext';
import { db } from '../lib/localdb';
import { LEAD_SOURCE_LABELS, LEAD_STATUS_LABELS, LEAD_LOST_REASONS, leadVehicleDisplay } from '../lib/constants';
import {
  LEAD_SERVICE_INTERESTS,
  LEAD_STAGES,
  SERVICE_LABEL,
  SMART_LABELS,
  STAGE_PROBABILITY,
  STAGE_TINT,
  digits,
  findDuplicates,
  fmtCompactRub,
  fmtRub,
  followState,
  formatAge,
  idleDays,
  initials,
  isOpenLead,
  isOverdueLead,
  isStaleLead,
  leadFullName,
  leadValue,
  leadValueNum,
  matchesSmart,
  nextActionLabel,
  scoreLabel,
  scoreLead,
  scoreTone,
  type FollowState,
  type LeadScore,
  type SmartFilter,
} from '../lib/leads';
import type { Customer, Lead, LeadActivity, Staff } from '../types/database';
import '../styles/leads.css';

type ViewMode = 'list' | 'board' | 'tasks';
type FollowFilter = '' | FollowState;
type SortKey = 'created' | 'score' | 'next' | 'value' | 'name' | 'source';

interface SavedViewFilters {
  statusFilter: string;
  sourceFilter: string;
  ownerFilter: string;
  smart: SmartFilter;
  followFilter: FollowFilter;
  search: string;
}

const SAVED_VIEWS_KEY = 'uo:leads:savedViews:v2';
const FOLLOW_LABELS: Record<string, string> = { overdue: 'Просрочено', today: 'Сегодня', upcoming: 'Скоро' };
const toIsoDay = (offsetDays: number, hour = 10) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const ACTIVITY_LABEL: Record<string, string> = { note: 'Заметка', status_change: 'Статус', call: 'Звонок', converted: 'Конверсия' };

/** Native <select> with the platform arrow hidden and a single, consistent chevron.
 *  Lives at module level so its identity is stable between renders. */
function SelectField({ value, onChange, children, ariaLabel, highlight = false, className = '' }: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  ariaLabel?: string;
  highlight?: boolean;
  className?: string;
}) {
  return (
    <div className={`ld-select-wrap${highlight ? ' is-set' : ''}${className ? ` ${className}` : ''}`}>
      <select className="ld-select" value={value} aria-label={ariaLabel} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      <ChevronDown size={14} className="ld-select-chev" aria-hidden />
    </div>
  );
}

/** iOS-style grouped block: a quiet title above a rounded card. `flush` removes the
 *  card padding so rows (`.ld-cell`) can run edge to edge with hairline separators. */
function Group({ title, children, flush = false, footer }: { title?: string; children: ReactNode; flush?: boolean; footer?: ReactNode }) {
  return (
    <section className="ld-group">
      {title && <h3 className="ld-group-title">{title}</h3>}
      <div className={`ld-group-card${flush ? ' is-flush' : ''}`}>{children}</div>
      {footer && <div className="ld-group-footer">{footer}</div>}
    </section>
  );
}

export function LeadsPage({ onEdit }: { onEdit: (l: Lead | null) => void }) {
  const [showCharts, toggleCharts] = useAnalyticsVisibility('leads');
  const { data: leads, remove, update } = useLocalQuery<Lead>('leads', '*', { orderBy: 'created_at' });
  const { data: staffList } = useLocalQuery<Staff>('staff', '*', { orderBy: 'full_name', ascending: true });
  const { data: customers } = useLocalQuery<Customer>('customers', '*');
  const { toast } = useToast();
  const { refresh } = useDataRefresh();
  const { profile } = useAuth();
  const canManage = canManageLeads(profile?.role);
  const canDelete = isAdmin(profile?.role);

  const [view, setView] = useState<ViewMode>('list');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [smart, setSmart] = useState<SmartFilter>('');
  const [followFilter, setFollowFilter] = useState<FollowFilter>('');
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkOwner, setBulkOwner] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const dragRef = useRef<string | null>(null);
  const movingRef = useRef(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [stepNote, setStepNote] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [valueDraft, setValueDraft] = useState('');
  const [savedViews, setSavedViews] = useState<{ name: string; filters: SavedViewFilters }[]>(() => {
    try { return JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY) || '[]'); } catch { return []; }
  });

  const staffName = (staffId: string | null) => staffList.find((s) => s.id === staffId)?.full_name ?? '—';
  const dups = useMemo(() => findDuplicates(leads), [leads]);
  const scores = useMemo(() => new Map<string, LeadScore>(leads.map((l) => [l.id, scoreLead(l)])), [leads]);
  const scoreOf = (l: Lead) => scores.get(l.id)?.score ?? 0;

  /* ---------------- filtering ---------------- */

  const passes = (l: Lead, skip?: 'status' | 'smart') => {
    const q = search.trim().toLowerCase();
    if (q) {
      const hay = `${leadFullName(l)} ${l.phone ?? ''} ${digits(l.phone)} ${l.email ?? ''} ${leadVehicleDisplay(l)} ${(l.tags ?? []).join(' ')} ${SERVICE_LABEL[l.service_interest ?? ''] ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (skip !== 'status' && statusFilter && l.status !== statusFilter) return false;
    if (sourceFilter && l.source !== sourceFilter) return false;
    if (ownerFilter === '__none' ? !!l.owner_id : ownerFilter && l.owner_id !== ownerFilter) return false;
    if (skip !== 'smart' && smart && !matchesSmart(l, smart, dups)) return false;
    if (followFilter) {
      if (!isOpenLead(l)) return false;
      if (followState(l.next_action_at) !== followFilter) return false;
    }
    return true;
  };

  const filtered = useMemo(() => {
    const list = leads.filter((l) => passes(l));
    const dir = sortDir === 'asc' ? 1 : -1;
    const cmp = (a: Lead, b: Lead) => {
      switch (sortKey) {
        case 'score': return ((isOpenLead(a) ? scoreOf(a) : -1) - (isOpenLead(b) ? scoreOf(b) : -1)) * dir;
        case 'value': return (leadValueNum(a) - leadValueNum(b)) * dir;
        case 'name': return leadFullName(a).localeCompare(leadFullName(b), 'ru') * dir;
        case 'source': return LEAD_SOURCE_LABELS[a.source].localeCompare(LEAD_SOURCE_LABELS[b.source], 'ru') * dir;
        case 'next': {
          const ta = a.next_action_at ? new Date(a.next_action_at).getTime() : Number.POSITIVE_INFINITY;
          const tb = b.next_action_at ? new Date(b.next_action_at).getTime() : Number.POSITIVE_INFINITY;
          if (ta === tb) return 0;
          return (ta < tb ? -1 : 1) * dir;
        }
        default: return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
      }
    };
    return [...list].sort(cmp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, search, statusFilter, sourceFilter, ownerFilter, smart, followFilter, sortKey, sortDir, dups, scores]);

  const statusCounts = useMemo(() => {
    const base = leads.filter((l) => passes(l, 'status'));
    const map: Record<string, number> = { '': base.length };
    LEAD_STAGES.forEach((s) => { map[s] = base.filter((l) => l.status === s).length; });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, search, sourceFilter, ownerFilter, smart, followFilter, dups]);

  const activeFilters: { key: string; label: string; clear: () => void }[] = [];
  if (search.trim()) activeFilters.push({ key: 'search', label: `Поиск: «${search.trim()}»`, clear: () => setSearch('') });
  if (statusFilter) activeFilters.push({ key: 'status', label: `Статус: ${LEAD_STATUS_LABELS[statusFilter]}`, clear: () => setStatusFilter('') });
  if (sourceFilter) activeFilters.push({ key: 'source', label: `Источник: ${LEAD_SOURCE_LABELS[sourceFilter] ?? sourceFilter}`, clear: () => setSourceFilter('') });
  if (ownerFilter) activeFilters.push({ key: 'owner', label: `Ответственный: ${ownerFilter === '__none' ? 'не назначен' : staffName(ownerFilter)}`, clear: () => setOwnerFilter('') });
  if (followFilter) activeFilters.push({ key: 'follow', label: `Задачи: ${FOLLOW_LABELS[followFilter]}`, clear: () => setFollowFilter('') });
  if (smart) activeFilters.push({ key: 'smart', label: SMART_LABELS[smart], clear: () => setSmart('') });

  const resetFilters = () => {
    setSearch(''); setStatusFilter(''); setSourceFilter(''); setOwnerFilter(''); setSmart(''); setFollowFilter('');
  };

  const applyPreset = (p: DashPreset) => {
    resetFilters();
    if (p.status) setStatusFilter(p.status);
    if (p.smart) setSmart(p.smart);
    if (p.follow) setFollowFilter(p.follow);
    if (p.source) setSourceFilter(p.source);
    if (p.owner) setOwnerFilter(p.owner);
    setTimeout(() => document.getElementById('ld-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir(k === 'name' || k === 'next' ? 'asc' : 'desc'); }
  };

  const selected = leads.find((l) => l.id === selectedId) ?? null;

  /* ---------------- saved views ---------------- */

  const saveCurrentView = () => {
    const name = window.prompt('Название сохранённого вида:');
    if (!name || !name.trim()) return;
    const filters: SavedViewFilters = { statusFilter, sourceFilter, ownerFilter, smart, followFilter, search };
    const next = [...savedViews.filter((v) => v.name !== name.trim()), { name: name.trim(), filters }];
    setSavedViews(next);
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
    toast('Вид сохранён');
  };
  const applySavedView = (name: string) => {
    const v = savedViews.find((sv) => sv.name === name);
    if (!v) return;
    setStatusFilter(v.filters.statusFilter);
    setSourceFilter(v.filters.sourceFilter);
    setOwnerFilter(v.filters.ownerFilter);
    setSmart(v.filters.smart);
    setFollowFilter(v.filters.followFilter);
    setSearch(v.filters.search);
  };
  const deleteSavedView = (name: string) => {
    const next = savedViews.filter((v) => v.name !== name);
    setSavedViews(next);
    localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(next));
  };

  /* ---------------- activity log ---------------- */

  useEffect(() => {
    let cancelled = false;
    setNoteDraft(''); setStepNote(''); setTagDraft('');
    if (!selectedId) { setActivities([]); return; }
    db.from('lead_activities').select('*').eq('lead_id', selectedId).order('created_at', { ascending: false }).then(({ data }: { data: unknown }) => {
      if (!cancelled) setActivities((data as LeadActivity[]) ?? []);
    });
    return () => { cancelled = true; };
  }, [selectedId]);

  useEffect(() => {
    setValueDraft(selected?.est_value ? String(selected.est_value) : '');
  }, [selected?.id, selected?.est_value]);

  useEffect(() => {
    setCheckedIds((prev) => {
      const next = new Set<string>();
      filtered.forEach((l) => { if (prev.has(l.id)) next.add(l.id); });
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelectedId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  // Opening a lead has to actually show it. On phones/tablets the panel is stacked
  // below the whole list (thousands of px down), and on desktop it sits beside a
  // table that starts under the toolbar — so bring it into view when it isn't.
  useEffect(() => {
    if (!selectedId) return;
    const t = window.setTimeout(() => {
      const drawer = document.querySelector<HTMLElement>('.ld-drawer');
      if (!drawer) return;
      const bar = document.querySelector<HTMLElement>('.topbar');
      const barBottom = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0;
      const rect = drawer.getBoundingClientRect();
      const stacked = window.matchMedia('(max-width: 900px)').matches;
      if (stacked) {
        const inView = rect.top >= barBottom - 8 && rect.top < window.innerHeight * 0.5;
        if (!inView) drawer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (rect.top > barBottom + 160) {
        (document.querySelector<HTMLElement>('.ld-split') ?? drawer).scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 80);
    return () => window.clearTimeout(t);
  }, [selectedId]);

  // Collapse back to the side-by-side layout whenever the panel closes or a
  // different lead is opened, so "expanded" never carries over unexpectedly.
  useEffect(() => { setDrawerExpanded(false); }, [selectedId]);

  const logActivity = async (leadId: string, type: LeadActivity['type'], body: string) => {
    await db.from('lead_activities').insert({ lead_id: leadId, type, body, author_id: profile?.id ?? null });
    if (selectedId === leadId) {
      const { data } = await db.from('lead_activities').select('*').eq('lead_id', leadId).order('created_at', { ascending: false });
      setActivities((data as LeadActivity[]) ?? []);
    }
  };

  const touchLead = async (lead: Lead) => {
    await db.from('leads').update({ status: lead.status }).eq('id', lead.id);
    refresh();
  };

  const addNote = async () => {
    if (!selected || !noteDraft.trim()) return;
    await logActivity(selected.id, 'note', noteDraft.trim());
    await touchLead(selected);
    setNoteDraft('');
    toast('Заметка добавлена');
  };

  const logCall = async (lead: Lead) => {
    const outcome = window.prompt('Итог звонка (кратко):', 'Дозвонились, обсудили запрос');
    if (outcome === null) return;
    await logActivity(lead.id, 'call', outcome.trim() || 'Звонок');
    if (lead.status === 'new') {
      await update(lead.id, { status: 'contacted' } as Partial<Lead>);
      await logActivity(lead.id, 'status_change', `Статус изменён: ${LEAD_STATUS_LABELS.new} → ${LEAD_STATUS_LABELS.contacted}`);
    } else {
      await touchLead(lead);
    }
    toast('Звонок записан');
  };

  /* ---------------- lead actions ---------------- */

  const convertToCustomer = async (lead: Lead) => {
    const fullName = leadFullName(lead);
    const { data: existingCustomers } = await db.from('customers').select('id, full_name, phone, email');
    const dup = (existingCustomers ?? []).find((c: { phone?: string; email?: string }) =>
      (lead.phone && c.phone && c.phone === lead.phone) || (lead.email && c.email && c.email === lead.email),
    );
    let customerId: string;
    const createCustomer = async () => {
      const { data, error } = await db.from('customers').insert({
        full_name: fullName, phone: lead.phone, email: lead.email, notes: lead.notes, status: 'active',
      }).select('id').single();
      if (error) { toast('Ошибка: ' + error.message); return null; }
      return data.id as string;
    };
    if (dup) {
      const useExisting = window.confirm(
        `Найден существующий клиент с таким же телефоном/email: «${dup.full_name}».\n\nOK — использовать существующего клиента.\nОтмена — всё равно создать нового.`,
      );
      if (useExisting) customerId = dup.id;
      else { const id = await createCustomer(); if (!id) return; customerId = id; }
    } else {
      const id = await createCustomer();
      if (!id) return;
      customerId = id;
    }

    if (lead.car_brand || lead.car_model) {
      const { error: vehErr } = await db.from('vehicles').insert({
        customer_id: customerId,
        brand: lead.car_brand || lead.car_model || '—',
        model: lead.car_model || lead.car_brand || '—',
        pipeline_stage: 'Входящие авто',
        intake_at: new Date().toISOString(),
      });
      if (vehErr) toast('Клиент создан, но авто не добавлено: ' + vehErr.message);
    }

    await update(lead.id, { status: 'converted', converted_customer_id: customerId, next_action_at: null, next_action_note: null } as Partial<Lead>);
    await logActivity(lead.id, 'converted', dup ? `Лид конвертирован — привязан к существующему клиенту «${dup.full_name}»` : 'Лид конвертирован в нового клиента');
    refresh();
    toast('Лид конвертирован в клиента');
  };

  const setStatus = async (lead: Lead, status: string) => {
    if (status === lead.status) return;
    if (status === 'converted') { await convertToCustomer(lead); return; }
    let lost_reason: string | null = lead.lost_reason ?? null;
    if (status === 'lost') {
      const reason = window.prompt(`Причина потери лида (например: ${LEAD_LOST_REASONS.slice(0, 3).join(', ')})`, LEAD_LOST_REASONS[0]);
      if (reason === null) return;
      lost_reason = reason.trim() || 'Не указана';
    }
    const patch: Partial<Lead> = { status: status as Lead['status'], lost_reason: status === 'lost' ? lost_reason : null };
    if (['lost', 'junk'].includes(status)) { patch.next_action_at = null; patch.next_action_note = null; }
    const err = await update(lead.id, patch);
    if (err) { toast('Ошибка: ' + err); return; }
    await logActivity(lead.id, 'status_change', `Статус изменён: ${LEAD_STATUS_LABELS[lead.status]} → ${LEAD_STATUS_LABELS[status]}${status === 'lost' ? ` (${lost_reason})` : ''}`);
    toast(`Статус: ${LEAD_STATUS_LABELS[status]}`);
  };

  const moveTo = async (lead: Lead, status: string) => {
    if (movingRef.current) return;
    movingRef.current = true;
    try { await setStatus(lead, status); } catch (e) { toast('Ошибка: ' + (e instanceof Error ? e.message : String(e))); } finally { movingRef.current = false; }
  };

  const advanceStatus = async (lead: Lead, dir: 1 | -1 = 1) => {
    const cycle = ['new', 'contacted', 'qualified', 'converted'];
    const idx = cycle.indexOf(lead.status);
    if (idx === -1) return;
    const next = cycle[idx + dir];
    if (!next) return;
    await moveTo(lead, next);
  };

  const deleteLead = async (lead: Lead) => {
    if (!window.confirm(`Удалить лид «${leadFullName(lead)}»?`)) return;
    const err = await remove(lead.id);
    if (err) toast('Ошибка: ' + err);
    else { toast('Лид удалён'); if (selectedId === lead.id) setSelectedId(null); }
  };

  const setNextAction = async (lead: Lead, offsetDays: number | null, note?: string) => {
    const patch: Partial<Lead> = offsetDays === null
      ? { next_action_at: null, next_action_note: null }
      : { next_action_at: toIsoDay(offsetDays), next_action_note: (note ?? lead.next_action_note ?? 'Перезвонить') || 'Перезвонить' };
    const err = await update(lead.id, patch);
    if (err) { toast('Ошибка: ' + err); return; }
    await logActivity(lead.id, 'note', offsetDays === null ? 'Следующий шаг снят' : `Следующий шаг: ${patch.next_action_note} — ${new Date(patch.next_action_at as string).toLocaleDateString('ru-RU')}`);
    toast(offsetDays === null ? 'Шаг снят' : 'Следующий шаг назначен');
  };

  const completeTask = async (lead: Lead) => {
    const done = lead.next_action_note ? `Выполнено: ${lead.next_action_note}` : 'Задача выполнена';
    await update(lead.id, { next_action_at: null, next_action_note: null } as Partial<Lead>);
    await logActivity(lead.id, 'call', done);
    toast('Задача выполнена — назначьте следующий шаг');
  };

  const saveValue = async (lead: Lead) => {
    const n = Number(valueDraft.replace(/\s/g, '').replace(',', '.'));
    const next = valueDraft.trim() === '' ? null : Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
    if (next === undefined) { toast('Введите сумму числом'); return; }
    if ((lead.est_value ?? null) === next) return;
    const err = await update(lead.id, { est_value: next } as Partial<Lead>);
    if (err) toast('Ошибка: ' + err); else toast('Сумма сохранена');
  };

  const addTag = async (lead: Lead) => {
    const t = tagDraft.trim().toLowerCase();
    if (!t) return;
    if ((lead.tags ?? []).includes(t)) { setTagDraft(''); return; }
    await update(lead.id, { tags: [...(lead.tags ?? []), t] } as Partial<Lead>);
    setTagDraft('');
  };
  const removeTag = async (lead: Lead, t: string) => {
    await update(lead.id, { tags: (lead.tags ?? []).filter((x) => x !== t) } as Partial<Lead>);
  };

  const onDropStage = (stage: string, e?: DragEvent) => {
    e?.preventDefault();
    const id = dragRef.current || e?.dataTransfer?.getData('text/plain') || dragId;
    const lead = leads.find((l) => l.id === id);
    dragRef.current = null;
    setDragId(null);
    setDragOver(null);
    if (lead) void moveTo(lead, stage);
  };

  /* ---------------- bulk ---------------- */

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleCheckAll = () => setCheckedIds((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((l) => l.id))));

  const applyBulkStatus = async () => {
    if (!bulkStatus || !checkedIds.size) return;
    const ids = Array.from(checkedIds);
    if (bulkStatus === 'lost') {
      const reason = window.prompt(`Причина потери для ${ids.length} лидов`, LEAD_LOST_REASONS[0]);
      if (reason === null) return;
      const { error } = await db.from('leads').update({ status: 'lost', lost_reason: reason.trim() || 'Не указана', next_action_at: null, next_action_note: null }).in('id', ids);
      if (error) { toast('Ошибка: ' + error.message); return; }
      for (const id of ids) await logActivity(id, 'status_change', `Статус изменён на «Потерян» (${reason.trim() || 'Не указана'})`);
    } else if (bulkStatus === 'converted') {
      for (const l of filtered.filter((x) => checkedIds.has(x.id) && x.status !== 'converted')) await convertToCustomer(l);
    } else {
      const { error } = await db.from('leads').update({ status: bulkStatus }).in('id', ids);
      if (error) { toast('Ошибка: ' + error.message); return; }
      for (const id of ids) await logActivity(id, 'status_change', `Статус изменён на «${LEAD_STATUS_LABELS[bulkStatus]}»`);
    }
    refresh();
    toast(`Статус обновлён у ${ids.length} лидов`);
    setCheckedIds(new Set());
    setBulkStatus('');
  };

  const applyBulkOwner = async () => {
    if (!bulkOwner || !checkedIds.size) return;
    const ids = Array.from(checkedIds);
    const { error } = await db.from('leads').update({ owner_id: bulkOwner }).in('id', ids);
    if (error) { toast('Ошибка: ' + error.message); return; }
    for (const id of ids) await logActivity(id, 'note', `Ответственный назначен: ${staffName(bulkOwner)}`);
    refresh();
    toast(`Ответственный назначен для ${ids.length} лидов`);
    setCheckedIds(new Set());
    setBulkOwner('');
  };

  const bulkFollow = async (offset: number) => {
    const ids = Array.from(checkedIds);
    if (!ids.length) return;
    const { error } = await db.from('leads').update({ next_action_at: toIsoDay(offset), next_action_note: 'Перезвонить' }).in('id', ids);
    if (error) { toast('Ошибка: ' + error.message); return; }
    refresh();
    toast(`Шаг назначен: ${ids.length}`);
  };

  const bulkDelete = async () => {
    if (!checkedIds.size) return;
    if (!window.confirm(`Удалить выбранные лиды (${checkedIds.size})?`)) return;
    const { error } = await db.from('leads').delete().in('id', Array.from(checkedIds));
    if (error) { toast('Ошибка: ' + error.message); return; }
    refresh();
    toast(`Удалено лидов: ${checkedIds.size}`);
    setCheckedIds(new Set());
  };

  const exportCSV = (onlyChecked = false) => {
    const source = onlyChecked && checkedIds.size ? filtered.filter((l) => checkedIds.has(l.id)) : filtered;
    const rows = [['Имя', 'Телефон', 'Email', 'Авто', 'Услуга', 'Источник', 'Статус', 'Скоринг', 'Сумма, ₽', 'Ответственный', 'Теги', 'Следующее действие', 'Дата'],
      ...source.map((l) => [leadFullName(l), l.phone, l.email, leadVehicleDisplay(l), SERVICE_LABEL[l.service_interest ?? ''] ?? '', LEAD_SOURCE_LABELS[l.source], LEAD_STATUS_LABELS[l.status], scoreOf(l), leadValue(l)?.value ?? '', staffName(l.owner_id), (l.tags ?? []).join('; '), nextActionLabel(l) ?? '', new Date(l.created_at).toLocaleDateString('ru-RU')])];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'leads.csv';
    a.click();
    toast('Файл выгружен');
  };

  /* ---------------- small render helpers ---------------- */

  const StatusPill = ({ status }: { status: string }) => (
    <span className="ld-pill" style={{ ['--pill' as string]: STAGE_TINT[status] }}>{LEAD_STATUS_LABELS[status]}</span>
  );

  const ScoreBadge = ({ lead }: { lead: Lead }) => {
    const sc = scoreOf(lead);
    const closed = !isOpenLead(lead);
    return (
      <span className={`ld-score is-${closed ? 'gray' : scoreTone(sc)}`} title={closed ? LEAD_STATUS_LABELS[lead.status] : `${scoreLabel(sc)} · ${sc}`}>
        <b>{closed ? '—' : sc}</b>
        <span className="ld-score-bar"><i style={{ width: `${closed ? 0 : sc}%` }} /></span>
      </span>
    );
  };

  const Flags = ({ lead, max }: { lead: Lead; max?: number }) => {
    const items: { key: string; tone: string; title: string; label: string }[] = [];
    if (isOverdueLead(lead)) items.push({ key: 'task', tone: 'red', title: 'Просрочена задача', label: 'задача' });
    if (isStaleLead(lead)) items.push({ key: 'stale', tone: 'orange', title: 'Нет движения 3+ дня', label: 'завис' });
    if (dups.has(lead.id)) items.push({ key: 'dup', tone: 'blue', title: 'Совпадает телефон или email с другим лидом', label: 'дубль' });
    if (!items.length) return null;
    const shown = max ? items.slice(0, max) : items;
    const hidden = items.slice(shown.length);
    return (
      <span className="ld-flags">
        {shown.map((f) => <span key={f.key} className={`ld-flag is-${f.tone}`} title={f.title}>{f.label}</span>)}
        {hidden.length > 0 && <span className="ld-flag" title={hidden.map((f) => f.title).join('\n')}>+{hidden.length}</span>}
      </span>
    );
  };

  const ValueCell = ({ lead }: { lead: Lead }) => {
    const v = leadValue(lead);
    if (!v) return <span className="ld-muted">—</span>;
    return <span title={v.estimated ? 'Ориентир по услуге — укажите бюджет в карточке' : 'Бюджет из карточки'}>{v.estimated ? '≈ ' : ''}{fmtCompactRub(v.value)}</span>;
  };

  const SortTh = ({ k, children, className }: { k: SortKey; children: string; className?: string }) => (
    <th className={`ld-sortable ${className ?? ''}`} onClick={() => toggleSort(k)}>
      {children}
      {sortKey === k && (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
    </th>
  );

  const telHref = (l: Lead) => (l.phone ? `tel:${l.phone.replace(/[^\d+]/g, '')}` : undefined);
  const waHref = (l: Lead) => (digits(l.phone) ? `https://wa.me/${digits(l.phone)}` : undefined);

  const shownValue = filtered.filter(isOpenLead).reduce((s, l) => s + leadValueNum(l), 0);
  const filtersOn = activeFilters.length > 0;

  /* ---------------- tasks view groups ---------------- */

  const taskGroups = useMemo(() => {
    const open = filtered.filter(isOpenLead);
    const byDay = (l: Lead) => (l.next_action_at ? (followState(l.next_action_at) === 'overdue' ? -1 : Math.max(0, Math.round((new Date(new Date(l.next_action_at).setHours(0, 0, 0, 0)).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000))) : null);
    const groups: { id: string; title: string; tone: string; items: Lead[] }[] = [
      { id: 'overdue', title: 'Просрочено', tone: 'red', items: [] },
      { id: 'today', title: 'Сегодня', tone: 'orange', items: [] },
      { id: 'tomorrow', title: 'Завтра', tone: 'blue', items: [] },
      { id: 'week', title: 'В течение недели', tone: 'blue', items: [] },
      { id: 'later', title: 'Позже', tone: 'gray', items: [] },
      { id: 'none', title: 'Без следующего шага', tone: 'gray', items: [] },
    ];
    open.forEach((l) => {
      const d = byDay(l);
      const g = d === null ? 'none' : d < 0 ? 'overdue' : d === 0 ? 'today' : d === 1 ? 'tomorrow' : d <= 7 ? 'week' : 'later';
      groups.find((x) => x.id === g)!.items.push(l);
    });
    groups.forEach((g) => g.items.sort((a, b) => {
      if (g.id === 'none') return scoreOf(b) - scoreOf(a);
      return new Date(a.next_action_at ?? 0).getTime() - new Date(b.next_action_at ?? 0).getTime();
    }));
    return groups.filter((g) => g.items.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, scores]);

  /* ---------------- detail drawer ---------------- */

  const renderDrawer = () => {
    if (!selected) return null;
    const sc = scores.get(selected.id) ?? { score: 0, factors: [] };
    const open = isOpenLead(selected);
    const dupLeads = (dups.get(selected.id) ?? []).map((id) => leads.find((x) => x.id === id)).filter(Boolean) as Lead[];
    const existingCustomer = selected.phone ? customers.find((c) => c.phone && digits(c.phone) === digits(selected.phone)) : undefined;
    const v = leadValue(selected);
    const prob = STAGE_PROBABILITY[selected.status] ?? 0;
    const fs = followState(selected.next_action_at);

    return (
        <aside className={`ld-drawer${drawerExpanded ? ' is-expanded' : ''}`} role="region" aria-label="Карточка лида">
          <div className="ld-drawer-head">
            <div className={`ld-avatar is-lg is-${open ? scoreTone(sc.score) : 'gray'}`}>{initials(leadFullName(selected))}</div>
            <div className="ld-drawer-title">
              <div className="ld-drawer-name">{leadFullName(selected)}</div>
              <div className="ld-drawer-sub">
                {selected.phone || 'без телефона'}{selected.email ? ` · ${selected.email}` : ''}
              </div>
              <div className="ld-drawer-badges">
                <StatusPill status={selected.status} />
                {open && <span className={`ld-flag is-wide is-${scoreTone(sc.score)}`}>{scoreLabel(sc.score)} · {sc.score}</span>}
                <Flags lead={selected} />
              </div>
            </div>
            <button type="button" className="ld-drawer-expand" onClick={() => setDrawerExpanded((v) => !v)} aria-label={drawerExpanded ? 'Свернуть' : 'Развернуть на весь экран'} title={drawerExpanded ? 'Свернуть' : 'Развернуть на весь экран'}>
              {drawerExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button type="button" className="ld-drawer-close" onClick={() => setSelectedId(null)} aria-label="Закрыть"><X size={16} /></button>
          </div>

          <div className="ld-drawer-body">
            <div className="ld-actions">
              {telHref(selected) ? <a className="ld-action" href={telHref(selected)}><Phone size={18} /><span>Позвонить</span></a> : <span className="ld-action is-off"><Phone size={18} /><span>Позвонить</span></span>}
              {waHref(selected) ? <a className="ld-action" href={waHref(selected)} target="_blank" rel="noreferrer"><MessageCircle size={18} /><span>WhatsApp</span></a> : <span className="ld-action is-off"><MessageCircle size={18} /><span>WhatsApp</span></span>}
              {selected.email ? <a className="ld-action" href={`mailto:${selected.email}`}><Mail size={18} /><span>Email</span></a> : <span className="ld-action is-off"><Mail size={18} /><span>Email</span></span>}
              {canManage ? <button type="button" className="ld-action" onClick={() => logCall(selected)}><ListChecks size={18} /><span>Записать звонок</span></button> : <span className="ld-action is-off"><ListChecks size={18} /><span>Записать звонок</span></span>}
            </div>

            {existingCustomer && selected.status !== 'converted' && (
              <div className="ld-callout is-blue">Этот номер уже есть среди клиентов: <b>{existingCustomer.full_name}</b>. При конвертации можно привязать лид к нему.</div>
            )}
            {!!dupLeads.length && (
              <div className="ld-callout is-orange">
                Возможные дубликаты:{' '}
                {dupLeads.map((d, i) => (
                  <span key={d.id}><button type="button" className="ld-link" onClick={() => setSelectedId(d.id)}>{leadFullName(d)}</button>{i < dupLeads.length - 1 ? ', ' : ''}</span>
                ))}
              </div>
            )}

            {canManage && (
              <Group title="Этап">
                <div className="ld-stepper">
                  {LEAD_STAGES.map((st) => (
                    <button key={st} type="button" className={`ld-step${selected.status === st ? ' is-active' : ''}`} style={{ ['--pill' as string]: STAGE_TINT[st] }} onClick={() => setStatus(selected, st)}>
                      {LEAD_STATUS_LABELS[st]}
                    </button>
                  ))}
                </div>
                {selected.status === 'lost' && selected.lost_reason && <div className="ld-muted" style={{ marginTop: 10 }}>Причина потери: {selected.lost_reason}</div>}
              </Group>
            )}

            <Group title="Следующий шаг">
              <div className={`ld-next${fs === 'overdue' ? ' is-overdue' : ''}`}>
                <CalendarClock size={16} />
                <span>{nextActionLabel(selected) ?? 'Шаг не назначен'}</span>
                {canManage && selected.next_action_at && open && <button type="button" className="ld-link" onClick={() => completeTask(selected)}>Выполнено</button>}
              </div>
              {canManage && open && (
                <>
                  <input className="ld-input" placeholder="Что сделать: перезвонить, отправить КП…" value={stepNote} onChange={(e) => setStepNote(e.target.value)} />
                  <div className="ld-chips">
                    {([['Сегодня', 0], ['Завтра', 1], ['+3 дня', 3], ['+7 дней', 7]] as [string, number][]).map(([label, off]) => (
                      <button key={label} type="button" className="ld-chip" onClick={() => setNextAction(selected, off, stepNote.trim() || undefined)}>{label}</button>
                    ))}
                    {selected.next_action_at && <button type="button" className="ld-chip is-ghost" onClick={() => setNextAction(selected, null)}>Снять</button>}
                  </div>
                </>
              )}
            </Group>

            <Group
              title="Сделка"
              flush
              footer={open && v ? <>Вероятность сделки на этапе: {Math.round(prob * 100)}% · прогноз {fmtRub(v.value * prob)}{v.estimated ? ' (по ориентиру услуги)' : ''}</> : undefined}
            >
              <label className="ld-cell">
                <span className="ld-cell-label">Ожидаемая сумма, ₽</span>
                {canManage ? (
                  <input className="ld-cell-input" inputMode="numeric" placeholder={v?.estimated ? `≈ ${v.value.toLocaleString('ru-RU')}` : 'например 85000'} value={valueDraft} onChange={(e) => setValueDraft(e.target.value)} onBlur={() => saveValue(selected)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                ) : <span className="ld-cell-value">{v ? fmtRub(v.value) : '—'}</span>}
              </label>
              <div className="ld-cell">
                <span className="ld-cell-label">Интересует</span>
                {canManage ? (
                  <SelectField className="is-inline" ariaLabel="Интересует" value={selected.service_interest ?? ''} onChange={(val) => update(selected.id, { service_interest: val || null } as Partial<Lead>)}>
                    <option value="">Не выбрано</option>
                    {LEAD_SERVICE_INTERESTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </SelectField>
                ) : <span className="ld-cell-value">{SERVICE_LABEL[selected.service_interest ?? ''] ?? '—'}</span>}
              </div>
            </Group>

            <Group title="Информация" flush>
              <div className="ld-cell"><span className="ld-cell-label">Автомобиль</span><span className="ld-cell-value">{leadVehicleDisplay(selected)}</span></div>
              <div className="ld-cell"><span className="ld-cell-label">Источник</span><span className="ld-cell-value"><SourceIcon source={selected.source} />{LEAD_SOURCE_LABELS[selected.source]}</span></div>
              <div className="ld-cell">
                <span className="ld-cell-label">Ответственный</span>
                {canManage ? (
                  <SelectField className="is-inline" ariaLabel="Ответственный" value={selected.owner_id ?? ''} onChange={(val) => update(selected.id, { owner_id: val || null } as Partial<Lead>)}>
                    <option value="">Не назначен</option>
                    {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </SelectField>
                ) : <span className="ld-cell-value">{staffName(selected.owner_id)}</span>}
              </div>
              <div className="ld-cell"><span className="ld-cell-label">В системе</span><span className="ld-cell-value">{formatAge(selected)} · без движения {Math.floor(idleDays(selected))} дн</span></div>
            </Group>

            <Group title="Теги">
              <div className="ld-chips is-first">
                {(selected.tags ?? []).map((t) => (
                  <span key={t} className="ld-tag">{t}{canManage && <button type="button" onClick={() => removeTag(selected, t)} aria-label={`Убрать ${t}`}><X size={11} /></button>}</span>
                ))}
                {!(selected.tags ?? []).length && <span className="ld-muted">Тегов нет</span>}
              </div>
              {canManage && (
                <input className="ld-input" placeholder="Добавить тег и нажать Enter (hot, vip-interest, ppf…)" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTag(selected); }} />
              )}
            </Group>

            {open && (
              <Group title={`Почему такой скоринг — ${sc.score}`} flush>
                {sc.factors.map((f) => (
                  <div key={f.label} className="ld-cell ld-factor">
                    <span className="ld-cell-label">{f.label}</span>
                    <b className={f.points < 0 ? 'is-neg' : 'is-pos'}>{f.points > 0 ? '+' : ''}{f.points}</b>
                  </div>
                ))}
              </Group>
            )}

            {selected.notes && (
              <Group title="Заметки">
                <div className="ld-notes">{selected.notes}</div>
              </Group>
            )}

            <Group title="История">
              {canManage && (
                <div className="ld-note-row">
                  <input className="ld-input" placeholder="Добавить заметку в историю…" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addNote(); }} />
                  <button type="button" className="ld-btn" onClick={addNote}>Добавить</button>
                </div>
              )}
              <div className="ld-timeline">
                {activities.map((a) => (
                  <div key={a.id} className={`ld-tl is-${a.type}`}>
                    <div className="ld-tl-meta">{ACTIVITY_LABEL[a.type] ?? a.type} · {new Date(a.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                    <div className="ld-tl-body">{a.body}</div>
                  </div>
                ))}
                {!activities.length && <div className="ld-muted">Пока нет записей</div>}
              </div>
            </Group>
          </div>

          {(canManage || canDelete) && (
            <div className="ld-drawer-foot">
              {canManage && selected.status !== 'converted' && <button type="button" className="ld-btn is-primary is-block" onClick={() => convertToCustomer(selected)}>Конвертировать в клиента</button>}
              <div className="ld-foot-row">
                {canManage && <button type="button" className="ld-btn" onClick={() => onEdit(selected)}><Pencil size={14} />Изменить</button>}
                {canDelete && <button type="button" className="ld-btn is-danger" onClick={() => deleteLead(selected)}><Trash2 size={14} />Удалить</button>}
              </div>
            </div>
          )}
        </aside>
    );
  };

  /* ---------------- render ---------------- */

  const emptyState = (
    <div className="ld-empty">
      <div className="ld-empty-title">{leads.length ? 'По этим фильтрам лидов нет' : 'Лидов пока нет'}</div>
      <div className="ld-muted">
        {leads.length
          ? `Всего в базе ${leads.length}. ${filtersOn ? 'Активные фильтры: ' + activeFilters.map((f) => f.label).join(' · ') : ''}`
          : 'Добавьте первый лид — обращения с сайта, из WhatsApp, Instagram и по телефону.'}
      </div>
      {filtersOn && <button type="button" className="ld-btn is-primary" onClick={resetFilters}><RotateCcw size={14} />Сбросить все фильтры</button>}
      {!leads.length && canManage && <button type="button" className="ld-btn is-primary" onClick={() => onEdit(null)}>+ Новый лид</button>}
    </div>
  );

  return (
    <div className="ld-page">
      <div className="header-row">
        <div>
          <div className="eyebrow"><span className="dot"></span>CRM · лиды</div>
          <h1 className="page-title">Управление лидами</h1>
          <p className="page-sub">Воронка, скоринг, задачи, прогноз и аналитика каналов.</p>
        </div>
        <div className="tag-row">
          <AnalyticsToggle visible={showCharts} onToggle={toggleCharts} />
          {canManage && <div className="tag add" onClick={() => onEdit(null)}>+ Новый лид</div>}
          <div className="tag ghost" onClick={() => exportCSV(false)}>Экспорт CSV</div>
        </div>
      </div>

      {showCharts && <LeadsDashboardPro leads={leads} staff={staffList} sourceLabels={LEAD_SOURCE_LABELS} onApply={applyPreset} />}

      <div id="ld-anchor" className="ld-toolbar">
        <div className="ld-toolbar-row is-top">
          <div className="ld-searchbox">
            <Search size={16} aria-hidden />
            <input placeholder="Имя, телефон, авто, теги" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Поиск по лидам" />
            {search && <button type="button" className="ld-searchbox-clear" onClick={() => setSearch('')} aria-label="Очистить поиск"><X size={12} strokeWidth={2.5} /></button>}
          </div>
          <div className="ld-selects">
            <SelectField value={sourceFilter} onChange={setSourceFilter} ariaLabel="Источник" highlight={!!sourceFilter}>
              <option value="">Все источники</option>
              {Object.entries(LEAD_SOURCE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </SelectField>
            <SelectField value={ownerFilter} onChange={setOwnerFilter} ariaLabel="Ответственный" highlight={!!ownerFilter}>
              <option value="">Все ответственные</option>
              <option value="__none">Не назначен</option>
              {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </SelectField>
            <SelectField value={followFilter} onChange={(v) => setFollowFilter(v as FollowFilter)} ariaLabel="Задачи" highlight={!!followFilter}>
              <option value="">Все задачи</option>
              <option value="overdue">Просрочено</option>
              <option value="today">Сегодня</option>
              <option value="upcoming">Скоро</option>
            </SelectField>
            <SelectField value={`${sortKey}:${sortDir}`} onChange={(v) => { const [k, d] = v.split(':'); setSortKey(k as SortKey); setSortDir(d as 'asc' | 'desc'); }} ariaLabel="Сортировка">
              <option value="created:desc">Сначала новые</option>
              <option value="created:asc">Сначала старые</option>
              <option value="score:desc">Скоринг ↓</option>
              <option value="value:desc">Сумма ↓</option>
              <option value="next:asc">Ближайший шаг</option>
              <option value="name:asc">Имя А–Я</option>
            </SelectField>
          </div>
        </div>

        <div className="ld-toolbar-row is-view">
          <div className="ld-seg" role="tablist" aria-label="Вид">
            <button type="button" role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'is-active' : ''} onClick={() => setView('list')}><List size={14} />Список</button>
            <button type="button" role="tab" aria-selected={view === 'board'} className={view === 'board' ? 'is-active' : ''} onClick={() => setView('board')}><LayoutGrid size={14} />Канбан</button>
            <button type="button" role="tab" aria-selected={view === 'tasks'} className={view === 'tasks' ? 'is-active' : ''} onClick={() => setView('tasks')}><CalendarClock size={14} />Задачи</button>
          </div>
          <button type="button" className="ld-chip is-ghost" onClick={saveCurrentView}>+ Сохранить вид</button>
        </div>

        <div className="ld-seg is-wide" role="tablist" aria-label="Статус">
          <button type="button" role="tab" aria-selected={statusFilter === ''} className={statusFilter === '' ? 'is-active' : ''} onClick={() => setStatusFilter('')}>Все <b>{statusCounts['']}</b></button>
          {LEAD_STAGES.map((st) => (
            <button key={st} type="button" role="tab" aria-selected={statusFilter === st} className={statusFilter === st ? 'is-active' : ''} style={{ ['--pill' as string]: STAGE_TINT[st] }} onClick={() => setStatusFilter(statusFilter === st ? '' : st)}>
              {LEAD_STATUS_LABELS[st]} <b>{statusCounts[st] ?? 0}</b>
            </button>
          ))}
        </div>

        {savedViews.length > 0 && (
          <div className="ld-toolbar-row is-saved">
            <span className="ld-muted">Виды</span>
            {savedViews.map((v) => (
              <span key={v.name} className="ld-chip is-saved">
                <button type="button" className="ld-chip-main" onClick={() => applySavedView(v.name)}>{v.name}</button>
                <button type="button" className="ld-chip-x" onClick={() => deleteSavedView(v.name)} aria-label={`Удалить вид ${v.name}`}><X size={11} strokeWidth={2.5} /></button>
              </span>
            ))}
          </div>
        )}

        <div className="ld-summary">
          <span>Показано <b>{filtered.length}</b> из <b>{leads.length}</b>{shownValue > 0 && <> · в воронке <b>{fmtCompactRub(shownValue)}</b></>}</span>
          {activeFilters.map((f) => (
            <button key={f.key} type="button" className="ld-active-filter" onClick={f.clear}>{f.label}<X size={11} /></button>
          ))}
          {filtersOn && <button type="button" className="ld-link" onClick={resetFilters}>Сбросить всё</button>}
        </div>
      </div>

      <div className={`ld-split${drawerExpanded ? ' is-expanded' : ''}`}>
      <div className="ld-split-main">

      {view === 'list' && canManage && checkedIds.size > 0 && (
        <div className="ld-bulk">
          <span className="ld-bulk-count">{checkedIds.size} выбрано</span>
          <SelectField value={bulkStatus} onChange={setBulkStatus} ariaLabel="Новый статус">
            <option value="">Статус…</option>
            {Object.entries(LEAD_STATUS_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </SelectField>
          <button type="button" className="ld-btn" onClick={applyBulkStatus} disabled={!bulkStatus}>Применить</button>
          <SelectField value={bulkOwner} onChange={setBulkOwner} ariaLabel="Ответственный">
            <option value="">Ответственный…</option>
            {staffList.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </SelectField>
          <button type="button" className="ld-btn" onClick={applyBulkOwner} disabled={!bulkOwner}>Назначить</button>
          <span className="ld-bulk-label">Шаг</span>
          <button type="button" className="ld-btn" onClick={() => bulkFollow(0)}>Сегодня</button>
          <button type="button" className="ld-btn" onClick={() => bulkFollow(1)}>Завтра</button>
          <span className="ld-bulk-end">
            <button type="button" className="ld-btn" onClick={() => exportCSV(true)}>Экспорт</button>
            {canDelete && <button type="button" className="ld-btn is-danger" onClick={bulkDelete}>Удалить</button>}
            <button type="button" className="ld-icon-btn" onClick={() => setCheckedIds(new Set())} title="Снять выбор" aria-label="Снять выбор"><X size={16} /></button>
          </span>
        </div>
      )}

      {/* ---------------- BOARD ---------------- */}
      {view === 'board' && (
        <div className="ld-board">
          {LEAD_STAGES.map((stage, ci) => {
            const items = filtered.filter((l) => l.status === stage);
            const colValue = items.reduce((s, l) => s + leadValueNum(l), 0);
            return (
              <div
                key={stage}
                className={`ld-col${dragOver === stage ? ' is-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOver !== stage) setDragOver(stage); }}
                onDragEnter={(e) => e.preventDefault()}
                onDragLeave={() => setDragOver((d) => (d === stage ? null : d))}
                onDrop={(e) => onDropStage(stage, e)}
              >
                <div className="ld-col-head" style={{ ['--pill' as string]: STAGE_TINT[stage] }}>
                  <div className="ld-col-title"><span className="ld-col-num">{ci + 1}</span>{LEAD_STATUS_LABELS[stage]}</div>
                  <div className="ld-col-count">{items.length}</div>
                </div>
                {colValue > 0 && <div className="ld-col-sum">{fmtCompactRub(colValue)}</div>}
                <div className="ld-col-body">
                  {items.map((l) => {
                    const fsx = followState(l.next_action_at);
                    return (
                      <div
                        key={l.id}
                        className={`ld-card${dragId === l.id ? ' is-drag' : ''}`}
                        draggable={canManage}
                        onDragStart={(e) => { dragRef.current = l.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', l.id); window.setTimeout(() => setDragId(l.id), 0); }}
                        onDragEnd={() => { dragRef.current = null; setDragId(null); setDragOver(null); }}
                        onClick={() => setSelectedId(l.id)}
                      >
                        <div className="ld-card-top">
                          <span className="ld-card-name">{leadFullName(l)}</span>
                          <ScoreBadge lead={l} />
                        </div>
                        <div className="ld-card-car">{leadVehicleDisplay(l)}{l.service_interest ? ` · ${SERVICE_LABEL[l.service_interest]?.split(' / ')[0] ?? ''}` : ''}</div>
                        <div className="ld-card-meta">
                          <span><SourceIcon source={l.source} />{LEAD_SOURCE_LABELS[l.source]}</span>
                          <ValueCell lead={l} />
                        </div>
                        {l.next_action_at && isOpenLead(l) && (
                          <div className={`ld-card-next${fsx === 'overdue' ? ' is-overdue' : ''}`}><Clock size={11} />{nextActionLabel(l)}</div>
                        )}
                        <div className="ld-card-foot">
                          <span className="ld-owner" title={staffName(l.owner_id)}>{l.owner_id ? initials(staffName(l.owner_id)) : '—'}</span>
                          <Flags lead={l} />
                          {canManage && isOpenLead(l) && (
                            <span className="ld-card-move">
                              {l.status !== 'new' && <button type="button" title="Назад" onClick={(e) => { e.stopPropagation(); advanceStatus(l, -1); }}><ArrowLeft size={13} /></button>}
                              <button type="button" title="Дальше" onClick={(e) => { e.stopPropagation(); advanceStatus(l, 1); }}><ArrowRight size={13} /></button>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!items.length && <div className="ld-col-empty">{filtersOn ? 'Нет по фильтрам' : 'Пусто'}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------------- TASKS ---------------- */}
      {view === 'tasks' && (
        <div className="ld-tasks">
          {taskGroups.map((g) => (
            <section key={g.id} className="ld-task-group">
              <div className={`ld-task-head is-${g.tone}`}>{g.title} <b>{g.items.length}</b></div>
              <div className="ld-task-list">
                {g.items.map((l) => (
                  <div key={l.id} className="ld-task" onClick={() => setSelectedId(l.id)}>
                    <ScoreBadge lead={l} />
                    <div className="ld-task-main">
                      <div className="ld-task-title">{leadFullName(l)} <span className="ld-muted">· {leadVehicleDisplay(l)}</span></div>
                      <div className="ld-task-sub">
                        {l.next_action_at ? nextActionLabel(l) : 'Назначьте следующий шаг'} · {staffName(l.owner_id)} · <StatusPill status={l.status} />
                      </div>
                    </div>
                    <Flags lead={l} />
                    <div className="ld-task-actions" onClick={(e) => e.stopPropagation()}>
                      {telHref(l) && <a className="ld-icon-btn" href={telHref(l)} title="Позвонить"><Phone size={15} /></a>}
                      {canManage && l.next_action_at && <button type="button" className="ld-icon-btn" title="Выполнено" onClick={() => completeTask(l)}><Check size={15} /></button>}
                      {canManage && <button type="button" className="ld-chip" onClick={() => setNextAction(l, 1)}>Завтра</button>}
                      {canManage && !l.next_action_at && <button type="button" className="ld-chip" onClick={() => setNextAction(l, 0)}>Сегодня</button>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {!taskGroups.length && emptyState}
        </div>
      )}

      {/* ---------------- LIST ---------------- */}
      {view === 'list' && (
        <div className="ld-card-wrap">
          {filtered.length === 0 ? emptyState : (
            <>
              <div className="ld-table-scroll ld-desktop-only">
                <table className="ld-table">
                  <colgroup>
                    {canManage && <col style={{ width: 52 }} />}
                    <col />
                    <col style={{ width: 152 }} />
                    <col style={{ width: 124 }} />
                    <col style={{ width: 74 }} />
                    <col style={{ width: 150 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 72 }} />
                    <col style={{ width: 88 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      {canManage && <th className="ld-th-check"><input type="checkbox" className="ld-check" aria-label="Выбрать все" checked={filtered.length > 0 && checkedIds.size === filtered.length} onChange={toggleCheckAll} /></th>}
                      <SortTh k="name">Лид</SortTh>
                      <SortTh k="source">Источник</SortTh>
                      <th>Авто · услуга</th>
                      <SortTh k="score">Скоринг</SortTh>
                      <th>Статус</th>
                      <SortTh k="next">Шаг · ответственный</SortTh>
                      <SortTh k="value" className="ld-th-num">Сумма</SortTh>
                      <th aria-label="Действия"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((l) => {
                      const openRow = isOpenLead(l);
                      const overdueRow = openRow && followState(l.next_action_at) === 'overdue';
                      return (
                        <tr key={l.id} className={selectedId === l.id ? 'selected' : ''} onClick={() => setSelectedId(l.id)}>
                          {canManage && <td className="ld-td-check" onClick={(e) => e.stopPropagation()}><input type="checkbox" className="ld-check" aria-label={`Выбрать ${leadFullName(l)}`} checked={checkedIds.has(l.id)} onChange={() => toggleChecked(l.id)} /></td>}
                          <td>
                            <div className="ld-lead-cell">
                              <div className={`ld-avatar is-sm is-${openRow ? scoreTone(scoreOf(l)) : 'gray'}`}>{initials(leadFullName(l))}</div>
                              <div className="ld-lead-text">
                                <div className="ld-lead-name"><span className="ld-ell">{leadFullName(l)}</span><Flags lead={l} max={1} /></div>
                                <div className="ld-lead-sub" title={`${[l.phone, l.email].filter(Boolean).join(' · ') || 'нет контактов'} · в системе ${formatAge(l)}`}>
                                  <span>{l.phone || l.email || 'нет контактов'}</span>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="ld-source-cell"><SourceIcon source={l.source} />{LEAD_SOURCE_LABELS[l.source]}</span>
                          </td>
                          <td>
                            <div className="ld-stack">
                              <div className="ld-ell" title={leadVehicleDisplay(l)}>{leadVehicleDisplay(l)}</div>
                              {l.service_interest && <div className="ld-sub ld-ell">{SERVICE_LABEL[l.service_interest]}</div>}
                            </div>
                          </td>
                          <td><ScoreBadge lead={l} /></td>
                          <td><StatusPill status={l.status} /></td>
                          <td>
                            <div className="ld-stack">
                              <div className={`ld-ell${overdueRow ? ' ld-overdue' : ''}`} title={nextActionLabel(l) ?? ''}>{openRow ? nextActionLabel(l) || <span className="ld-muted">Не назначен</span> : <span className="ld-muted">—</span>}</div>
                              <div className="ld-sub ld-ell">{l.owner_id ? staffName(l.owner_id) : 'Без ответственного'}</div>
                            </div>
                          </td>
                          <td className="ld-td-num"><ValueCell lead={l} /></td>
                          <td className="ld-td-actions" onClick={(e) => e.stopPropagation()}>
                            <div className="ld-row-actions">
                              {telHref(l) && <a className="ld-icon-btn" href={telHref(l)} title="Позвонить" aria-label="Позвонить"><Phone size={14} /></a>}
                              {canManage && openRow && <button type="button" className="ld-icon-btn" title="Следующий этап" aria-label="Следующий этап" onClick={() => advanceStatus(l, 1)}><ArrowRight size={14} /></button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="ld-mobile-only ld-mlist">
                {filtered.map((l) => (
                  <div key={l.id} className="ld-mrow" onClick={() => setSelectedId(l.id)}>
                    <div className={`ld-avatar is-${isOpenLead(l) ? scoreTone(scoreOf(l)) : 'gray'}`}>{initials(leadFullName(l))}</div>
                    <div className="ld-mrow-main">
                      <div className="ld-mrow-title">{leadFullName(l)}</div>
                      <div className="ld-mrow-sub">{l.phone || '—'} · {leadVehicleDisplay(l)}</div>
                      <div className="ld-mrow-sub"><Flags lead={l} /> {isOpenLead(l) && nextActionLabel(l)}</div>
                    </div>
                    <div className="ld-mrow-side"><StatusPill status={l.status} /><ScoreBadge lead={l} /></div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      </div>
      {selected && renderDrawer()}
      </div>
    </div>
  );
}
