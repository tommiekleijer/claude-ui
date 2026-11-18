import { Bot } from 'lucide-react';
import { useEffect } from 'react';
import { closeSubagent, refreshSubagent, useStore } from '../../store';
import { renderItem } from '../ChatView/ChatView';
import Dialog from '../ui/Dialog';
import { Chip } from '../../vertex';
import styles from './SubagentDialog.module.scss';

const SubagentDialog = () => {
  const view = useStore((s) => s.subagentView);
  const tool = useStore((s) => s.items.find((i) => i.id === view?.toolUseId));
  const live = useStore((s) => (view ? s.subagentLive[view.toolUseId] : undefined));
  const running = tool?.kind === 'tool' && !tool.done;

  // Zolang de subagent bezig is en er geen live gesprek binnenkomt, het transcript opnieuw ophalen.
  useEffect(() => {
    if (!view || !running || live) {
      return undefined;
    }
    const timer = setInterval(() => refreshSubagent(view.toolUseId), 2000);
    return () => clearInterval(timer);
  }, [view?.toolUseId, running, Boolean(live)]);

  if (!view) {
    return null;
  }
  const items = live ?? view.items;

  const input = tool?.kind === 'tool' ? tool.input : {};
  const title = [input.subagent_type, input.description].filter((v) => typeof v === 'string' && v).join(' · ');

  return (
    <Dialog
      wide
      onClose={closeSubagent}
      title={
        <>
          <Bot size={20} />
          Subagent{title ? `: ${title}` : ''}
          {running && <Chip toon="waarschuwing">live</Chip>}
        </>
      }
    >
      {items === null && <p className={styles.empty}>Laden…</p>}
      {items?.length === 0 && <p className={styles.empty}>De subagent is net gestart; zijn gesprek verschijnt hier zodra hij iets doet.</p>}
      <div className={styles.chat}>{items?.map(renderItem)}</div>
      {running && <div className={styles.working}>Subagent is bezig…</div>}
    </Dialog>
  );
};

export default SubagentDialog;
