import { ChevronRight, FilePen, FileText, Globe, ListTodo, MessageCircleQuestion, Search, SquareTerminal, Wrench } from 'lucide-react';
import type { Question, ToolItem } from '../../../../shared/protocol';
import { useContext } from 'react';
import { openSubagent, TabIdContext, useApp, useTabState } from '../../store';
import Pill from '../ui/Pill';
import { Chip } from '../../vertex';
import DiffView from './DiffView';
import styles from './ToolCard.module.scss';

const str = (value: unknown) => (typeof value === 'string' ? value : '');

const questionsOf = (tool: ToolItem) => (Array.isArray(tool.input.questions) ? (tool.input.questions as Question[]) : []);

const ANSWERS_TAIL = '". Read the answers carefully';

/**
 * Antwoorden staan alleen in de tool_result-tekst (de bijgewerkte invoer met `answers` bereikt de webkant niet, ook niet in de geschiedenis):
 * `The user answered: "<vraag>"="<antwoord>", "<vraag>"="<antwoord>". Read the answers carefully — …`. De vraagteksten uit de invoer dienen als ankers;
 * ontbreekt er één, dan null (alleen de vragen tonen).
 */
const answersOf = (tool: ToolItem) => {
  const output = tool.output ?? '';
  if (tool.isError || !output.startsWith('The user answered: ')) {
    return null;
  }
  const questions = questionsOf(tool);
  const starts: number[] = [];
  for (const q of questions) {
    const at = output.indexOf(`"${q.question}"="`, starts.at(-1) ?? 0);
    if (at < 0) {
      return null;
    }
    starts.push(at);
  }
  const end = output.lastIndexOf(ANSWERS_TAIL);
  if (end < 0) {
    return null;
  }
  // Tussen twee antwoorden staat `", ` vóór het volgende anker.
  return questions.map((q, index) =>
    output.slice(starts[index] + q.question.length + 4, index + 1 < questions.length ? starts[index + 1] - 3 : end),
  );
};

/** Meerdere keuzes komen als "label, label" terug, in kliksvolgorde; labels kunnen zelf ", " bevatten. Wat geen label is, is de eigen tekst bij "Anders". */
const splitAnswer = (q: Question, answer: string) => {
  const labels = q.options.map((option) => option.label);
  if (labels.includes(answer)) {
    return { chosen: [answer], own: '' };
  }
  if (!q.multiSelect) {
    return { chosen: [], own: answer };
  }
  const longestFirst = [...labels].sort((a, b) => b.split(', ').length - a.split(', ').length);
  const parts = answer.split(', ');
  const chosen: string[] = [];
  const own: string[] = [];
  for (let i = 0; i < parts.length; ) {
    const label = longestFirst.find((l) => parts.slice(i, i + l.split(', ').length).join(', ') === l);
    if (label) {
      chosen.push(label);
      i += label.split(', ').length;
    } else {
      own.push(parts[i]);
      i += 1;
    }
  }
  return { chosen, own: own.join(', ') };
};

const summary = (tool: ToolItem) => {
  const { input } = tool;
  if (tool.name === 'AskUserQuestion') {
    const answers = answersOf(tool);
    return questionsOf(tool)
      .map((q, index) => (answers ? `${q.header}: ${answers[index]}` : q.header))
      .join(' · ');
  }
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
  if (name === 'AskUserQuestion') {
    return <MessageCircleQuestion size={14} />;
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
  if (tool.name === 'AskUserQuestion') {
    const answers = answersOf(tool);
    return (
      <>
        {questionsOf(tool).map((q, index) => {
          const { chosen, own } = answers ? splitAnswer(q, answers[index]) : { chosen: [], own: '' };
          return (
            <div key={index} className={styles.question}>
              <div className={styles.questionLine}>
                <Chip toon="accent">{q.header}</Chip>
                <span className={styles.questionText}>{q.question}</span>
              </div>
              {answers && (
                <div className={styles.answer}>
                  {chosen.length > 0 && <span className={styles.answerLabel}>{chosen.join(', ')}</span>}
                  {own && <span className={styles.answerOwn}>{own}</span>}
                </div>
              )}
            </div>
          );
        })}
        {!answers && tool.output && <p className={styles.unanswered}>{tool.output}</p>}
      </>
    );
  }
  return <pre className={styles.code}>{JSON.stringify(input, null, 2)}</pre>;
};

const ToolCard = ({ tool }: { tool: ToolItem }) => {
  const contextTab = useContext(TabIdContext);
  const activeId = useApp((s) => s.activeId);
  const activity = useTabState(contextTab || activeId, (s) => s.subActivity[tool.id]);
  const isFileChange = ['Edit', 'MultiEdit', 'Write'].includes(tool.name);
  const tone = !tool.done ? 'running' : tool.isError ? 'error' : 'done';
  const isQuestion = tool.name === 'AskUserQuestion';

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
        {tone === 'running' && <Pill tone="running">bezig</Pill>}
        {tone === 'error' && (isQuestion ? <Pill tone="idle">niet beantwoord</Pill> : <Pill tone="error">fout</Pill>)}
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
        {tool.output !== undefined && !isQuestion && (
          <pre className={tool.isError ? `${styles.code} ${styles.error}` : styles.code}>
            {tool.output || '(geen output)'}
          </pre>
        )}
      </div>
    </details>
  );
};

export default ToolCard;
