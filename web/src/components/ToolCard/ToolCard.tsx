import { ChevronRight, FilePen, FileText, Globe, ListTodo, Search, SquareTerminal, Wrench } from 'lucide-react';
import type { ToolItem } from '../../../../shared/protocol';
import { useContext } from 'react';
import { openSubagent, TabIdContext, useApp, useTabState } from '../../store';
import Pill from '../ui/Pill';
import { Chip } from '../../vertex';
import DiffView from './DiffView';
import styles from './ToolCard.module.scss';

const str = (value: unknown) => (typeof value === 'string' ? value : '');

const summary = (tool: ToolItem) => {
  const { input } = tool;
  return (
    str(input.command) ||
    str(input.file_path) ||
    str(input.notebook_path) ||
    str(input.pattern) ||
    str(input.url) ||
    str(input.query) ||
    str(input.description) ||
    str(input.prompt)
  );
};

const iconFor = (name: string) => {
  if (name === 'Bash' || name === 'BashOutput') {
    return <SquareTerminal size={14} />;
  }
  if (['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(name)) {
    return <FilePen size={14} />;
  }
  if (name === 'Read') {
    return <FileText size={14} />;
  }
  if (['Grep', 'Glob'].includes(name)) {
    return <Search size={14} />;
  }
  if (['WebFetch', 'WebSearch'].includes(name)) {
    return <Globe size={14} />;
  }
  if (name === 'TodoWrite') {
    return <ListTodo size={14} />;
  }
  return <Wrench size={14} />;
};

export const ToolInput = ({ tool }: { tool: ToolItem }) => {
  const { input } = tool;
  if (tool.name === 'Edit' && typeof input.old_string === 'string') {
    return <DiffView oldText={input.old_string} newText={str(input.new_string)} />;
  }
  if (tool.name === 'MultiEdit' && Array.isArray(input.edits)) {
    return (
      <>
        {(input.edits as { old_string: string; new_string: string }[]).map((edit, index) => (
          <DiffView key={index} oldText={edit.old_string} newText={edit.new_string} />
        ))}
      </>
    );
  }
  if (tool.name === 'Write' && typeof input.content === 'string') {
    return <DiffView oldText="" newText={input.content} />;
  }
  if (tool.name === 'Bash') {
    return <pre className={styles.code}>$ {str(input.command)}</pre>;
  }
  return <pre className={styles.code}>{JSON.stringify(input, null, 2)}</pre>;
};

const ToolCard = ({ tool }: { tool: ToolItem }) => {
  const contextTab = useContext(TabIdContext);
  const activeId = useApp((s) => s.activeId);
  const activity = useTabState(contextTab || activeId, (s) => s.subActivity[tool.id]);
  const isFileChange = ['Edit', 'MultiEdit', 'Write'].includes(tool.name);
  const tone = !tool.done ? 'running' : tool.isError ? 'error' : 'done';

  return (
    <details
      className={styles.card}
      open={isFileChange || undefined}
      onToggle={(event) => {
        const el = event.currentTarget;
        if (el.open) {
          // Uitgeklapte inhoud in beeld brengen (alleen scrollen als dat nodig is).
          requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
        }
      }}
    >
      <summary className={styles.header}>
        <ChevronRight size={14} className={styles.chevron} />
        <span className={styles.icon}>{iconFor(tool.name)}</span>
        <span className={styles.name}>{tool.name}</span>
        <span className={styles.summary}>{summary(tool)}</span>
        {(tool.name === 'Agent' || tool.name === 'Task') && (
          <Chip
            toon="accent"
            onClick={(event) => {
              event.preventDefault();
              openSubagent(tool.id);
            }}
          >
            Chat openen
          </Chip>
        )}
        {activity && <span className={styles.steps}>{activity.filter((a) => a.kind === 'tool').length} stappen</span>}
        {tone !== 'done' && <Pill tone={tone}>{tone === 'running' ? 'bezig' : 'fout'}</Pill>}
      </summary>
      <div className={styles.body}>
        <ToolInput tool={tool} />
        {activity && (
          <ol className={styles.activity}>
            {activity.slice(-40).map((a) => (
              <li key={a.id} className={a.kind === 'text' ? styles.activityText : undefined}>
                {a.label}
              </li>
            ))}
          </ol>
        )}
        {tool.output !== undefined && (
          <pre className={tool.isError ? `${styles.code} ${styles.error}` : styles.code}>
            {tool.output || '(geen output)'}
          </pre>
        )}
      </div>
    </details>
  );
};

export default ToolCard;
