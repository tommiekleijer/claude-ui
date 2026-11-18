import { Folder, FolderCog, FolderOpen, History, Search } from 'lucide-react';
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

  const root = dirs?.path ?? null;
  const term = search.trim().toLowerCase();
  const typedPath = /^(\/|~)/.test(search.trim()) ? search.trim() : null;
  const matches = (name: string) => name.toLowerCase().includes(term);
  const label = (dir: string) => (root && dir.startsWith(`${root}/`) ? dir.slice(root.length + 1) : dir.replace(/^\/home\/[^/]+/, '~'));
  const recentEntries = recent.map((dir) => ({ dir, name: label(dir), recent: true })).filter((e) => !typedPath && matches(e.name));
  const recentDirs = new Set(recent);
  const repoEntries = (dirs?.dirs ?? [])
    .map((name) => ({ dir: `${root}/${name}`, name, recent: false }))
    .filter((e) => !typedPath && matches(e.name) && !recentDirs.has(e.dir));
  const entries = [
    ...(typedPath ? [{ dir: typedPath, name: typedPath, recent: false, typed: true }] : []),
    ...recentEntries,
    ...repoEntries,
  ];
  const open = (dir: string) => openProject(dir);
  const close = cwd ? () => setPickerOpen(false) : undefined;

  const openOther = async () => {
    if (native) {
      const picked = await native.pickFolder('Map openen');
      if (picked) {
        openProject(picked);
      }
      return;
    }
    setSearch('/');
  };

  const changeRoot = async () => {
    if (native) {
      const picked = await native.pickFolder('Standaardmap kiezen');
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
      open(entries[active].dir);
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
        placeholder="Zoek een project of plak een pad (/…, ~/…)"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setActive(0);
        }}
        onKeyDown={handleKeyDown}
      />
      <ul className={styles.list}>
        {entries.map((entry, index) => (
          <li key={`${entry.recent}-${entry.dir}`}>
            <button
              type="button"
              className={index === active ? `${styles.item} ${styles.active}` : styles.item}
              onMouseEnter={() => setActive(index)}
              onClick={() => open(entry.dir)}
            >
              {entry.recent ? <History size={16} className={styles.recent} /> : <Folder size={16} />}
              <span>{'typed' in entry ? `Openen: ${entry.name}` : entry.name}</span>
            </button>
          </li>
        ))}
        {entries.length === 0 && <li className={styles.empty}>Geen map gevonden</li>}
      </ul>
      <div className={styles.other}>
        <Knop variant="tertiair" maat="s" onClick={() => void openOther()}>
          <FolderOpen size={16} /> Andere map openen…
        </Knop>
      </div>
    </Dialog>
  );
};

export default ProjectPicker;
