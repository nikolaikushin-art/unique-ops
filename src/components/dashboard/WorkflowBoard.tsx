import { WORKFLOW_STAGES, WORKFLOW_STAGE_TONES } from '../../lib/constants';
import { vehicleDisplayName } from '../../lib/constants';
import type { Vehicle } from '../../types/database';
import { StorageBar } from '../charts/StorageBar';
import { TINT } from '../charts/palette';

const STAGE_COLORS = [TINT.gray, TINT.teal, TINT.yellow, TINT.orange, TINT.purple, TINT.blue, TINT.green];

interface WorkflowBoardProps {
  counts: Record<string, number>;
  stageGroups?: Record<string, Vehicle[]>;
  compact?: boolean;
  hideChart?: boolean;
  onNavigate?: () => void;
}

export function WorkflowBoard({ counts, stageGroups, compact, hideChart, onNavigate }: WorkflowBoardProps) {
  return (
    <div className="workflow-board-wrap">
      {!compact && !hideChart && (
        <div style={{ marginBottom: 20 }}>
          <StorageBar
            height={14}
            emptyText="В цехе пока нет автомобилей"
            segments={WORKFLOW_STAGES.map((stage, i) => ({ id: stage, label: stage, value: counts[stage] ?? 0, color: STAGE_COLORS[i], display: String(counts[stage] ?? 0) }))}
          />
        </div>
      )}
      <div className={`pipeline-grid workflow-board${compact ? ' compact' : ''}`}>
        {WORKFLOW_STAGES.map((stage, ci) => {
          const cars = stageGroups?.[stage] ?? [];
          return (
            <div key={stage} className="workflow-col">
              <div className="pipeline-col-head">
                <div className={`pipeline-col-title${WORKFLOW_STAGE_TONES[ci] ? ' ' + WORKFLOW_STAGE_TONES[ci] : ''}`}>
                  <span className="pipeline-col-num">{ci + 1}</span>
                  <span className="pipeline-col-name" title={stage}>{stage}</span>
                </div>
                <div className="pipeline-col-count">{counts[stage] ?? 0}</div>
              </div>
              {!compact && cars.slice(0, 2).map((c) => (
                <div className="pcard" key={c.id}>
                  <div className="pid"><span>{c.registration_number || '—'}</span></div>
                  <div className="pname">{vehicleDisplayName(c)}</div>
                  <div className="pclient">{c.customers?.full_name}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {onNavigate && (
        <div className="link-btn" style={{ marginTop: 16 }} onClick={onNavigate}>
          Открыть доску →
        </div>
      )}
    </div>
  );
}
