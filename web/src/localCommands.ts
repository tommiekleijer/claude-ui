import type { ChatItem } from '../../shared/protocol';
import { currentTab, notify, openConfig, openManage, openSettings, openTerminal, setSidebarOpen, useApp } from './store';

/** Commands die in Claude Code alleen in de terminal werken; de app handelt ze zelf af. */
export const localCommands = [
  { name: 'login', description: 'Inloggen met je Claude-account (opent de terminal)' },
  { name: 'logout', description: 'Uitloggen (opent de terminal)' },
  { name: 'plugin', description: 'Plugins beheren (opent de terminal)' },
  { name: 'help', description: 'Alle commands en skills' },
  { name: 'status', description: 'Model, modus, map en MCP-servers' },
  { name: 'memory', description: 'CLAUDE.md-bestanden bewerken' },
  { name: 'permissions', description: 'Toestemmingsregels (allow / ask / deny)' },
  { name: 'hooks', description: 'Geconfigureerde hooks bekijken' },
  { name: 'theme', description: 'Thema en accentkleur (Instellingen)' },
  { name: 'resume', description: 'Eerdere chat hervatten (zijbalk)' },
  { name: 'export', description: 'Deze chat opslaan als Markdown' },
  { name: 'bug', description: 'Een probleem melden bij Claude Code' },
  { name: 'release-notes', description: 'Wat is er nieuw in Claude Code' },
];

const toMarkdown = (items: ChatItem[]) =>
  items
    .flatMap((item) => {
      switch (item.kind) {
        case 'user':
          return [`## Jij\n\n${item.text}`];
        case 'assistant':
          return [`## Claude\n\n${item.text}`];
        case 'tool':
          return [`**${item.name}**\n\n\`\`\`json\n${JSON.stringify(item.input, null, 2)}\n\`\`\`${item.output ? `\n\n\`\`\`\n${item.output}\n\`\`\`` : ''}`];
        default:
          return [];
      }
    })
    .join('\n\n');

const exportChat = () => {
  const { items, cwd } = currentTab();
  if (items.length === 0) {
    notify('Er is nog niets om te exporteren.');
    return;
  }
  const name = `${(cwd?.split('/').pop() ?? 'chat').replace(/[^\w.-]+/g, '-')}-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}.md`;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([toMarkdown(items)], { type: 'text/markdown' }));
  link.download = name;
  link.click();
  URL.revokeObjectURL(link.href);
  notify(`Chat opgeslagen als ${name}`);
};

const status = () => {
  const { model, permissionMode, cwd, sessionId, apiKeySource, manage } = currentTab();
  const mcp = manage?.mcp ?? [];
  notify(
    [
      `Model: ${model ?? 'standaard'}`,
      `Modus: ${permissionMode ?? '-'}`,
      `Map: ${cwd ?? '-'}`,
      sessionId ? `Sessie: ${sessionId.slice(0, 8)}` : null,
      `Login: ${apiKeySource && apiKeySource !== 'none' ? `API-key (${apiKeySource})` : 'abonnement'}`,
      mcp.length ? `MCP: ${mcp.filter((m) => m.status === 'connected').length}/${mcp.length} verbonden` : null,
    ]
      .filter(Boolean)
      .join(' · '),
  );
};

const notApplicable: Record<string, string> = {
  vim: '/vim hoort bij de terminal; het invoerveld van de app heeft geen vim-modus.',
  'terminal-setup': '/terminal-setup is voor de terminal en niet nodig in de app.',
  ide: '/ide is niet van toepassing: de app is zelf de interface.',
  statusline: '/statusline is niet nodig: de statusbalk onderin toont model, context en limieten.',
  rewind: 'Terugdraaien (/rewind) kan nog niet in de app.',
  'add-dir': 'Extra mappen toevoegen (/add-dir) kan nog niet in de app.',
};

/** Commands die de echte Claude Code nodig hebben (inlogflow, plugin-beheer): in de ingebouwde terminal. */
const inTerminal = (command: string) => () => {
  if (useApp.getState().terminalAvailable) {
    openTerminal([command]);
  } else {
    notify(`${command} werkt alleen in de terminal, en de ingebouwde terminal is hier niet beschikbaar.`);
  }
};

const actions: Record<string, () => void> = {
  login: inTerminal('/login'),
  logout: inTerminal('/logout'),
  plugin: inTerminal('/plugin'),
  help: () => openManage('commands'),
  agents: () => openManage('agents'),
  status,
  memory: () => openConfig('memory'),
  permissions: () => openConfig('permissions'),
  hooks: () => openConfig('hooks'),
  theme: openSettings,
  resume: () => {
    setSidebarOpen(true);
    notify('Kies een eerdere chat in de zijbalk (Alle repos toont chats van elk project).');
  },
  export: exportChat,
  bug: () => window.open('https://github.com/anthropics/claude-code/issues', '_blank'),
  'release-notes': () => window.open('https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md', '_blank'),
};

/** Voert een /-command uit dat de app zelf afhandelt; false als het naar Claude Code moet. */
export const runLocalCommand = (text: string) => {
  const name = text.trim().match(/^\/([\w-]+)$/)?.[1];
  if (!name) {
    return false;
  }
  if (actions[name]) {
    actions[name]();
    return true;
  }
  if (notApplicable[name]) {
    notify(notApplicable[name]);
    return true;
  }
  return false;
};
