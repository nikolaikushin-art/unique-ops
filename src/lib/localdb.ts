/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * LOCAL DATABASE — everything lives in this browser (localStorage + IndexedDB for files).
 * No server, no cloud, no accounts. Exposes a small query-builder API
 * (`db.from('table').select().eq()...`) so all modules keep working unchanged.
 *
 * Reset all data:  localStorage.clear()  (or Settings → Storage → "Сбросить локальные данные")
 */
import { buildSeed } from './localdb-seed';
import { bookingBaseValue, bookingValue, isDoneStatus } from './metrics';

export type Row = Record<string, any>;
type Err = { message: string; code?: string } | null;
interface Result {
  data: any;
  error: Err;
  count?: number | null;
}

const PREFIX = 'uo:db:';
const SEED_FLAG = 'uo:seeded:v3';
const SESSION_KEY = 'uo:auth:session';

export const isLocalDbReady = true;

export type Factor = { id: string; status?: string; friendly_name?: string; factor_type?: string };

const KNOWN_TABLES = new Set([
  'profiles', 'customers', 'vehicles', 'services', 'service_packages', 'service_quotes', 'staff',
  'staff_skills', 'staff_schedules', 'staff_tasks', 'staff_training', 'staff_attendance', 'bookings',
  'orders', 'invoices', 'payments', 'leads', 'lead_activities', 'files', 'inventory_items', 'suppliers',
  'inventory_receipts', 'inventory_issues', 'inventory_waste', 'inventory_usage', 'purchase_orders',
  'communications', 'inspections', 'job_checklists', 'internal_alerts', 'security_audit_log',
  'studio_settings', 'expenses',
]);

const ACTIVE_DEFAULT = new Set(['staff', 'services', 'inventory_items', 'service_packages', 'profiles']);

const FK_CANDIDATES: Record<string, string[]> = {
  inventory_items: ['item_id', 'inventory_item_id'],
  staff: ['staff_id', 'assigned_technician_id', 'inspector_id'],
  profiles: ['profile_id', 'user_id', 'created_by', 'uploaded_by'],
  customers: ['customer_id'],
  vehicles: ['vehicle_id'],
  services: ['service_id'],
  suppliers: ['supplier_id'],
  bookings: ['booking_id'],
  orders: ['order_id'],
  invoices: ['invoice_id'],
};

/* ---------------------------------------------------------------- storage */

const cache = new Map<string, Row[]>();
const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

function load(table: string): Row[] {
  const hit = cache.get(table);
  if (hit) return hit;
  let rows: Row[] = [];
  try {
    const raw = localStorage.getItem(PREFIX + table);
    if (raw) rows = JSON.parse(raw);
  } catch {
    rows = [];
  }
  cache.set(table, rows);
  return rows;
}

function save(table: string, rows: Row[]) {
  cache.set(table, rows);
  try {
    localStorage.setItem(PREFIX + table, JSON.stringify(rows));
  } catch {
    /* storage full — data stays in memory for this session */
  }
}

function ensureSeeded() {
  try {
    if (localStorage.getItem(SEED_FLAG)) return;
    const seed = buildSeed();
    for (const [table, rows] of Object.entries(seed)) {
      if (load(table).length === 0) save(table, rows);
    }
    localStorage.setItem(SEED_FLAG, '1');
  } catch {
    /* ignore */
  }
}
ensureSeeded();

/** v52: warranty / maintenance intervals on services (drives warranty cards and «пора на обслуживание»). One-time, additive. */
function migrateV52() {
  const FLAG = 'uo:migrated:v52';
  try {
    if (localStorage.getItem(FLAG)) return;
    const rules: Record<string, [number, number]> = { ppf: [60, 12], coating: [24, 12], polishing: [0, 12], interior: [0, 6], protection: [0, 12], wash: [0, 3] };
    const rows = load('services');
    let changed = false;
    for (const r of rows) {
      if (r.warranty_months !== undefined) continue;
      const [w, m] = rules[String(r.category)] ?? [0, 0];
      r.warranty_months = w || null;
      r.maintenance_interval_months = m || null;
      changed = true;
    }
    if (changed) save('services', rows);
    localStorage.setItem(FLAG, '1');
  } catch {
    /* ignore */
  }
}
migrateV52();

