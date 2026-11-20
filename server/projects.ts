import { listSessions, query, type Query, type SDKResultMessage, type SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { EventEmitter, on } from 'node:events';
import { constants, existsSync, readFileSync } from 'node:fs';
import { access, appendFile, mkdir, readdir, readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { Effort, Limits, ModelOption, SavedTabs, SessionSummary, UiSettings } from '../shared/protocol.js';

const configDir = path.join(process.env.XDG_CONFIG_HOME ?? path.join(homedir(), '.config'), 'claude-ui');
const recentFile = path.join(configDir, 'recent.json');

const configFile = path.join(configDir, 'config.json');

// De standaardmap: projecten worden alleen hierbinnen geopend. Instelbaar in de app (config.json).
const defaultRoot = () => {
  const github = path.join(homedir(), 'GitHub');
  return existsSync(github) ? github : homedir();
};

type Config = { root?: string; model?: string | null; effort?: Effort | null; tabs?: SavedTabs; limits?: Limits; contextMax?: number; duplicateConnectors?: string[]; ui?: UiSettings };

const readConfig = (): Config => {
  try {
    return JSON.parse(readFileSync(configFile, 'utf8'));
  } catch {
    return {};
  }
};

let root = path.resolve(process.env.CLAUDE_UI_ROOT ?? readConfig().root ?? defaultRoot());

export const getRoot = () => root;

export const setRoot = async (dir: string) => {
  const resolved = path.resolve(dir.replace(/^~(?=$|\/)/, homedir()));
  if (!(await isDirectory(resolved))) {
    throw new Error(`Map bestaat niet: ${resolved}`);
  }
  root = resolved;
  await writeConfig({ root });
  return root;
};

const writeConfig = async (update: Config) => {
  await mkdir(configDir, { recursive: true });
  await writeFile(configFile, JSON.stringify({ ...readConfig(), ...update }, null, 2));
};

/** Laatst gekozen model en effort; null = de standaard van Claude Code. */
export const savedSettings = () => {
  const config = readConfig();
  return { model: config.model ?? null, effort: config.effort ?? null };
};

export const saveSettings = ({ model, effort }: { model: string | null; effort: Effort | null }) => writeConfig({ model, effort });

/** Open tabbladen, zodat de app ze na een herstart terugzet. */
/** Laatst bekende abonnementslimieten; de SDK meldt ze pas bij de eerste beurt, zo zijn ze direct zichtbaar. */
export const savedLimits = (): Limits => readConfig().limits ?? {};
export const saveLimits = (limits: Limits) => writeConfig({ limits });

/** Grootte van het contextvenster zoals Claude Code die laatst meldde; om ctx-% van een hervatte sessie te schatten. */
export const savedContextMax = () => readConfig().contextMax;
export const saveContextMax = (contextMax: number) => writeConfig({ contextMax });

/**
 * claude.ai-connectors met dezelfde URL als een MCP-server uit een plugin (bv. "claude.ai Slack" naast plugin:slack).
 * Claude Code houdt er één over; de CLI kiest de plugin, maar via de SDK wint de connector, en die is
 * daar vaak niet ingelogd. Door de connector uit te zetten werkt het in de app zoals in de terminal.
 */
export const duplicateConnectors = () => readConfig().duplicateConnectors ?? [];

const urlOf = (config: unknown) => (config as { url?: string } | undefined)?.url;

/** Bepaalt de dubbele connectors opnieuw (plugin-servers staan er alleen direct na het starten in). */
export const detectDuplicateConnectors = async () => {
  const { q } = helperQuery();
  await q.initializationResult();
  const pluginUrls = new Set(
    (await q.mcpServerStatus()).filter((s) => s.name.startsWith('plugin:')).flatMap((s) => urlOf(s.config) ?? []),
  );
  if (pluginUrls.size === 0) {
    return duplicateConnectors();
  }
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const connectors = (await q.mcpServerStatus()).filter((s) => s.name.startsWith('claude.ai '));
    if (connectors.length > 0) {
      const duplicates = connectors.filter((s) => pluginUrls.has(urlOf(s.config) ?? '')).map((s) => s.name);
      await writeConfig({ duplicateConnectors: duplicates });
      return duplicates;
    }
  }
  return duplicateConnectors();
};

/** Weergave-instellingen (dekking, zijbalk); in de backend omdat de poort, en dus de opslag van het venster, per start wisselt. */
export const savedUi = (): UiSettings => ({ opacity: 100, sidebarOpen: true, dockWidth: 460, dockSide: 'right', thema: 'systeem', meldingen: true, accent: null, speechLanguage: 'nl', speechModel: 'base', promptSuggestions: true, shortcuts: {}, ...readConfig().ui });
export const saveUi = (ui: UiSettings) => writeConfig({ ui });

export const savedTabs = (): SavedTabs => readConfig().tabs ?? { tabs: [], active: 0 };
export const saveTabs = (tabs: SavedTabs) => writeConfig({ tabs });

export const isWithinRoot = (dir: string) => {
  const resolved = path.resolve(dir);
  return resolved !== root && resolved.startsWith(root + path.sep);
};

// Recente projecten mogen overal staan; verdwenen mappen vallen er vanzelf uit.
export const readRecent = async (): Promise<string[]> => {
  try {
    const dirs = JSON.parse(await readFile(recentFile, 'utf8')) as string[];
    const exists = await Promise.all(dirs.map(isDirectory));
    return dirs.filter((_, i) => exists[i]);
  } catch {
    return [];
  }
};

export const addRecent = async (dir: string): Promise<string[]> => {
  const recent = [dir, ...(await readRecent()).filter((d) => d !== dir)].slice(0, 10);
  await mkdir(configDir, { recursive: true });
  await writeFile(recentFile, JSON.stringify(recent, null, 2));
  return recent;
};

export const isDirectory = async (dir: string) => (await stat(dir).catch(() => null))?.isDirectory() ?? false;

const skipDirs = new Set(['node_modules', 'vendor', 'dist', 'build', 'target', '__pycache__']);
const maxDepth = 3;

/**
 * Projecten onder de standaardmap, als pad relatief aan de standaardmap. Een map met `.git` is een project
 * (daaronder zoeken we niet verder); mappen zonder `.git` zijn groepsmappen waar we dieper in kijken.
 * Staat er geen enkele repo in, dan vallen we terug op de mappen direct onder de standaardmap.
 */
export const listDirs = async () => {
  const found: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    await Promise.all(
      entries
        .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !skipDirs.has(e.name))
        .map(async (e) => {
          const full = path.join(dir, e.name);
          if (existsSync(path.join(full, '.git'))) {
            found.push(path.relative(root, full));
          } else if (depth < maxDepth) {
            await walk(full, depth + 1);
          }
        }),
    );
  };
  await walk(root, 1);
  if (found.length === 0) {
    const entries = await readdir(root, { withFileTypes: true });
    found.push(...entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).map((e) => e.name));
  }
  return { path: root, dirs: found.sort((a, b) => a.localeCompare(b)) };
};

