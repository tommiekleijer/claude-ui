import { Droplet, PanelLeftClose, PanelLeftOpen, Plus, SquareTerminal, X } from 'lucide-react';
import { DragEvent, MouseEvent, useEffect, useRef, useState } from 'react';
import { native } from '../../native';
import { Chip, Icoonknop } from '../../vertex';
import {
  activateTab,
  closeTab,
  getTab,
  moveTab,
  openSettings,
  renameChat,
  reopenClosedTab,
  setPicker,
  toggleSidebar,
  toggleTerminalPanel,
  useApp,
  useTabState,
} from '../../store';
import { matchesShortcut, useShortcut } from '../../shortcuts';
import styles from './TabBar.module.scss';

/** De tab die nu gesleept wordt, met de volgorde van vóór het slepen (voor Esc). */
let dragging: { id: number; original: number[] } | null = null;

const TabButton = ({ id, active }: { id: number; active: boolean }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [editing, setEditing] = useState(false);
  const cancelled = useRef(false);
  const sessions = useApp((s) => s.sessions);
  const cwd = useTabState(id, (s) => s.cwd);
  const sessionId = useTabState(id, (s) => s.sessionId);
  const firstUser = useTabState(id, (s) => s.items.find((i) => i.kind === 'user'));
  const running = useTabState(id, (s) => s.running);
  const waiting = useTabState(id, (s) => s.permissions.length > 0 || s.questions.length > 0);
  const unread = useTabState(id, (s) => s.unread);
  const queued = useTabState(id, (s) => s.queue.filter((q) => !q.resumed).length);

  const sessionTitle = sessionId ? sessions.find((s) => s.sessionId === sessionId)?.title : undefined;
  const title = sessionTitle || (firstUser?.kind === 'user' ? firstUser.text : '') || 'Nieuwe chat';
  const repo = cwd?.split('/').pop();

  const close = (event: MouseEvent) => {
    event.stopPropagation();
    if (running && !window.confirm('Claude is nog bezig in dit tabblad. Toch sluiten?')) {
      return;
    }
    closeTab(id);
  };

  const sideOf = (event: DragEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX > rect.left + rect.width / 2 ? 'right' : 'left';
  };

  return (
    <div
      draggable={!editing}
      onDragStart={(event) => {
        event.dataTransfer.setData('application/x-claude-tab', String(id));
        event.dataTransfer.effectAllowed = 'move';
        dragging = { id, original: useApp.getState().tabIds };
        setIsDragging(true);
      }}
      onDragEnd={(event) => {
        // Losgelaten buiten de tabbalk of geannuleerd met Esc: oude volgorde terug.
        if (event.dataTransfer.dropEffect === 'none' && dragging) {
          useApp.setState({ tabIds: dragging.original });
        }
        dragging = null;
        setIsDragging(false);
      }}
      onDragOver={(event) => {
        if (!dragging) {
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        // Live verplaatsen: de tab zelf laat zien waar hij terechtkomt.
        const { tabIds } = useApp.getState();
        const after = sideOf(event) === 'right';
        const target = tabIds.indexOf(id) + (after ? 1 : 0);
        const from = tabIds.indexOf(dragging.id);
        if (dragging.id !== id && target !== from && target !== from + 1) {
          moveTab(dragging.id, id, after);
        }
      }}
      onDrop={(event) => event.preventDefault()}
      role="tab"
      aria-selected={active}
      className={[styles.tab, active && styles.active, isDragging && styles.dragging].filter(Boolean).join(' ')}
      onClick={() => activateTab(id)}
      onAuxClick={(event) => event.button === 1 && close(event)}
      title={`${title}${cwd ? `\n${cwd}` : ''}`}
    >
      <span
        className={[
          styles.dot,
          waiting ? styles.waiting : running ? styles.running : unread ? styles.unread : '',
        ].join(' ')}
        title={waiting ? 'Wacht op toestemming' : running ? 'Bezig' : unread ? 'Klaar, nog niet gelezen' : undefined}
      />
      {editing ? (
        <input
          className={styles.titleInvoer}
          defaultValue={title}
          autoFocus
          onFocus={(event) => event.currentTarget.select()}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === 'Escape') {
              cancelled.current = event.key === 'Escape';
              event.currentTarget.blur();
            }
          }}
          onBlur={(event) => {
            const value = event.currentTarget.value.trim();
            setEditing(false);
            if (!cancelled.current && value && value !== title) {
              renameChat(id, value);
            }
            cancelled.current = false;
          }}
        />
      ) : active && sessionId ? (
        <button
          type="button"
          className={`${styles.title} ${styles.titleKnop}`}
          title="Chat hernoemen"
          onClick={(event) => {
            event.stopPropagation();
            setEditing(true);
          }}
        >
          {title}
        </button>
      ) : (
        <span className={styles.title}>{title}</span>
      )}
      {repo &&
        (active ? (
          <button
            type="button"
            className={`${styles.repo} ${styles.repoKnop}`}
            title="Chat verplaatsen naar een andere map"
            onClick={(event) => {
              event.stopPropagation();
              setPicker('move');
            }}
          >
            {repo}
          </button>
        ) : (
          <span className={styles.repo}>{repo}</span>
        ))}
      {queued > 0 && (
        <Chip toon="waarschuwing">
          {String(queued)}
        </Chip>
      )}
      <button type="button" className={styles.close} aria-label="Tabblad sluiten" onClick={close}>
        <X size={14} />
      </button>
    </div>
  );
};

