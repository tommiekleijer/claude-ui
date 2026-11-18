import { Cpu, Gauge } from 'lucide-react';
import type { Effort } from '../../../../shared/protocol';
import { send, useStore } from '../../store';
import Select from '../ui/Select';

const EFFORT_LABELS: Record<Effort, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};

// "claude-opus-5-5" -> "Opus 5.5"
const prettyModel = (id: string) =>
  id
    .replace(/^claude-/, '')
    .replace(/-(\d+)-(\d+)(-\d{8})?$/, ' $1.$2')
    .replace(/^\w/, (c) => c.toUpperCase());

const ModelControls = () => {
  const models = useStore((s) => s.models);
  const selectedModel = useStore((s) => s.selectedModel);
  const activeModel = useStore((s) => s.model);
  const effort = useStore((s) => s.effort);

  const selected = models.find((m) => m.value === selectedModel);
  const modelLabel = selected?.label ?? (activeModel ? prettyModel(activeModel) : 'Standaard model');
  const efforts = (selected ?? models.find((m) => m.value === 'default'))?.efforts ?? [];

  return (
    <>
      <Select
        title="Model"
        label={
          <>
            <Cpu size={13} />
            {modelLabel}
          </>
        }
        value={selectedModel}
        options={models.map((m) => ({ value: m.value, label: m.label }))}
        onChange={(model) => send({ type: 'set_model', model })}
      />
      {efforts.length > 0 && (
        <Select
          title="Effort"
          label={
            <>
              <Gauge size={13} />
              {effort ? EFFORT_LABELS[effort] : 'Standaard effort'}
            </>
          }
          value={effort}
          options={efforts.map((e) => ({ value: e, label: EFFORT_LABELS[e] }))}
          onChange={(value) => send({ type: 'set_effort', effort: value as Effort })}
        />
      )}
    </>
  );
};

export default ModelControls;