const canOpen = (dir: string) =>
  access(dir, constants.R_OK | constants.X_OK).then(
    () => true,
    () => false,
  );

export const listFolder = async (dir: string) => {
  const resolved = path.resolve(dir.replace(/^~(?=$|\/)/, homedir()));
  const parent = resolved === path.dirname(resolved) ? null : path.dirname(resolved);
  const all = await readdir(resolved, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      return null;
    }
    throw error;
  });
  if (!all) {
    return { path: resolved, parent, dirs: [], error: `Geen toegang tot ${resolved}` };
  }
  const entries = all.filter((e) => !e.name.startsWith('.'));
  const isDir = await Promise.all(entries.map((e) => e.isDirectory() || (e.isSymbolicLink() && isDirectory(path.join(resolved, e.name)))));
  const dirs = await Promise.all(
    entries
      .filter((_, i) => isDir[i])
      .map(async (e) => ({ name: e.name, readable: await canOpen(path.join(resolved, e.name)) })),
  );
  return { path: resolved, parent, dirs: dirs.sort((a, b) => a.name.localeCompare(b.name)) };
};

const claudeProjects = path.join(homedir(), '.claude', 'projects');

const projectDirName = (dir: string) => {
  const name = dir.replace(/[^a-zA-Z0-9]/g, '-');
  if (name.length <= 200) {
    return name;
  }
  let hash = 0;
  for (let i = 0; i < dir.length; i++) {
    hash = ((hash << 5) - hash + dir.charCodeAt(i)) | 0;
  }
  return `${name.slice(0, 200)}-${Math.abs(hash).toString(36)}`;
};

