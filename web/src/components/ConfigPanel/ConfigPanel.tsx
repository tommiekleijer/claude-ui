import { Trash2 } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import type { MemoryFile, ScopeSettings } from '../../../../shared/protocol';
import { closeConfig, send, useApp } from '../../store';
import { Icoonknop, Knop, Segmentbalk } from '../../vertex';
import Dialog from '../ui/Dialog';
import styles from './ConfigPanel.module.scss';

type Section = 'memory' | 'permissions' | 'hooks';
type List = 'allow' | 'ask' | 'deny';

const SCOPE_LABEL: Record<ScopeSettings['scope'], string> = {
  user: 'Gebruiker',
  project: 'Project',
  local: 'Project, lokaal',
};
const LIST_LABEL: Record<List, string> = { allow: 'Toestaan', ask: 'Vragen', deny: 'Weigeren' };

const Memory = ({ files }: { files: MemoryFile[] }) => {
  const [index, setIndex] = useState(0);
  const file = files[index];
  const [draft, setDraft] = useState(file?.content ?? '');

  useEffect(() => {
    setDraft(file?.content ?? '');
  }, [file?.path, file?.content]);

  if (!file) {
    return null;
  }
  return (
    <>
      <p className={styles.note}>Claude leest deze bestanden aan het begin van elke sessie. Wijzigingen gelden vanaf een nieuwe chat.</p>
      <Segmentbalk
        label="Bestand"
        opties={files.map((f, i) => ({ waarde: String(i), label: f.label.split(' (')[0] }))}
        waarde={String(index)}
        onKies={(waarde) => setIndex(Number(waarde))}
      />
      <p className={styles.note}>
        <span className={styles.path}>{file.path}</span>
        {!file.exists && ' — bestaat nog niet; opslaan maakt het aan.'}
      </p>
      <textarea className={styles.editor} value={draft} spellCheck={false} onChange={(event) => setDraft(event.target.value)} />
      <div className={styles.actions}>
        <Knop
          variant="primair"
          maat="s"
          disabled={draft === file.content}
          onClick={() => send({ type: 'save_memory', path: file.path, content: draft })}
        >
          Opslaan
        </Knop>
      </div>
    </>
  );
};

const Rules = ({ scopes }: { scopes: ScopeSettings[] }) => {
  const [scope, setScope] = useState<ScopeSettings['scope']>('project');
  const [list, setList] = useState<List>('allow');
  const [rule, setRule] = useState('');

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (rule.trim()) {
      send({ type: 'permission_rule', scope, list, rule, remove: false });
      setRule('');
    }
  };

  return (
    <>
      <p className={styles.note}>Regels zoals Bash(npm run test:*) of Read(./.env). Wijzigingen gelden vanaf een nieuwe chat.</p>
      <div className={styles.list}>
        {scopes.map((s) => (
          <div key={s.scope} className={styles.scope}>
            <h4 className={styles.scopeTitle}>
              {SCOPE_LABEL[s.scope]} <span className={styles.path}>{s.path}</span>
            </h4>
            {s.error && <p className={`${styles.note} ${styles.error}`}>{s.error}</p>}
            {(['allow', 'ask', 'deny'] as List[]).flatMap((l) =>
              s[l].map((r) => (
                <div key={`${l}-${r}`} className={styles.rule}>
                  <span>{r}</span>
                  <span className={styles.path}>{LIST_LABEL[l]}</span>
                  <Icoonknop
                    maat={32}
                    aria-label="Regel verwijderen"
                    title="Regel verwijderen"
                    onClick={() => send({ type: 'permission_rule', scope: s.scope, list: l, rule: r, remove: true })}
                  >
                    <Trash2 size={14} />
                  </Icoonknop>
                </div>
              )),
            )}
            {s.allow.length + s.ask.length + s.deny.length === 0 && !s.error && <p className={styles.note}>Geen regels.</p>}
          </div>
        ))}
      </div>
      <form className={styles.add} onSubmit={add}>
        <select value={scope} onChange={(event) => setScope(event.target.value as ScopeSettings['scope'])} aria-label="Waar opslaan">
          {Object.entries(SCOPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select value={list} onChange={(event) => setList(event.target.value as List)} aria-label="Soort regel">
          {Object.entries(LIST_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input value={rule} onChange={(event) => setRule(event.target.value)} placeholder="Bash(git status)" aria-label="Regel" />
        <Knop variant="tertiair" maat="s" type="submit">
          Toevoegen
        </Knop>
      </form>
    </>
  );
};

const Hooks = ({ scopes }: { scopes: ScopeSettings[] }) => (
  <>
    <p className={styles.note}>Alleen lezen. Pas hooks aan in het settings.json-bestand van het genoemde niveau.</p>
    <div className={styles.list}>
      {scopes.map((s) => (
        <div key={s.scope} className={styles.scope}>
          <h4 className={styles.scopeTitle}>
            {SCOPE_LABEL[s.scope]} <span className={styles.path}>{s.path}</span>
          </h4>
          {s.error && <p className={`${styles.note} ${styles.error}`}>{s.error}</p>}
          {s.hooks.map((h, i) => (
            <div key={i} className={styles.rule}>
              <span>
                {h.event}
                {h.matcher && ` [${h.matcher}]`}: {h.command}
              </span>
            </div>
          ))}
          {s.hooks.length === 0 && !s.error && <p className={styles.note}>Geen hooks.</p>}
        </div>
      ))}
    </div>
  </>
);

const ConfigPanel = () => {
  const open = useApp((s) => s.configOpen);
  const config = useApp((s) => s.config);
  const [section, setSection] = useState<Section>(open ?? 'memory');

  return (
    <Dialog title="Instellingen van Claude Code" onClose={closeConfig} wide>
      <Segmentbalk
        label="Onderdeel"
        opties={[
          { waarde: 'memory', label: 'Geheugen' },
          { waarde: 'permissions', label: 'Toestemmingen' },
          { waarde: 'hooks', label: 'Hooks' },
        ]}
        waarde={section}
        onKies={(waarde) => setSection(waarde as Section)}
      />
      {!config && <p className={styles.note}>Laden…</p>}
      {config && section === 'memory' && <Memory files={config.memory} />}
      {config && section === 'permissions' && <Rules scopes={config.scopes} />}
      {config && section === 'hooks' && <Hooks scopes={config.scopes} />}
    </Dialog>
  );
};

export default ConfigPanel;