const SettingsButton = () => (
  <Icoonknop maat={32} onClick={openSettings} aria-label="Instellingen" title="Instellingen">
    <Droplet size={16} />
  </Icoonknop>
);

const TabBar = () => {
  const tabIds = useApp((s) => s.tabIds);
  const activeId = useApp((s) => s.activeId);
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const sidebarKey = useShortcut('toggleSidebar');
  const newTabKey = useShortcut('newTab');

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const index = tabIds.indexOf(activeId);
      const number = [1, 2, 3, 4, 5, 6, 7, 8].find((n) => matchesShortcut(event, `tab${n}` as const));
      if (matchesShortcut(event, 'toggleSidebar')) {
        event.preventDefault();
        toggleSidebar();
      } else if (matchesShortcut(event, 'newTab')) {
        event.preventDefault();
        setPicker('new');
      } else if (matchesShortcut(event, 'closeTab')) {
        event.preventDefault();
        const running = getTab(activeId)?.store.getState().running;
        if (!running || window.confirm('Claude is nog bezig in dit tabblad. Toch sluiten?')) {
          closeTab(activeId);
        }
      } else if (matchesShortcut(event, 'reopenTab')) {
        event.preventDefault();
        reopenClosedTab();
      } else if (matchesShortcut(event, 'nextTab') || matchesShortcut(event, 'previousTab')) {
        event.preventDefault();
        const next = (index + (matchesShortcut(event, 'previousTab') ? -1 : 1) + tabIds.length) % tabIds.length;
        activateTab(tabIds[next]);
      } else if (number || matchesShortcut(event, 'lastTab')) {
        event.preventDefault();
        const target = number ? tabIds[number - 1] : tabIds[tabIds.length - 1];
        if (target) {
          activateTab(target);
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [tabIds, activeId]);

  return (
    <div
      className={native?.platform === 'darwin' ? `${styles.bar} ${styles.mac}` : styles.bar}
      role="tablist"
      onDragOver={(event) => dragging && event.preventDefault()}
      onDrop={(event) => event.preventDefault()}
    >
      <Icoonknop
        maat={32}
        onClick={toggleSidebar}
        aria-label={sidebarOpen ? 'Zijbalk inklappen' : 'Zijbalk uitklappen'}
        title={`${sidebarOpen ? 'Zijbalk inklappen' : 'Zijbalk uitklappen'} (${sidebarKey})`}
      >
        {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
      </Icoonknop>
      {tabIds.map((id) => (
        <TabButton key={id} id={id} active={id === activeId} />
      ))}
      <Icoonknop
        maat={32}
        stijl="getint"
        aria-label="Nieuw tabblad"
        title={`Nieuw tabblad (${newTabKey})`}
        onClick={() => setPicker('new')}
      >
        <Plus size={16} />
      </Icoonknop>
      <span className={styles.spacer} />
      <Icoonknop
        maat={32}
        onClick={toggleTerminalPanel}
        aria-label="Terminal"
        title="Terminal openen (een nieuwe met + in het terminalpaneel)"
      >
        <SquareTerminal size={16} />
      </Icoonknop>
      <SettingsButton />
    </div>
  );
};

export default TabBar;