// Zoals Claude Code zelf een gesprek verhuist bij `cd`: transcript en subagent-map naar de projectmap van de nieuwe
// cwd, plus een `relocated`-regel; listSessions leest de cwd daaruit (anders uit de eerste regel, dus de oude map).
export const moveSession = async (sessionId: string, cwd: string) => {
  const real = await realpath(cwd);
  const target = path.join(claudeProjects, projectDirName(real));
  const source = (await readdir(claudeProjects))
    .map((dir) => path.join(claudeProjects, dir))
    .find((dir) => existsSync(path.join(dir, `${sessionId}.jsonl`)));
  if (!source) {
    return;
  }
  if (source !== target) {
    await mkdir(target, { recursive: true });
    await rename(path.join(source, `${sessionId}.jsonl`), path.join(target, `${sessionId}.jsonl`));
    if (existsSync(path.join(source, sessionId))) {
      await rename(path.join(source, sessionId), path.join(target, sessionId));
    }
  }
  await appendFile(path.join(target, `${sessionId}.jsonl`), `${JSON.stringify({ type: 'relocated', sessionId, relocatedCwd: real })}\n`);
};

/** De dichtstbijzijnde map (zelf of erboven) met `.git`; zonder git de map zelf. */
const gitRoot = (dir: string) => {
  for (let d = dir; ; d = path.dirname(d)) {
    if (existsSync(path.join(d, '.git'))) {
      return d;
    }
    if (d === root || d === path.dirname(d)) {
      return dir;
    }
  }
};

/** Korte naam van een project: relatief aan de standaardmap, of de mapnaam als het daarbuiten staat. */
export const repoName = (dir: string) => {
  const relative = path.relative(root, dir);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : path.basename(dir);
};

// Sessies binnen de standaardmap of in een recent geopende map; `repo` is de naam van het project,
// zodat sessies in submappen bij hun repo staan.
export const allSessions = async (): Promise<SessionSummary[]> => {
  const recent = await readRecent();
  const known = (dir: string) => isWithinRoot(dir) || recent.some((r) => dir === r || dir.startsWith(r + path.sep));
  return (await listSessions({ limit: 500 }))
    .filter((s) => !s.archived && s.cwd && known(s.cwd))
    .sort((a, b) => b.lastModified - a.lastModified)
    .map((s) => ({
      sessionId: s.sessionId,
      title: s.customTitle ?? s.summary,
      lastModified: s.lastModified,
      cwd: s.cwd as string,
      repo: repoName(gitRoot(s.cwd as string)),
      branch: s.gitBranch,
    }));
};

type Helper = { q: Query; ask: (prompt: string) => Promise<SDKResultMessage> };
let helper: Helper | null = null;

/**
 * Eén doorlopend hulpproces voor modellen, connectors en /usage: elk los query() is een nieuw Claude Code-proces
 * dat als sessie telt en alle MCP-servers opnieuw verbindt. Valt het weg, dan start de volgende aanvraag een nieuw.
 */
export const helperQuery = (): Helper => {
  if (helper) {
    return helper;
  }
  const prompts = new EventEmitter();
  // Nu al luisteren: de SDK leest de prompt pas later, en een eerdere prompt zou anders verloren gaan.
  const incoming = on(prompts, 'prompt');
  // persistSession: false, anders komt elke prompt in een sessie in ~/.claude/projects.
  const q = query({
    prompt: (async function* () {
      for await (const [content] of incoming) {
        yield { type: 'user', parent_tool_use_id: null, message: { role: 'user', content } } as SDKUserMessage;
      }
    })(),
    options: { cwd: homedir(), env: { ...process.env }, settingSources: ['user'], persistSession: false },
  });
  // Claude Code beantwoordt prompts op volgorde, dus elk result hoort bij de oudste wachtende aanvraag.
  const waiting: { resolve: (result: SDKResultMessage) => void; reject: (error: Error) => void }[] = [];
  const current: Helper = {
    q,
    ask: (prompt) =>
      new Promise((resolve, reject) => {
        waiting.push({ resolve, reject });
        prompts.emit('prompt', prompt);
      }),
  };
  helper = current;
  void (async () => {
    for await (const message of q) {
      if (message.type === 'result') {
        waiting.shift()?.resolve(message);
      }
    }
  })()
    .catch(() => undefined)
    .finally(() => {
      if (helper === current) {
        helper = null;
      }
      for (const w of waiting.splice(0)) {
        w.reject(new Error('Hulpproces van Claude Code is gestopt.'));
      }
    });
  return current;
};

let modelsPromise: Promise<ModelOption[]> | null = null;
export const availableModels = () => {
  modelsPromise ??= (async () =>
    (await helperQuery().q.supportedModels()).map((m) => ({
      value: m.value,
      label: m.displayName,
      efforts: m.supportedEffortLevels ?? [],
    })))().catch(() => {
    modelsPromise = null;
    return [];
  });
  return modelsPromise;
};
