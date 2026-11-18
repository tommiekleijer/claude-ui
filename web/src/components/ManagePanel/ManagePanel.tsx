import { LogIn, RefreshCw, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { insertInComposer, openTerminal, refreshMcpAfterLogin, send, setManageOpen, useApp, useStore } from '../../store';
import Dialog from '../ui/Dialog';
import Pill, { PillTone } from '../ui/Pill';
import { Icoonknop, Knop, Schakelaar, Segmentbalk, Zoekveld } from '../../vertex';
import styles from './ManagePanel.module.scss';

type Section = 'mcp' | 'commands' | 'agents';

const MCP_TONE: Record<string, PillTone> = {
  connected: 'done',
  pending: 'running',
  failed: 'error',
  'needs-auth': 'error',
  disabled: 'idle',
};
const MCP_LABEL: Record<string, string> = {
  connected: 'verbonden',
  pending: 'verbinden…',
  failed: 'mislukt',
  'needs-auth': 'inloggen nodig',
  disabled: 'uit',
};

const ManagePanel = () => {
  const manage = useStore((s) => s.manage);
  const terminalAvailable = useApp((s) => s.terminalAvailable);

  // claude.ai-connectors log je in op claude.ai; andere servers via /mcp in Claude Code (de ingebouwde terminal).
  const login = (name: string) => {
    if (name.startsWith('claude.ai ')) {
      window.open('https://claude.ai/settings/connectors', '_blank');
      return;
    }
    setManageOpen(false);
    openTerminal(['/mcp'], refreshMcpAfterLogin);
  };
  const [section, setSection] = useState<Section>('mcp');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    send({ type: 'manage' });
  }, []);

  const term = filter.trim().toLowerCase();
  const match = (i: { name: string; description: string }) =>
    !term || i.name.toLowerCase().includes(term) || i.description.toLowerCase().includes(term);

  const useCommand = (name: string) => {
    insertInComposer(`/${name} `);
    setManageOpen(false);
  };

  return (
    <Dialog title="Beheer" onClose={() => setManageOpen(false)}>
      <div className={styles.tabs}>
        <Segmentbalk
          label="Onderdeel"
          opties={[
            { waarde: 'mcp', label: 'MCP-servers' },
            { waarde: 'commands', label: 'Commands & skills' },
            { waarde: 'agents', label: 'Agents' },
          ]}
          waarde={section}
          onKies={(waarde) => setSection(waarde as Section)}
        />
        <Icoonknop maat={32} aria-label="Vernieuwen" title="Vernieuwen" onClick={() => send({ type: 'manage' })}>
          <RefreshCw size={16} />
        </Icoonknop>
      </div>

      {!manage && <p className={styles.empty}>Laden… (Claude Code wordt gestart)</p>}

      {manage && section === 'mcp' && (
        <ul className={styles.list}>
          {manage.mcp.length === 0 && <li className={styles.empty}>Geen MCP-servers geconfigureerd.</li>}
          {manage.mcp.map((server) => (
            <li key={server.name} className={styles.item}>
              <div className={styles.itemMain}>
                <span className={styles.name}>{server.name}</span>
                <span className={styles.desc}>
                  {[server.scope, server.status === 'connected' ? `${server.tools} tools` : ''].filter(Boolean).join(' · ')}
                  {server.error && ` · ${server.error}`}
                </span>
              </div>
              <Pill tone={MCP_TONE[server.status] ?? 'idle'}>{MCP_LABEL[server.status] ?? server.status}</Pill>
              {server.status === 'needs-auth' && (server.name.startsWith('claude.ai ') || terminalAvailable) && (
                <Knop
                  variant="tertiair"
                  maat="s"
                  icoon={<LogIn size={14} />}
                  onClick={() => login(server.name)}
                  title={server.name.startsWith('claude.ai ') ? 'Opent claude.ai om de connector te koppelen' : 'Opent /mcp in Claude Code'}
                >
                  Inloggen
                </Knop>
              )}
              {server.status !== 'disabled' && (
                <Icoonknop
                  maat={32}
                  aria-label="Opnieuw verbinden"
                  title="Opnieuw verbinden"
                  onClick={() => send({ type: 'mcp_reconnect', name: server.name })}
                >
                  <RefreshCw size={14} />
                </Icoonknop>
              )}
              <Schakelaar
                aan={server.status !== 'disabled'}
                aria-label={server.status === 'disabled' ? 'Aanzetten' : 'Uitzetten'}
                title={server.status === 'disabled' ? 'Aanzetten' : 'Uitzetten'}
                onChange={() => send({ type: 'mcp_toggle', name: server.name, enabled: server.status === 'disabled' })}
              />
            </li>
          ))}
        </ul>
      )}

      {manage && section !== 'mcp' && (
        <>
          <Zoekveld
            className={styles.filter}
            icoon={<Search size={16} />}
            label="Filteren"
            placeholder="Filteren"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <ul className={styles.list}>
            {(section === 'commands' ? manage.commands : manage.agents).filter(match).map((item) => (
              <li key={item.name} className={styles.item}>
                <div className={styles.itemMain}>
                  <span className={styles.name}>{section === 'commands' ? `/${item.name}` : item.name}</span>
                  <span className={styles.desc}>{item.description}</span>
                </div>
                {section === 'commands' && (
                  <Knop variant="tertiair" maat="s" onClick={() => useCommand(item.name)}>
                    Gebruiken
                  </Knop>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Dialog>
  );
};

export default ManagePanel;
