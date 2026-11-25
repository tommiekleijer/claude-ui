import { FolderGit2, MessageSquare, Plus, Search, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { newSessionTab, openSession, setManageOpen, setPicker, useStore } from '../../store';
import { Icoonknop, Segmentbalk, Zoekveld } from '../../vertex';
import styles from './SessionSidebar.module.scss';

const formatDate = (ms: number) => {
  const date = new Date(ms);
  return new Date().toDateString() === date.toDateString()
    ? date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
};

const SessionSidebar = () => {
  const cwd = useStore((s) => s.cwd);
  const root = useStore((s) => s.root);
  const sessions = useStore((s) => s.sessions);
  const sessionId = useStore((s) => s.sessionId);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'project' | 'all'>('project');
  const currentRepo = cwd ? (root && cwd.startsWith(`${root}/`) ? cwd.slice(root.length + 1) : (cwd.split('/').pop() ?? cwd)) : null;
  const inProject = (dir: string) => dir === cwd;
  const showAll = scope === 'all' || !currentRepo;

  const term = search.trim().toLowerCase();
  const visible = sessions.filter(
    (s) =>
      (showAll || inProject(s.cwd)) &&
      (!term || s.title.toLowerCase().includes(term) || s.repo.toLowerCase().includes(term)),
  );

  return (
    <nav className={styles.sidebar} aria-label="Sessies">
      <div className={styles.top}>
        <button type="button" className={styles.project} onClick={() => setPicker('open')} title={cwd ?? ''}>
          <FolderGit2 size={16} />
          <span className={styles.projectName}>{currentRepo ?? 'Kies een project'}</span>
        </button>
        <Icoonknop maat={32} onClick={newSessionTab} disabled={!cwd} title="Nieuwe sessie" aria-label="Nieuwe sessie">
          <Plus size={16} />
        </Icoonknop>
        <Icoonknop
          maat={32}
          onClick={() => setManageOpen(true)}
          disabled={!cwd}
          title="Beheer: MCP-servers, commands en agents"
          aria-label="Beheer"
        >
          <Settings2 size={16} />
        </Icoonknop>
      </div>

      <div className={styles.tools}>
        <Segmentbalk
          vol
          label="Welke sessies"
          opties={[
            { waarde: 'project', label: 'Dit project' },
            { waarde: 'all', label: 'Alle repos' },
          ]}
          waarde={showAll ? 'all' : 'project'}
          // "Dit project" doet niets zonder project (was een uitgeschakelde knop).
          onKies={(waarde) => (waarde === 'all' || currentRepo) && setScope(waarde as 'project' | 'all')}
        />
        <Zoekveld
          icoon={<Search size={16} />}
          placeholder="Zoeken"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <ul className={styles.list}>
        {visible.length === 0 && <li className={styles.empty}>Geen sessies</li>}
        {visible.map((session) => (
          <li key={session.sessionId}>
            <button
              type="button"
              className={session.sessionId === sessionId ? `${styles.item} ${styles.active}` : styles.item}
              onClick={() => openSession(session)}
              title={`${session.title}\n${session.repo}${session.branch ? ` · ${session.branch}` : ''} · ${new Date(session.lastModified).toLocaleString('nl-NL')}`}
            >
              <MessageSquare size={14} className={styles.icon} />
              <span className={styles.title}>{session.title || 'Zonder titel'}</span>
              {showAll ? (
                <span className={styles.repo}>{session.repo}</span>
              ) : (
                <span className={styles.date}>{formatDate(session.lastModified)}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};

export default SessionSidebar;
