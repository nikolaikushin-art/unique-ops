# v51 — Leads toolbar as segmented controls (on top of v50)

Files changed
- src/pages/LeadsPage.tsx — new filter bar, compact 7-column table, iOS-style detail sheet, bulk bar, shared SelectField/Group components
- src/styles/leads.css — rewritten (all .ld-* styles; dashboard helper classes kept)
- src/pages/SettingsPage.tsx — detail column pinned below the top bar, resets to top when a section opens
- src/styles/apple-visuals.css — sticky / self-scrolling `.settings-detail-pane` (≥900px)

Behaviour notes
- Quick-stats strip on Leads is hidden while the Analytics dashboard is open (no duplicated numbers).
- Table rows: edit/delete icons removed (both remain in the detail sheet; delete also in the bulk bar). Age is in the row tooltip and in the sheet.
- No new dependencies.

Run `npm install && npm run build` to confirm.

- v51: status row and quick filters are now iOS segmented controls (same look as List / Board / Tasks); "+ Сохранить вид" moved next to the view switch; quick-filter captions shortened (full text in tooltip).
