import {
  INSPECTION_WORKFLOW_STAGES,
  workflowStageIndex,
  type InspectionWorkflowStage,
} from '../../lib/inspection';

interface InspectionWorkflowBarProps {
  stage: InspectionWorkflowStage;
  onStageChange?: (stage: InspectionWorkflowStage) => void;
  readonly?: boolean;
}

export function InspectionWorkflowBar({ stage, onStageChange, readonly }: InspectionWorkflowBarProps) {
  const currentIdx = workflowStageIndex(stage);

  return (
    <div className="inspection-workflow">
      <div className="inspection-workflow-track">
        {INSPECTION_WORKFLOW_STAGES.map((s, i) => {
          const done = i <= currentIdx;
          const active = s.id === stage;
          return (
            <button
              key={s.id}
              type="button"
              className={`inspection-workflow-step ${done ? 'done' : ''} ${active ? 'active' : ''}`}
              disabled={readonly || !onStageChange}
              onClick={() => onStageChange?.(s.id)}
              title={s.label}
            >
              <span className="inspection-workflow-num">{i + 1}</span>
              <span className="inspection-workflow-label">{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
