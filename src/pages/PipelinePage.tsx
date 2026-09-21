import { useMemo, useState } from 'react';
import { useAnalyticsVisibility } from '../hooks/useAnalyticsVisibility';
import { AnalyticsToggle } from '../components/dashboard/AnalyticsToggle';
import { PipelineDashboard } from '../components/dashboard/PageDashboards';
import { useLocalQuery } from '../hooks/useLocalData';
import { useToast } from '../contexts/ToastContext';
import { useDataRefresh } from '../contexts/DataRefreshContext';
import { WORKFLOW_STAGES, WORKFLOW_STAGE_TONES, fmtDate, vehicleDisplayName } from '../lib/constants';
import { groupVehiclesByStage, syncBookingFromKanbanStage, normalizePipelineStage } from '../lib/workflow';
import { db } from '../lib/localdb';
import type { Vehicle } from '../types/database';
import { VehicleThumb } from '../components/VehicleThumb';

export function PipelinePage() {
  const [showCharts, toggleCharts] = useAnalyticsVisibility('pipeline');
  const { data: vehicles } = useLocalQuery<Vehicle>('vehicles', '*, customers(*)');
  const { toast } = useToast();
  const { refresh } = useDataRefresh();
  const [dragId, setDragId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');

  const filteredVehicles = useMemo(() => vehicles.filter((v) => {
    const q = search.toLowerCase();
    if (q && !`${v.brand}${v.model}${v.registration_number}${v.customers?.full_name}`.toLowerCase().includes(q)) return false;
    if (stageFilter && normalizePipelineStage(v.pipeline_stage) !== stageFilter) return false;
    return true;
  }), [vehicles, search, stageFilter]);

  const stageGroups = groupVehiclesByStage(filteredVehicles);
  const totalInPipeline = filteredVehicles.filter((v) => !['Завершено'].includes(normalizePipelineStage(v.pipeline_stage))).length;

  const moveToStage = async (vehicleId: string, stage: string) => {
    const { error } = await db.from('vehicles').update({ pipeline_stage: stage }).eq('id', vehicleId);
    if (error) { toast('Ошибка: ' + error.message); return; }
    const syncErr = await syncBookingFromKanbanStage(vehicleId, stage);
    if (syncErr) toast('Этап обновлён, статус брони не синхронизирован');
    refresh();
    toast('Автомобиль перемещён');
  };

  const onDrop = (stage: string) => {
    if (dragId) moveToStage(dragId, stage);
    setDragId(null);
  };

  const exportCSV = () => {
    const rows = [['Номер', 'Авто', 'Клиент', 'Этап', 'ETA'],
      ...filteredVehicles.map((v) => [v.registration_number, vehicleDisplayName(v), v.customers?.full_name, normalizePipelineStage(v.pipeline_stage), v.eta_at])];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pipeline.csv';
    a.click();
    toast('Доска экспортирована');
  };

  return (
    <>
      <div className="header-row">
        <div>
          <div className="eyebrow"><span className="dot"></span>Цех · операционная доска</div>
          <h1 className="page-title">Производство</h1>
          <p className="page-sub">Kanban: 7 этапов — перетащите карточку или нажмите → для перехода.</p>
        </div>
        <div className="tag-row">
          <AnalyticsToggle visible={showCharts} onToggle={toggleCharts} />
          <div className="tag blue"><span className="dot"></span>{totalInPipeline} в работе</div>
          <div className="tag ghost" onClick={exportCSV}>Экспорт CSV</div>
        </div>
      </div>

      <div className="table-toolbar">
        <input className="search-input" placeholder="Поиск: номер, марка, клиент" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="field-select" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}>
          <option value="">Все этапы</option>
          {WORKFLOW_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <br />

      {showCharts && <PipelineDashboard stages={WORKFLOW_STAGES} counts={Object.fromEntries(WORKFLOW_STAGES.map((st) => [st, stageGroups[st]?.length ?? 0]))} vehicles={filteredVehicles} />}

      <div className="workflow-board-wrap">
      <div className="pipeline-grid workflow-board">
        {WORKFLOW_STAGES.map((stage, ci) => {
          const cars = stageGroups[stage] ?? [];
          return (
            <div
              key={stage}
              className="workflow-col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(stage)}
            >
              <div className="pipeline-col-head">
                <div className={`pipeline-col-title${WORKFLOW_STAGE_TONES[ci] ? ' ' + WORKFLOW_STAGE_TONES[ci] : ''}`}>
                  <span className="pipeline-col-num">{ci + 1}</span>
                  <span className="pipeline-col-name" title={stage}>{stage}</span>
                </div>
                <div className="pipeline-col-count">{cars.length}</div>
              </div>
              {cars.map((c) => (
                <div
                  className="pcard"
                  key={c.id}
                  draggable
                  onDragStart={() => setDragId(c.id)}
                  onDragEnd={() => setDragId(null)}
                >
                  <div className="pid"><span>{c.registration_number || '—'}</span></div>
                  <div className="with-thumb pcar">
                    <VehicleThumb brand={c.brand} vehicleId={c.id} />
                    <div className="with-thumb-text">
                      <div className="pname">{vehicleDisplayName(c)}</div>
                      <div className="pclient">{c.customers?.full_name}</div>
                    </div>
                  </div>
                  <div className="peta">
                    <span className="l"><span className="dot"></span>ETA {fmtDate(c.eta_at)}</span>
                    {ci < WORKFLOW_STAGES.length - 1 && (
                      <span className="advance" onClick={() => moveToStage(c.id, WORKFLOW_STAGES[ci + 1])} title="Следующий этап">→</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      </div>
    </>
  );
}
