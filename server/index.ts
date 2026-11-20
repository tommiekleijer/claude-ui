import fastifyStatic from '@fastify/static';
import { getSessionMessages, getSubagentMessages, listSubagents, renameSession } from '@anthropic-ai/claude-agent-sdk';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientEvent, ServerEvent, Settings } from '../shared/protocol.js';
import { changeRule, readConfig, saveMemory } from './config.js';
import { historyItems, lastContextTokens } from './mapMessages.js';
import {
  addRecent,
  allSessions,
  availableModels,
  getRoot,
  isDirectory,
  listDirs,
  listFolder,
  moveSession,
  readRecent,
  detectDuplicateConnectors,
  saveSettings,
  saveUi,
  savedUi,
  savedContextMax,
  saveTabs,
  savedTabs,
  savedSettings,
  setRoot,
} from './projects.js';
import { ClaudeSession, lastLimits, setLastLimits } from './session.js';
import { fetchUsage, limitsFromReport } from './usage.js';
import { authLogout, authStatus, cancelLogin, runShell, sendLoginCode, startLogin, terminalAvailable, Terminals } from './terminal.js';

// Usage via /usage (geen tokens): direct bij het starten, zodat de statusbalk meteen gevuld is, daarna elke 5 minuten en bij
// het openen van het Usage-venster. Tijdens een chat komen de limieten live binnen via rate_limit_event.
const connections = new Set<(event: ServerEvent) => void>();
const refreshUsage = async () => {
  const report = await fetchUsage().catch(() => null);
  if (report) {
    setLastLimits(limitsFromReport(report));
    for (const send of connections) {
      send({ type: 'usage_report', report });
      send({ type: 'limits', limits: lastLimits });
    }
  }
  return report;
};

// Nooit via een API-key afrekenen: de SDK valt dan terug op het abonnement van `claude login`.
const apiKeyPresent = Boolean(process.env.ANTHROPIC_API_KEY);
delete process.env.ANTHROPIC_API_KEY;

const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 4317);
const STARTED_BY_APP = process.env.CLAUDE_UI_PARENT === '1';
// Alleen voor deze backend bedoeld: niet doorgeven aan Claude's tools en de terminal (anders krijgt bv. `make up` PORT=0).
delete process.env.PORT;
delete process.env.ELECTRON_RUN_AS_NODE;
delete process.env.CLAUDE_UI_PARENT;

// Pas na het opschonen van process.env: het hulpproces neemt die env over en blijft de hele levensduur draaien.
void refreshUsage();
void detectDuplicateConnectors().catch(() => undefined);
setInterval(() => void refreshUsage(), 5 * 60 * 1000);

const DEV = process.env.CLAUDE_UI_DEV === '1';
const VITE_PORT = Number(process.env.VITE_PORT ?? 5173);

const allowedOrigins = new Set<string>();
const allowPort = (port: number) => {
  allowedOrigins.add(`http://127.0.0.1:${port}`);
  allowedOrigins.add(`http://localhost:${port}`);
};
if (DEV) {
  allowPort(VITE_PORT);
}

const app = Fastify();
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web');
if (!DEV && existsSync(webDir)) {
  await app.register(fastifyStatic, { root: webDir });
}
app.get('/health', async () => ({ ok: true }));

