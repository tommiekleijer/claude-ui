import { Cpu, Gauge } from 'lucide-react';
import { useEffect } from 'react';
import type { Effort } from '../../../../shared/protocol';
import { isTerminalKey, send, useStore } from '../../store';
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

  // Ctrl+↑/↓ (op de Mac ook Cmd): effort hoger of lager, in de volgorde van de lijst.
  useEffect(() => {
    if (efforts.length === 0) {
      return undefined;
    }
    const handleKey = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.shiftKey || event.altKey || isTerminalKey(event)) {
        return;
      }
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
        return;
      }
      event.preventDefault();
      const current = effort ? efforts.indexOf(effort) : efforts.indexOf('medium');
      const next = Math.min(Math.max((current === -1 ? 0 : current) + (event.key === 'ArrowUp' ? 1 : -1), 0), efforts.length - 1);
      if (efforts[next] !== effort) {
        send({ type: 'set_effort', effort: efforts[next] });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [efforts, effort]);

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
          title="Effort (Ctrl+↑/↓)"
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
