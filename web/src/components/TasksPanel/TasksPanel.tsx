import { Bot, ChevronDown, ChevronRight, FileText, MessageSquare, Square, SquareTerminal, Wrench } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { TaskInfo } from '../../../../shared/protocol';
import { closeTaskOutput, openSubagent, send, useStore } from '../../store';
import Dialog from '../ui/Dialog';
import Pill, { PillTone } from '../ui/Pill';
import { Chip, Icoonknop } from '../../vertex';
import styles from './TasksPanel.module.scss';

const KEEP_FINISHED_MS = 8000;

const isRunning = (t: TaskInfo) => t.status === 'running' || t.status === 'pending';

const tone = (t: TaskInfo): PillTone =>
  isRunning(t) ? 'running' : t.status === 'completed' ? 'done' : t.status === 'failed' ? 'error' : 'idle';

const STATUS: Record<string, string> = {
  running: 'bezig',
  pending: 'wacht',
  completed: 'klaar',
  failed: 'fout',
  stopped: 'gestopt',
  killed: 'gestopt',
  paused: 'gepauzeerd',
};

const duration = (ms?: number) => {
  if (!ms) {
    return '';
  }
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`;
};

const TaskRow = ({ task }: { task: TaskInfo }) => {
  const icon = task.kind === 'agent' ? <Bot size={14} /> : task.kind === 'bash' ? <SquareTerminal size={14} /> : <Wrench size={14} />;
  const meta = [
    task.toolUses ? `${task.toolUses} tools` : '',
    task.tokens ? `${Math.round(task.tokens / 1000)}k tokens` : '',
    duration(task.durationMs),
  ].filter(Boolean);

  return (
    <li className={styles.row}>
      <span className={styles.icon}>{icon}</span>
      <span className={styles.main}>
        <span className={styles.desc}>
          {task.subagentType && <Chip toon="accent">{task.subagentType}</Chip>}
          <span className={styles.descText}>{task.description || task.id}</span>
        </span>
        {(task.lastTool || task.summary) && (
          <span className={styles.sub}>{isRunning(task) && task.lastTool ? `→ ${task.lastTool}` : task.summary}</span>
        )}
      </span>
      {meta.length > 0 && <span className={styles.meta}>{meta.join(' · ')}</span>}
      <Pill tone={tone(task)}>{STATUS[task.status] ?? task.status}</Pill>
      {task.kind === 'agent' && task.toolUseId && (
        <Icoonknop maat={32} aria-label="Chat openen" title="Chat openen" onClick={() => openSubagent(task.toolUseId as string)}>
          <MessageSquare size={14} />
        </Icoonknop>
      )}
      {task.hasOutput && (
        <Icoonknop maat={32} aria-label="Output bekijken" title="Output bekijken" onClick={() => send({ type: 'task_output', taskId: task.id })}>
          <FileText size={14} />
        </Icoonknop>
      )}
      {isRunning(task) && (
        <Icoonknop maat={32} aria-label="Stoppen" title="Stoppen" onClick={() => send({ type: 'stop_task', taskId: task.id })}>
          <Square size={14} />
        </Icoonknop>
      )}
    </li>
  );
};

const TasksPanel = () => {
  const tasks = useStore((s) => s.tasks);
  const taskOutput = useStore((s) => s.taskOutput);
  const [open, setOpen] = useState(true);
  const [now, setNow] = useState(Date.now());
  const running = tasks.filter(isRunning);
  // Afgeronde taken nog even tonen en dan weghalen.
  const visible = tasks.filter((t) => isRunning(t) || !t.endedAt || now - t.endedAt < KEEP_FINISHED_MS);
  const finished = visible.length - running.length;

  useEffect(() => {
    if (finished === 0) {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [finished]);

  if (visible.length === 0 && !taskOutput) {
    return null;
  }

  const agents = visible.filter((t) => t.kind === 'agent').length;
  const shells = visible.filter((t) => t.kind === 'bash').length;

  return (
    <div className={styles.panel}>
      <button type="button" className={styles.header} onClick={() => setOpen((o) => !o)}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>Taken</span>
        <span className={styles.counts}>
          {running.length > 0 && <span className={styles.active}>{running.length} actief</span>}
          {agents > 0 && <span>{agents} subagent{agents === 1 ? '' : 's'}</span>}
          {shells > 0 && <span>{shells} shell{shells === 1 ? '' : 's'}</span>}
        </span>
      </button>
      {open && (
        <ul className={styles.list}>
          {[...running, ...visible.filter((t) => !isRunning(t)).reverse()].map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>
      )}
      {taskOutput && (
        <Dialog title={`Output ${tasks.find((t) => t.id === taskOutput.taskId)?.description ?? ''}`} onClose={closeTaskOutput}>
          <pre className={styles.output}>{taskOutput.output || '(leeg)'}</pre>
        </Dialog>
      )}
    </div>
  );
};

export default TasksPanel;