export function resetLocalData() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith('uo:'))
    .forEach((k) => localStorage.removeItem(k));
  cache.clear();
  ensureSeeded();
  migrateV52();
}

/* ---------------------------------------------------------------- filters */

const isNil = (v: any) => v === null || v === undefined;
const looseEq = (a: any, b: any) => (isNil(a) || isNil(b) ? isNil(a) && isNil(b) : String(a) === String(b));

function cmp(a: any, b: any): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const na = Number(a), nb = Number(b);
  if (!isNaN(na) && !isNaN(nb) && String(a).trim() !== '' && String(b).trim() !== '' && /^-?\d+(\.\d+)?$/.test(String(a)) && /^-?\d+(\.\d+)?$/.test(String(b))) return na - nb;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function likeToRegex(pattern: string, ci: boolean) {
  const esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
  return new RegExp('^' + esc + '$', ci ? 'i' : '');
}

function parseList(v: any): any[] {
  if (Array.isArray(v)) return v;
  const s = String(v).trim().replace(/^\(/, '').replace(/\)$/, '');
  if (!s) return [];
  return s.split(',').map((x) => x.trim().replace(/^"(.*)"$/, '$1'));
}

function coerce(v: any) {
  if (v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return v;
}

function makePred(op: string, col: string, val: any): (r: Row) => boolean {
  switch (op) {
    case 'eq': return (r) => looseEq(r[col], val);
    case 'neq': return (r) => !looseEq(r[col], val);
    case 'gt': return (r) => !isNil(r[col]) && cmp(r[col], val) > 0;
    case 'gte': return (r) => !isNil(r[col]) && cmp(r[col], val) >= 0;
    case 'lt': return (r) => !isNil(r[col]) && cmp(r[col], val) < 0;
    case 'lte': return (r) => !isNil(r[col]) && cmp(r[col], val) <= 0;
    case 'like': { const re = likeToRegex(String(val), false); return (r) => !isNil(r[col]) && re.test(String(r[col])); }
    case 'ilike': { const re = likeToRegex(String(val), true); return (r) => !isNil(r[col]) && re.test(String(r[col])); }
    case 'is': { const v = coerce(val); return (r) => (v === null ? isNil(r[col]) : r[col] === v); }
    case 'in': { const list = parseList(val); return (r) => list.some((x) => looseEq(r[col], x)); }
    case 'cs':
    case 'contains': {
      const list = parseList(val);
      return (r) => Array.isArray(r[col]) && list.every((x) => r[col].some((y: any) => looseEq(x, y)));
    }
    default: return () => true;
  }
}

function splitTop(str: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

function parseOr(expr: string): (r: Row) => boolean {
  const preds = splitTop(expr).map((part) => {
    const m = part.match(/^([\w.]+)\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in)\.(.*)$/s);
    if (!m) return () => false;
    return makePred(m[2], m[1], m[3]);
  });
  return (r) => preds.some((p) => p(r));
}

/* ---------------------------------------------------------------- embeds */

function singular(t: string) {
  return t.endsWith('ies') ? t.slice(0, -3) + 'y' : t.replace(/s$/, '');
}

function embedRows(table: string, rows: Row[], selectStr: string): Row[] {
  const parts = splitTop(selectStr || '*');
  const embeds = parts.filter((p) => p.includes('('));
  if (!embeds.length) return rows.map(clone);

  return rows.map((row) => {
    const out = clone(row);
    for (const part of embeds) {
      const m = part.match(/^(?:(\w+):)?(\w+)(?:!([\w]+))?\((.*)\)$/s);
      if (!m) continue;
      const [, alias, target, hint, inner] = m;
      const key = alias || target;
      let relTable: string;
      let fkCols: string[];

      if (KNOWN_TABLES.has(target)) {
        relTable = target;
        fkCols = [];
        if (hint && hint.endsWith('_fkey')) {
          const col = hint.replace(/_fkey$/, '').replace(new RegExp('^' + table + '_'), '');
          fkCols.push(col);
        }
        fkCols.push(...(FK_CANDIDATES[target] ?? [singular(target) + '_id']));
      } else {
        relTable = alias && KNOWN_TABLES.has(alias) ? alias : target;
        fkCols = [target];
      }

      const relRows = load(relTable);
      const fk = fkCols.find((c) => c in row);
      const back = singular(table) + '_id';
      if (fk) {
        const found = relRows.find((r) => looseEq(r.id, row[fk]));
        out[key] = found ? embedRows(relTable, [found], inner.trim())[0] : null;
      } else if (fkCols.length === 1 && !KNOWN_TABLES.has(target)) {
        out[key] = null; // explicit FK column missing on this row
      } else if (relRows.some((r) => back in r)) {
        // reverse (one-to-many)
        const list = relRows.filter((r) => looseEq(r[back], row.id));
        out[key] = embedRows(relTable, list, inner.trim());
      } else {
        out[key] = null;
      }
    }
    return out;
  });
}

/* ---------------------------------------------------------------- realtime */

type ChangeCb = (payload: any) => void;
const channelListeners: { table: string | null; cb: ChangeCb }[] = [];
function emitChange(table: string, eventType: string, row: Row) {
  setTimeout(() => {
    channelListeners
      .filter((l) => !l.table || l.table === table)
      .forEach((l) => l.cb({ eventType, table, new: row, old: {} }));
  }, 0);
}

/* ---------------------------------------------------------------- defaults */

function nextNumber(table: string, field: string, prefix: string) {
  const n = load(table).length + 1;
  let candidate = `${prefix}-${String(n).padStart(4, '0')}`;
  const used = new Set(load(table).map((r) => r[field]));
  let i = n;
  while (used.has(candidate)) candidate = `${prefix}-${String(++i).padStart(4, '0')}`;
  return candidate;
}

function applyDefaults(table: string, input: Row): Row {
  const now = new Date().toISOString();
  const row: Row = { id: uuid(), created_at: now, updated_at: now, ...clone(input) };
  if (ACTIVE_DEFAULT.has(table) && row.is_active === undefined) row.is_active = true;
  if (table === 'invoices' && !row.invoice_number) row.invoice_number = nextNumber('invoices', 'invoice_number', 'INV');
  if (table === 'orders' && !row.order_number) row.order_number = nextNumber('orders', 'order_number', 'ORD');
  if (table === 'communications') {
    if (row.sent_at === undefined) row.sent_at = now;
    for (const f of ['is_draft', 'is_archived', 'is_deleted', 'is_spam', 'is_important']) if (row[f] === undefined) row[f] = false;
  }
  if (table === 'internal_alerts' && row.is_read === undefined) row.is_read = false;
  if (table === 'files' && row.storage_provider === undefined) row.storage_provider = 'local';
  return row;
}

/* ---------------------------------------------------------------- business rules (what a DB trigger would do) */

/** Materials a set of services consumes (from the recipes), with their cost. */
function materialsFor(serviceIds: string[]) {
  const recipes = load('service_material_recipes').filter((r) => serviceIds.includes(String(r.service_id)));
  const items = load('inventory_items');
  const lines = recipes.map((r) => ({ item_id: String(r.item_id), qty: Number(r.quantity_per_service ?? 0) })).filter((l) => l.qty > 0);
  const cost = lines.reduce((sum, l) => sum + l.qty * Number(items.find((i) => i.id === l.item_id)?.unit_cost ?? 0), 0);
  return { lines, cost };
}

const bookingServiceIds = (b: Row): string[] =>
  [b.service_id, ...((b.extra_items as Row[] | undefined) ?? []).map((x) => x.service_id)].filter(Boolean).map(String);

/** When a job is completed: write the recipe materials off the warehouse and remember the real material cost. */
function writeOffMaterials(b: Row) {
  const { lines, cost } = materialsFor(bookingServiceIds(b));
  if (lines.length) {
    const items = load('inventory_items');
    const usage = load('inventory_usage');
    const alerts = load('internal_alerts');
    const now = new Date().toISOString();
    for (const l of lines) {
      const it = items.find((i) => i.id === l.item_id);
      if (!it) continue;
      it.stock_level = Math.max(0, Number(it.stock_level ?? 0) - l.qty);
      it.updated_at = now;
      usage.push(applyDefaults('inventory_usage', { item_id: it.id, booking_id: b.id, order_id: b.order_id ?? null, quantity_used: l.qty, used_at: now }));
      if (Number(it.stock_level) <= Number(it.min_stock_level ?? 0)) {
        alerts.push(applyDefaults('internal_alerts', { type: 'inventory', title: 'Низкий остаток', body: `${it.name} — осталось ${it.stock_level} ${it.unit ?? ''}, минимум ${it.min_stock_level ?? 0}.`, target_role: null }));
      }
      emitChange('inventory_items', 'UPDATE', it);
    }
    save('inventory_items', items);
    save('inventory_usage', usage);
    save('internal_alerts', alerts);
  }
  b.materials_written_off = true;
  b.materials_cost = Math.round(cost);
}

/* ---------------------------------------------------------------- query builder */

class Query implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: any = null;
  private selectStr = '*';
  private filters: ((r: Row) => boolean)[] = [];
  private orders: { col: string; asc: boolean; nullsFirst?: boolean }[] = [];
  private lim: number | null = null;
  private from_: number | null = null;
  private to_: number | null = null;
  private mode: 'many' | 'single' | 'maybe' = 'many';
  private wantCount = false;
  private head = false;
  private returning = false;
  private conflict: string | undefined;

  constructor(private table: string) {}

  select(cols = '*', opts?: { count?: string; head?: boolean }) {
    this.selectStr = cols || '*';
    if (this.op !== 'select') this.returning = true;
    if (opts?.count) this.wantCount = true;
    if (opts?.head) this.head = true;
    return this;
  }
  insert(v: any) { this.op = 'insert'; this.payload = v; return this; }
  update(v: any) { this.op = 'update'; this.payload = v; return this; }
  upsert(v: any, opts?: { onConflict?: string }) { this.op = 'upsert'; this.payload = v; this.conflict = opts?.onConflict; return this; }
  delete() { this.op = 'delete'; return this; }

  eq(c: string, v: any) { this.filters.push(makePred('eq', c, v)); return this; }
  neq(c: string, v: any) { this.filters.push(makePred('neq', c, v)); return this; }
  gt(c: string, v: any) { this.filters.push(makePred('gt', c, v)); return this; }
  gte(c: string, v: any) { this.filters.push(makePred('gte', c, v)); return this; }
  lt(c: string, v: any) { this.filters.push(makePred('lt', c, v)); return this; }
  lte(c: string, v: any) { this.filters.push(makePred('lte', c, v)); return this; }
  like(c: string, v: any) { this.filters.push(makePred('like', c, v)); return this; }
  ilike(c: string, v: any) { this.filters.push(makePred('ilike', c, v)); return this; }
  is(c: string, v: any) { this.filters.push(makePred('is', c, v)); return this; }
  in(c: string, v: any[]) { this.filters.push(makePred('in', c, v)); return this; }
  contains(c: string, v: any) { this.filters.push(makePred('contains', c, v)); return this; }
  match(obj: Row) { for (const [k, v] of Object.entries(obj)) this.filters.push(makePred('eq', k, v)); return this; }
  not(c: string, op: string, v: any) { const p = makePred(op, c, v); this.filters.push((r) => !p(r)); return this; }
  or(expr: string) { this.filters.push(parseOr(expr)); return this; }
  filter(c: string, op: string, v: any) { this.filters.push(makePred(op, c, v)); return this; }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.orders.push({ col, asc: opts?.ascending !== false, nullsFirst: opts?.nullsFirst });
    return this;
  }
  limit(n: number) { this.lim = n; return this; }
  range(from: number, to: number) { this.from_ = from; this.to_ = to; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  returns() { return this; }

  private matched(): Row[] {
    return load(this.table).filter((r) => this.filters.every((f) => f(r)));
  }

  private finish(rows: Row[], count: number | null): Result {
    if (this.mode === 'single') {
      if (rows.length !== 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }, count };
      return { data: rows[0], error: null, count };
    }
    if (this.mode === 'maybe') return { data: rows[0] ?? null, error: null, count };
    return { data: rows, error: null, count };
  }

  private run(): Result {
    const t = this.table;
    if (!KNOWN_TABLES.has(t)) load(t); // unknown tables just work (empty)

    if (this.op === 'select') {
      let rows = this.matched();
      for (const o of [...this.orders].reverse()) {
        rows = [...rows].sort((a, b) => {
          const av = a[o.col], bv = b[o.col];
          if (isNil(av) && isNil(bv)) return 0;
          if (isNil(av)) return (o.nullsFirst ?? !o.asc) ? -1 : 1;
          if (isNil(bv)) return (o.nullsFirst ?? !o.asc) ? 1 : -1;
          return o.asc ? cmp(av, bv) : cmp(bv, av);
        });
      }
      const total = rows.length;
      if (this.from_ !== null && this.to_ !== null) rows = rows.slice(this.from_, this.to_ + 1);
      if (this.lim !== null) rows = rows.slice(0, this.lim);
      if (this.head) return { data: null, error: null, count: total };
      return this.finish(embedRows(t, rows, this.selectStr), this.wantCount ? total : null);
    }

    if (this.op === 'insert') {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload];
      const all = load(t);
      const created: Row[] = [];
      for (const it of items) {
        const row = applyDefaults(t, it);
        all.push(row);
        created.push(row);
      }
      save(t, all);
      created.forEach((r) => emitChange(t, 'INSERT', r));
      return this.returning ? this.finish(embedRows(t, created, this.selectStr), null) : { data: null, error: null };
    }

    if (this.op === 'update') {
      const all = load(t);
      const now = new Date().toISOString();
      const hit: Row[] = [];
      for (const r of all) {
        if (this.filters.every((f) => f(r))) {
          const wasDone = t === 'bookings' && isDoneStatus(String(r.status));
          Object.assign(r, clone(this.payload), { updated_at: now });
          if (t === 'bookings' && !wasDone && isDoneStatus(String(r.status))) {
            if (!r.completed_at) r.completed_at = now;
            if (!r.materials_written_off) writeOffMaterials(r);
          }
          hit.push(r);
        }
      }
      save(t, all);
      hit.forEach((r) => emitChange(t, 'UPDATE', r));
      return this.returning ? this.finish(embedRows(t, hit, this.selectStr), null) : { data: null, error: null };
    }

    if (this.op === 'delete') {
      const all = load(t);
      const gone = all.filter((r) => this.filters.every((f) => f(r)));
      save(t, all.filter((r) => !gone.includes(r)));
      gone.forEach((r) => emitChange(t, 'DELETE', r));
      return this.returning ? this.finish(gone.map(clone), null) : { data: null, error: null };
    }

    // upsert
    const keys = (this.conflict || (t === 'studio_settings' ? 'key' : 'id')).split(',').map((s) => s.trim());
    const items = Array.isArray(this.payload) ? this.payload : [this.payload];
    const all = load(t);
    const out: Row[] = [];
    for (const it of items) {
      const existing = all.find((r) => keys.every((k) => !isNil(it[k]) && looseEq(r[k], it[k])));
      if (existing) {
        Object.assign(existing, clone(it), { updated_at: new Date().toISOString() });
        out.push(existing);
      } else {
        const row = applyDefaults(t, it);
        all.push(row);
        out.push(row);
      }
    }
    save(t, all);
    out.forEach((r) => emitChange(t, 'UPSERT', r));
    return this.returning ? this.finish(embedRows(t, out, this.selectStr), null) : { data: null, error: null };
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: any) => B | PromiseLike<B>) | null,
  ): Promise<A | B> {
    let result: Result;
    try {
      result = this.run();
    } catch (e) {
      result = { data: null, error: { message: (e as Error).message } };
    }
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

/* ---------------------------------------------------------------- auth (local, no passwords) */

const authListeners = new Set<(event: string, session: any) => void>();

function readSession(): any {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function notifyAuth(event: string, session: any) {
  setTimeout(() => authListeners.forEach((cb) => cb(event, session)), 0);
}

function ensureProfile(email: string, extra: Row = {}): Row {
  const profiles = load('profiles');
  const found = profiles.find((p) => String(p.email).toLowerCase() === email.toLowerCase());
  if (found) return found;
  const row = applyDefaults('profiles', {
    email,
    full_name: email.split('@')[0],
    role: 'super_admin',
    phone: null,
    avatar_url: null,
    is_active: true,
    invited_at: null,
    verified_at: new Date().toISOString(),
    must_change_password: false,
    ...extra,
  });
  profiles.push(row);
  save('profiles', profiles);
  return row;
}

const auth: any = {
  async getSession() {
    return { data: { session: readSession() }, error: null };
  },
  async getUser() {
    const s = readSession();
    return { data: { user: s?.user ?? null }, error: null };
  },
  onAuthStateChange(cb: (event: string, session: any) => void) {
    authListeners.add(cb);
    return { data: { subscription: { unsubscribe: () => authListeners.delete(cb) } } };
  },
  /** Local demo: any email signs in — no password is checked. */
  async signInWithPassword(creds: { email: string; password?: string }) {
    const email = (creds.email || '').trim();
    if (!email || !email.includes('@')) return { data: { user: null, session: null }, error: { message: 'Введите корректный email.' } };
    const profile = ensureProfile(email);
    const session = { access_token: 'local', user: { id: profile.id, email: profile.email } };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    notifyAuth('SIGNED_IN', session);
    return { data: { user: session.user, session }, error: null };
  },
  async signUp(args: { email: string; password?: string; options?: { data?: Row } }) {
    const profile = ensureProfile(args.email.trim(), {
      full_name: args.options?.data?.full_name ?? args.email.split('@')[0],
      role: args.options?.data?.role ?? 'reception',
    });
    return { data: { user: { id: profile.id, email: profile.email } }, error: null };
  },
  async signOut() {
    localStorage.removeItem(SESSION_KEY);
    notifyAuth('SIGNED_OUT', null);
    return { error: null };
  },
  async resetPasswordForEmail() {
    return { data: {}, error: null };
  },
  async updateUser() {
    return { data: { user: readSession()?.user ?? null }, error: null };
  },
  mfa: {
    async getAuthenticatorAssuranceLevel() {
      return { data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null };
    },
    async listFactors() {
      return { data: { totp: [], all: [] }, error: null };
    },
    async enroll() {
      return { data: null, error: { message: '2FA недоступна в локальном режиме.' } };
    },
    async challenge() {
      return { data: null, error: { message: '2FA недоступна в локальном режиме.' } };
    },
    async verify() {
      return { data: null, error: { message: '2FA недоступна в локальном режиме.' } };
    },
    async unenroll() {
      return { data: null, error: { message: '2FA недоступна в локальном режиме.' } };
    },
  },
};

/* ---------------------------------------------------------------- rpc + functions (local implementations) */

function code6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function rpc(name: string, args: Row = {}): Promise<Result> {
  switch (name) {
    case 'admin_create_user': {
      const email = String(args.p_email || '').trim();
      if (!email) return { data: null, error: { message: 'Email обязателен' } };
      if (load('profiles').some((p) => String(p.email).toLowerCase() === email.toLowerCase())) {
        return { data: null, error: { message: 'Пользователь с таким email уже существует' } };
      }
      const verification_code = code6();
      const profile = ensureProfile(email, {
        full_name: args.p_full_name || email.split('@')[0],
        role: args.p_role || 'reception',
        invited_at: null,
        verified_at: new Date().toISOString(),
        verification_code,
      });
      return { data: { user_id: profile.id, verification_code }, error: null };
    }
    case 'admin_reset_verification_code': {
      const profiles = load('profiles');
      const p = profiles.find((r) => r.id === args.p_user_id);
      if (!p) return { data: null, error: { message: 'Пользователь не найден' } };
      p.verification_code = code6();
      save('profiles', profiles);
      return { data: p.verification_code, error: null };
    }
    case 'admin_delete_user': {
      save('profiles', load('profiles').filter((r) => r.id !== args.p_user_id));
      return { data: true, error: null };
    }
    case 'verify_account_code': {
      const s = readSession();
      const profiles = load('profiles');
      const p = profiles.find((r) => r.id === s?.user?.id);
      if (p) { p.verified_at = new Date().toISOString(); save('profiles', profiles); }
      return { data: true, error: null };
    }
    case 'create_order_from_booking': {
      const bookings = load('bookings');
      const booking = bookings.find((b) => b.id === args.p_booking_id);
      if (!booking) return { data: null, error: { message: 'Запись не найдена' } };
      const orders = load('orders');
      const already = orders.find((o) => o.booking_id === booking.id);
      if (already) {
        if (!booking.order_id) { booking.order_id = already.id; save('bookings', bookings); }
        return { data: already.id, error: null };
      }
      const service = load('services').find((s) => s.id === booking.service_id);
      const extras = ((booking.extra_items as Row[] | undefined) ?? []);
      const svcRel = service ? { name: service.name, price: service.price } : null;
      const total = bookingValue({ estimated_value: booking.estimated_value as number | null, services: svcRel, extra_items: extras as never, discount: booking.discount as number | null });
      const lines = [
        ...(service ? [{ service_id: service.id, name: service.name, price: bookingBaseValue({ estimated_value: booking.estimated_value as number | null, services: svcRel }) }] : []),
        ...extras.map((x) => ({ service_id: x.service_id ?? null, name: x.name, price: Number(x.price) * Number(x.quantity ?? 1) })),
      ];
      // real material cost: what was actually written off, else what the recipes say; heuristic only when no recipes exist
      const recipeCost = booking.materials_written_off ? Number(booking.materials_cost ?? 0) : materialsFor(bookingServiceIds(booking)).cost;
      const materialsCost = recipeCost > 0 ? Math.round(recipeCost) : Math.round(total * 0.2);
      // labour: the technician's own commission rate when set, else the old 40 % estimate
      const tech = load('staff').find((s) => s.id === booking.assigned_technician_id);
      const labourCost = Number(tech?.commission_pct) > 0 ? Math.round((total * Number(tech?.commission_pct)) / 100) : Math.round(total * 0.4);
      const row = applyDefaults('orders', {
        customer_id: booking.customer_id,
        booking_id: booking.id,
        services: lines,
        materials_used: [],
        labour_cost: labourCost,
        materials_cost: materialsCost,
        total_amount: total,
        payment_status: booking.payment_status ?? 'unpaid',
        invoice_status: 'pending',
      });
      orders.push(row);
      save('orders', orders);
      booking.order_id = row.id;
      save('bookings', bookings);
      return { data: row.id, error: null };
    }
    default:
      return { data: null, error: { message: `Функция ${name} недоступна в локальном режиме` } };
  }
}

async function invoke(name: string, opts: { body?: Row } = {}): Promise<Result> {
  const body = opts.body ?? {};
  switch (name) {
    case 'admin-users': {
      if (body.action === 'create') {
        const r = await rpc('admin_create_user', { p_email: body.email, p_password: body.password, p_full_name: body.full_name, p_role: body.role });
        return r.error ? { data: { error: r.error.message }, error: null } : { data: r.data, error: null };
      }
      if (body.action === 'delete') {
        await rpc('admin_delete_user', { p_user_id: body.user_id });
        return { data: { ok: true }, error: null };
      }
      return { data: { ok: true }, error: null };
    }
    case 'r2-storage':
      return { data: { ok: true }, error: null };
    case 'create-payment': {
      const invoices = load('invoices');
      const inv = invoices.find((i) => i.id === body.invoice_id);
      if (body.action === 'info') return { data: { error: 'Онлайн-оплата недоступна в локальном режиме' }, error: null };
      if (body.demo_confirm && inv) {
        inv.status = 'paid';
        inv.paid_at = new Date().toISOString();
        save('invoices', invoices);
        return { data: { message: 'Оплата отмечена как выполненная (локально)' }, error: null };
      }
      return { data: { error: 'Онлайн-оплата недоступна в локальном режиме' }, error: null };
    }
    case 'send-invoice': {
      const invoices = load('invoices');
      const inv = invoices.find((i) => i.id === body.invoice_id);
      if (!inv) return { data: { error: 'Счёт не найден' }, error: null };
      const cust = load('customers').find((c) => c.id === inv.customer_id);
      inv.sent_at = new Date().toISOString();
      inv.last_sent_to = cust?.email ?? null;
      save('invoices', invoices);
      return { data: { message: 'Счёт отмечен как отправленный', recipient: cust?.email ?? null }, error: null };
    }
    case 'send-notification': {
      const cust = load('customers').find((c) => c.id === body.customer_id);
      const rows = load('communications');
      rows.push(applyDefaults('communications', {
        customer_id: body.customer_id,
        channel: body.channel ?? 'email',
        direction: 'outbound',
        subject: body.subject ?? null,
        content: body.body ?? '',
        body_text: body.body ?? '',
        recipient_email: cust?.email ?? null,
        email_status: 'sent',
        message_type: body.message_type ?? 'notification',
      }));
      save('communications', rows);
      return { data: { ok: true, message: body.open_mail ? 'Письмо открыто в вашей почтовой программе и сохранено в истории клиента' : 'Сохранено в истории клиента' }, error: null };
    }
    default:
      return { data: { error: `Функция ${name} недоступна в локальном режиме` }, error: null };
  }
}

/* ---------------------------------------------------------------- public client */

export const db = {
  from: (table: string) => new Query(table),
  auth,
  rpc,
  functions: { invoke },
  channel: (_name: string) => {
    const mine: { table: string | null; cb: ChangeCb }[] = [];
    const ch: any = {
      on(_type: string, filter: { table?: string }, cb: ChangeCb) {
        mine.push({ table: filter?.table ?? null, cb });
        return ch;
      },
      subscribe() {
        mine.forEach((l) => channelListeners.push(l));
        ch._mine = mine;
        return ch;
      },
      _mine: mine,
    };
    return ch;
  },
  removeChannel(ch: any) {
    (ch?._mine ?? []).forEach((l: any) => {
      const i = channelListeners.indexOf(l);
      if (i >= 0) channelListeners.splice(i, 1);
    });
  },
};
