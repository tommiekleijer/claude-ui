import { ArrowUp, ChevronRight, Folder, FolderCog, FolderOpen, History, Lock, Search } from 'lucide-react';
import { KeyboardEvent, useEffect, useState } from 'react';
import { native } from '../../native';
import { chooseFolder, PickerMode, send, setPicker, useStore } from '../../store';
import Dialog from '../ui/Dialog';
import { Icoonknop, Knop, Zoekveld } from '../../vertex';
import styles from './ProjectPicker.module.scss';

const titles: Record<PickerMode, string> = { open: 'Project openen', new: 'Nieuwe chat', move: 'Chat verplaatsen' };

type Entry = { dir: string; name: string; kind: 'typed' | 'recent' | 'repo' | 'folder'; locked?: boolean };

const ProjectPicker = ({ mode }: { mode: PickerMode }) => {
  const recent = useStore((s) => s.recent);
  const dirs = useStore((s) => s.dirs);
  const folder = useStore((s) => s.folder);
  const cwd = useStore((s) => s.cwd);
  const connected = useStore((s) => s.connected);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const [editingRoot, setEditingRoot] = useState<string | null>(null);

  useEffect(() => {
    if (connected) {
      send({ type: 'list_dirs' });
      send(mode === 'move' && cwd ? { type: 'list_folder', path: cwd } : { type: 'list_folder' });
    }
  }, [connected]);

  const root = dirs?.path ?? null;
  const term = search.trim().toLowerCase();
  const typedPath = /^(\/|~)/.test(search.trim()) ? search.trim() : null;
  const matches = (name: string) => name.toLowerCase().includes(term);
  const label = (dir: string) => (root && dir.startsWith(`${root}/`) ? dir.slice(root.length + 1) : dir.replace(/^\/home\/[^/]+/, '~'));
  const recentEntries: Entry[] = recent.map((dir) => ({ dir, name: label(dir), kind: 'recent' as const })).filter((e) => !typedPath && matches(e.name));
  const recentDirs = new Set(recent);
  const repoEntries: Entry[] = (dirs?.dirs ?? [])
    .map((name) => ({ dir: `${root}/${name}`, name, kind: 'repo' as const }))
    .filter((e) => !typedPath && matches(e.name) && !recentDirs.has(e.dir));
  const folderEntries: Entry[] = folder
    ? folder.dirs.map(({ name, readable }) => ({ dir: `${folder.path.replace(/\/$/, '')}/${name}`, name, kind: 'folder' as const, locked: !readable }))
    : [];
  const entries: Entry[] = term
    ? [...(typedPath ? [{ dir: typedPath, name: typedPath, kind: 'typed' as const }] : []), ...recentEntries, ...repoEntries]
    : [...recentEntries, ...folderEntries];
  const choose = (dir: string) => chooseFolder(mode, dir);
  const close = cwd || mode !== 'open' ? () => setPicker(null) : undefined;

  const browse = (path: string) => {
    send({ type: 'list_folder', path });
    setActive(0);
  };

  const select = (entry: Entry) => {
    if (entry.locked) {
      return;
    }
    if (entry.kind === 'folder') {
      browse(entry.dir);
    } else {
      choose(entry.dir);
    }
  };

  const openOther = async () => {
    if (native) {
      const picked = await native.pickFolder('Map openen');
      if (picked) {
        choose(picked);
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
      select(entries[active]);
    }
  };

  const renderEntry = (entry: Entry, index: number) => (
    <li key={`${entry.kind}-${entry.dir}`}>
      <button
        type="button"
        className={[styles.item, index === active && !entry.locked && styles.active, entry.locked && styles.locked].filter(Boolean).join(' ')}
        aria-disabled={entry.locked}
        title={entry.locked ? 'Geen toegang tot deze map' : undefined}
        onMouseEnter={() => setActive(index)}
        onClick={() => select(entry)}
      >
        {entry.locked ? <Lock size={16} /> : entry.kind === 'recent' ? <History size={16} className={styles.recent} /> : <Folder size={16} />}
        <span>{entry.kind === 'typed' ? `Openen: ${entry.name}` : entry.name}</span>
        {entry.kind === 'folder' && !entry.locked && <ChevronRight size={16} className={styles.chevron} />}
      </button>
    </li>
  );

  return (
    <Dialog
      title={titles[mode]}
      onClose={close}
      footer={
        <>
          {close && (
            <Knop variant="tertiair" maat="s" onClick={close}>
              Annuleren
            </Knop>
          )}
          <Knop variant="primair" maat="s" disabled={!folder || Boolean(folder.error)} title={folder?.path} onClick={() => folder && choose(folder.path)}>
            Deze map kiezen
          </Knop>
        </>
      }
    >
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
        {term ? (
          <>
            {entries.map(renderEntry)}
            {entries.length === 0 && <li className={styles.empty}>Geen map gevonden</li>}
          </>
        ) : (
          <>
            {recentEntries.length > 0 && <li className={styles.section}>Recente mappen</li>}
            {recentEntries.map(renderEntry)}
            <li className={styles.browse}>
              <Icoonknop
                maat={32}
                aria-label="Bovenliggende map"
                title="Bovenliggende map"
                disabled={!folder?.parent}
                onClick={() => folder?.parent && browse(folder.parent)}
              >
                <ArrowUp size={16} />
              </Icoonknop>
              <span className={styles.browsePath} title={folder?.path}>
                {folder?.path ?? '…'}
              </span>
            </li>
            {folderEntries.map((entry, index) => renderEntry(entry, recentEntries.length + index))}
            {folder?.error && <li className={styles.error}>{folder.error}</li>}
            {folder && !folder.error && folderEntries.length === 0 && <li className={styles.empty}>Geen submappen</li>}
          </>
        )}
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
