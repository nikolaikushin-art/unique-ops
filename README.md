# Unique Operations — local build

Fully local. **No Supabase, no cloud, no server, no passwords.**

- Data: browser `localStorage` (demo data is loaded on first launch)
- Files/photos/documents: browser IndexedDB
- Login: type any email and press "Войти" (e.g. `info@uniquedetailing.ru`)

## Run
```bash
npm install
npm run dev        # http://localhost:5173
```

## Build / host anywhere (static files)
```bash
npm run build      # outputs ./dist — drag the folder to Netlify Drop, or any static host
```

## Reset data
Settings → Локальное хранилище → «Сбросить», or run `localStorage.clear()` in the browser console.

Data lives per browser/device — it is not shared between computers.

## Dashboards (chart kit)

Finance, Warehouse, Reports and Overview use the shared Apple-style chart kit in `src/components/charts/`
(area charts, sparklines, activity rings, donuts, ranked bars, storage bars, funnel, heatmap, diagnostics).
Every `KpiCard` in the app renders the same metric tile. Diagnostic rules live in `src/lib/diagnostics.ts`;
time bucketing helpers in `src/lib/analytics.ts` (`buildBuckets`, `sumIntoBuckets`).

Page dashboards (`src/components/dashboard/PageDashboards.tsx`): Bookings, Jobs, Inspection, Leads, Pipeline,
Services (analytics + cost breakdown), Staff, Customers, Vehicles — each with its own charts and diagnostics.

## Platform reconciliation

`src/lib/metrics.ts` holds the canonical metric definitions (revenue = cash received at payment date, no double
counting of invoice + booking, "К оплате", overdue, delayed job, average check, …). Every screen uses it.
`src/lib/reconciliation.ts` + `ReconciliationPanel` (bottom of Reports) run 25 tie-out and data-integrity checks,
with admin-confirmed fixes and CSV export.

Every module with charts has a header switch «Скрыть аналитику / Аналитика» (`AnalyticsToggle`,
`useAnalyticsVisibility`). Charts start hidden every time a module opens; the button reveals them. KPI tiles always stay visible.

## Leads module (v46)

`src/lib/leads.ts` is the single source of truth for lead scoring (transparent factors), SLA (24 h to first reply),
follow-up state, pipeline value / weighted forecast and every dashboard aggregate.
`src/pages/LeadsPage.tsx` — list, kanban and tasks (agenda) views, smart filters with live counts, status tabs,
active-filter chips + «Сбросить всё», sortable columns, bulk actions, saved views, and a right-hand lead drawer
(quick call / WhatsApp / email, next-step scheduler, deal value, tags, score breakdown, duplicates, timeline).
`src/components/leads/LeadsDashboardPro.tsx` — analytics (KPIs, funnel with step conversion, 14-day dynamics,
source and manager tables, lost reasons, aging, heatmap, forecast, diagnostics). Styles: `src/styles/leads.css`.