const handleConnection = async (ws: WebSocket) => {
  let cwd: string | null = null;
  let resumeId: string | null = null;
  let session: ClaudeSession | null = null;
  const settings: Settings = { ...savedSettings(), mode: null };

  const send = (event: ServerEvent) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  };

  const sendSessions = async () => send({ type: 'sessions', sessions: await allSessions() });

  const openProject = async (input: string) => {
    const dir = path.resolve(input.trim().replace(/^~(?=$|\/)/, homedir()));
    if (!(await isDirectory(dir))) {
      send({ type: 'error', message: `Map bestaat niet: ${dir}` });
      return false;
    }
    closeSession();
    cwd = dir;
    resumeId = null;
    send({ type: 'project', cwd, recent: await addRecent(cwd) });
    return true;
  };

  // Start de Claude-sessie als die er nog niet is (ook zonder bericht, bv. voor de MCP-status).
  const ensureSession = () => {
    if (!cwd) {
      send({ type: 'error', message: 'Kies eerst een project.' });
      return null;
    }
    if (!session) {
      const current: ClaudeSession = new ClaudeSession(cwd, resumeId, settings, send, () => {
        resumeId = current.sessionId;
        void sendSessions();
      });
      session = current;
    }
    return session;
  };

  const terminals = new Terminals(send);

  const closeSession = () => {
    session?.close();
    session = null;
  };

  const resumeSession = async (sessionId: string, dir: string) => {
    closeSession();
    resumeId = sessionId;
    const messages = await getSessionMessages(sessionId, { dir });
    send({ type: 'history', sessionId, items: historyItems(messages) });
    const tokens = lastContextTokens(messages);
    // Zonder bekend vensterformaat: meer dan 200k tokens kan alleen in een venster van 1M.
    const max = Math.max(savedContextMax() ?? 0, tokens > 200_000 ? 1_000_000 : 200_000);
    if (tokens) {
      const percentage = Math.min(100, Math.round((tokens / max) * 100));
      send({ type: 'context', percentage, totalTokens: tokens, maxTokens: max });
    }
  };

  const handle = async (event: ClientEvent) => {
    switch (event.type) {
      case 'set_root':
        await setRoot(event.path);
        send({ type: 'root', root: getRoot(), recent: await readRecent() });
        send({ type: 'dirs', ...(await listDirs()) });
        send({ type: 'folder', ...(await listFolder(getRoot())) });
        await sendSessions();
        return;
      case 'list_dirs':
        send({ type: 'dirs', ...(await listDirs()) });
        return;
      case 'list_folder':
        send({ type: 'folder', ...(await listFolder(event.path ?? getRoot())) });
        return;
      case 'open_project':
        await openProject(event.cwd);
        return;
      case 'new_session':
        closeSession();
        resumeId = null;
        return;
      case 'resume_session':
        if (event.cwd !== cwd && !(await openProject(event.cwd))) {
          return;
        }
        await resumeSession(event.sessionId, event.cwd);
        return;
      case 'move_session':
        if (!(await openProject(event.cwd))) {
          return;
        }
        await moveSession(event.sessionId, cwd as string);
        await resumeSession(event.sessionId, cwd as string);
        await sendSessions();
        return;
      case 'rename_session':
        await renameSession(event.sessionId, event.title);
        if (session?.sessionId === event.sessionId) {
          await session.rename(event.title);
        }
        await sendSessions();
        return;
      case 'send':
        await ensureSession()?.push(event.text, event.attachments, event.force);
        return;
      case 'manage': {
        const current = ensureSession();
        if (current) {
          send({ type: 'manage', ...(await current.manage()) });
        }
        return;
      }
      case 'config':
      case 'save_memory':
      case 'permission_rule':
        if (!cwd) {
          send({ type: 'error', message: 'Kies eerst een project.' });
          return;
        }
        try {
          if (event.type === 'save_memory') {
            await saveMemory(cwd, event.path, event.content);
          } else if (event.type === 'permission_rule') {
            await changeRule(cwd, event.scope, event.list, event.rule.trim(), event.remove);
          }
        } catch (error) {
          send({ type: 'error', message: (error as Error).message });
        }
        send({ type: 'config', ...(await readConfig(cwd)) });
        return;
      case 'mcp_toggle':
        await ensureSession()?.toggleMcp(event.name, event.enabled);
        send({ type: 'manage', ...(await (session as ClaudeSession).manage()) });
        return;
      case 'mcp_reconnect':
        await ensureSession()?.reconnectMcp(event.name);
        send({ type: 'manage', ...(await (session as ClaudeSession).manage()) });
        return;
      case 'subagent': {
        // Zoek de subagent die door deze Agent-tool is gestart en stuur zijn gesprek.
        const live = session?.subagentChat(event.toolUseId);
        if (live) {
          send({ type: 'subagent', toolUseId: event.toolUseId, items: live, live: true });
          return;
        }
        const sessionId = session?.sessionId ?? resumeId;
        if (!cwd || !sessionId) {
          return;
        }
        for (const agentId of await listSubagents(sessionId, { dir: cwd })) {
          const messages = await getSubagentMessages(sessionId, agentId, { dir: cwd });
          if (messages[0]?.parent_tool_use_id === event.toolUseId) {
            send({ type: 'subagent', toolUseId: event.toolUseId, items: historyItems(messages, true) });
            return;
          }
        }
        send({ type: 'subagent', toolUseId: event.toolUseId, items: [] });
        return;
      }
      case 'usage': {
        const report = await refreshUsage();
        if (!report) {
          send({ type: 'error', message: 'Usage ophalen mislukt.' });
        }
        return;
      }
      case 'auth_status':
        send({ type: 'auth_status', status: await authStatus() });
        return;
      case 'auth_login':
        startLogin(send, event);
        return;
      case 'auth_code':
        sendLoginCode(event.code.trim());
        return;
      case 'auth_cancel':
        cancelLogin();
        return;
      case 'auth_logout':
        await authLogout();
        send({ type: 'auth_status', status: await authStatus() });
        return;
      case 'stop_task':
        await session?.stopTask(event.taskId);
        return;
      case 'task_output':
        if (session) {
          send({ type: 'task_output', taskId: event.taskId, output: await session.taskOutput(event.taskId) });
        }
        return;
      case 'set_model':
        settings.model = event.model;
        await session?.setModel(event.model);
        await saveSettings(settings);
        send({ type: 'settings', ...settings });
        return;
      case 'set_effort':
        settings.effort = event.effort;
        await session?.setEffort(event.effort);
        await saveSettings(settings);
        send({ type: 'settings', ...settings });
        return;
      case 'set_mode':
        settings.mode = event.mode;
        await session?.setMode(event.mode);
        send({ type: 'settings', ...settings });
        return;
      case 'save_ui':
        await saveUi({ opacity: event.opacity, sidebarOpen: event.sidebarOpen, dockWidth: event.dockWidth, dockSide: event.dockSide, thema: event.thema, meldingen: event.meldingen, accent: event.accent, speechLanguage: event.speechLanguage, speechModel: event.speechModel, promptSuggestions: event.promptSuggestions, shortcuts: event.shortcuts });
        return;
      case 'question_response':
        session?.answerQuestion(event.id, event.answers, event.chat);
        return;
      case 'shell': {
        if (!cwd) {
          send({ type: 'error', message: 'Kies eerst een project.' });
          return;
        }
        const result = await runShell(cwd, event.command);
        ensureSession()?.addShellContext(event.command, result.output, result.exitCode);
        send({ type: 'shell_result', id: event.id, command: event.command, ...result });
        return;
      }
      case 'pty_start':
        terminals.start(event.id, cwd ?? homedir(), event.cols, event.rows, event.args, event.shell);
        return;
      case 'read_image': {
        // Afbeelding voor in de chat (Ctrl+klik op een pad); relatief aan de projectmap.
        const filePath = path.resolve(cwd ?? homedir(), event.path.replace(/^~(?=$|\/)/, homedir()).replace(/:\d+(:\d+)?$/, ''));
        const type = IMAGE_TYPES[path.extname(filePath).toLowerCase()];
        const data = type ? await readFile(filePath).catch(() => null) : null;
        send({
          type: 'image',
          id: event.id,
          path: filePath,
          dataUrl: data && data.length <= 15 * 1024 * 1024 ? `data:${type};base64,${data.toString('base64')}` : null,
          error: !type ? 'Geen afbeelding' : !data ? 'Bestand niet gevonden' : data.length > 15 * 1024 * 1024 ? 'Afbeelding te groot' : undefined,
        });
        return;
      }
      case 'pty_input':
        terminals.input(event.id, event.data);
        return;
      case 'pty_resize':
        terminals.resize(event.id, event.cols, event.rows);
        return;
      case 'pty_kill':
        terminals.kill(event.id);
        return;
      case 'save_tabs':
        await saveTabs({ tabs: event.tabs, active: event.active });
        return;
      case 'interrupt':
        await session?.interrupt();
        return;
      case 'permission_response':
        session?.respond(event.id, event.decision);
        return;
    }
  };

  ws.on('message', (raw) => {
    handle(JSON.parse(String(raw)) as ClientEvent).catch((error: unknown) =>
      send({ type: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
  });
  connections.add(send);
  ws.on('close', () => connections.delete(send));
  ws.on('close', closeSession);
  ws.on('close', () => terminals.closeAll());
  ws.on('close', () => cancelLogin(send));

  send({
    type: 'hello',
    apiKeyPresent,
    recent: await readRecent(),
    root: getRoot(),
    models: await availableModels(),
    limits: lastLimits,
    tabs: savedTabs(),
    ui: savedUi(),
    terminal: terminalAvailable,
  });
  send({ type: 'settings', ...settings });
  await sendSessions();
};

const wss = new WebSocketServer({ noServer: true, maxPayload: 120 * 1024 * 1024 });
app.server.on('upgrade', (request, socket, head) => {
  const origin = request.headers.origin ?? '';
  if (request.url !== '/ws' || !allowedOrigins.has(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (ws) => void handleConnection(ws));
});

await app.listen({ host: HOST, port: PORT });
const address = app.server.address();
const port = typeof address === 'object' && address ? address.port : PORT;
allowPort(port);
// De Electron-app leest deze regel om te weten waar hij moet verbinden (PORT=0 kiest een vrije poort).
console.log(`CLAUDE_UI_PORT=${port}`);
console.log(`claude-ui luistert op http://${HOST}:${port}${apiKeyPresent ? ' (ANTHROPIC_API_KEY genegeerd)' : ''}`);

// Gestart door de app: stoppen zodra de app (en daarmee onze stdin) weg is, ook via wsl.exe.
if (STARTED_BY_APP) {
  process.stdin.resume();
  process.stdin.on('close', () => process.exit(0));
  process.stdin.on('end', () => process.exit(0));
}
