import { Folder, FolderCog, History, Search } from 'lucide-react';
import { KeyboardEvent, useEffect, useState } from 'react';
import { native } from '../../native';
import { openProject, send, setPickerOpen, useStore } from '../../store';
import Dialog from '../ui/Dialog';
import { Knop, Zoekveld } from '../../vertex';
import styles from './ProjectPicker.module.scss';

const ProjectPicker = () => {
  const recent = useStore((s) => s.recent);
  const dirs = useStore((s) => s.dirs);
  const cwd = useStore((s) => s.cwd);
  const connected = useStore((s) => s.connected);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const [editingRoot, setEditingRoot] = useState<string | null>(null);

  useEffect(() => {
    if (connected) {
      send({ type: 'list_dirs' });
    }
  }, [connected]);

  const term = search.trim().toLowerCase();
  const matches = (name: string) => name.toLowerCase().includes(term);
  const recentNames = recent.map((dir) => dir.split('/').pop() ?? dir).filter(matches);
  const repos = (dirs?.dirs ?? []).filter((name) => matches(name) && !recentNames.includes(name));
  const entries = [...recentNames.map((name) => ({ name, recent: true })), ...repos.map((name) => ({ name, recent: false }))];
  const open = (name: string) => dirs && openProject(`${dirs.path}/${name}`);
  const close = cwd ? () => setPickerOpen(false) : undefined;

  const changeRoot = async () => {
    if (native) {
      const picked = await native.pickFolder();
      if (picked) {
        send({ type: 'set_root', path: picked });
      }
      return;
    }
    setEditingRoot(dirs?.path ?? '');
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, entries.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && entries[active]) {
      open(entries[active].name);
    }
  };

  return (
    <Dialog title="Project openen" onClose={close}>
      <div className={styles.root}>
        <FolderCog size={16} />
        {editingRoot === null ? (
          <>
            <span className={styles.rootPath} title="Standaardmap: projecten en chats binnen deze map">
              {dirs?.path ?? '…'}
            </span>
            <Knop variant="tertiair" maat="s" onClick={() => void changeRoot()}>
              Wijzigen
            </Knop>
          </>
        ) : (
          <form
            className={styles.rootForm}
            onSubmit={(event) => {
              event.preventDefault();
              send({ type: 'set_root', path: editingRoot });
              setEditingRoot(null);
            }}
          >
            <input autoFocus value={editingRoot} onChange={(event) => setEditingRoot(event.target.value)} />
            <Knop variant="tertiair" maat="s" type="submit">
              Opslaan
            </Knop>
          </form>
        )}
      </div>
      <Zoekveld
        icoon={<Search size={16} />}
        autoFocus
        placeholder="Zoek een project"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setActive(0);
        }}
        onKeyDown={handleKeyDown}
      />
      <ul className={styles.list}>
        {entries.map((entry, index) => (
          <li key={`${entry.recent}-${entry.name}`}>
            <button
              type="button"
              className={index === active ? `${styles.item} ${styles.active}` : styles.item}
              onMouseEnter={() => setActive(index)}
              onClick={() => open(entry.name)}
            >
              {entry.recent ? <History size={16} className={styles.recent} /> : <Folder size={16} />}
              <span>{entry.name}</span>
            </button>
          </li>
        ))}
        {entries.length === 0 && <li className={styles.empty}>Geen map gevonden</li>}
      </ul>
    </Dialog>
  );
};

export default ProjectPicker;
