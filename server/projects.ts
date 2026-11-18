import { listSessions, query } from '@anthropic-ai/claude-agent-sdk';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
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
  const q = query({ prompt: idle(), options: { cwd: homedir(), env: { ...process.env }, settingSources: ['user'], persistSession: false } });
  try {
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
  } finally {
    q.close();
  }
};

/** Weergave-instellingen (dekking, zijbalk); in de backend omdat de poort, en dus de opslag van het venster, per start wisselt. */
export const savedUi = (): UiSettings => ({ opacity: 100, sidebarOpen: true, dockWidth: 460, thema: 'systeem', meldingen: true, accent: null, speechLanguage: 'nl', speechModel: 'base', ...readConfig().ui });
export const saveUi = (ui: UiSettings) => writeConfig({ ui });

export const savedTabs = (): SavedTabs => readConfig().tabs ?? { tabs: [], active: 0 };
export const saveTabs = (tabs: SavedTabs) => writeConfig({ tabs });

export const isWithinRoot = (dir: string) => {
  const resolved = path.resolve(dir);
  return resolved !== root && resolved.startsWith(root + path.sep);
};

export const readRecent = async (): Promise<string[]> => {
  try {
    return (JSON.parse(await readFile(recentFile, 'utf8')) as string[]).filter(isWithinRoot);
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

export const listDirs = async () => {
  const entries = await readdir(root, { withFileTypes: true });
  return {
    path: root,
    dirs: entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b)),
  };
};

// Alle sessies binnen de standaardmap; `repo` is de eerste map daaronder, zodat sessies in submappen bij hun repo staan.
export const allSessions = async (): Promise<SessionSummary[]> =>
  (await listSessions({ limit: 500 }))
    .filter((s) => !s.archived && s.cwd && isWithinRoot(s.cwd))
    .sort((a, b) => b.lastModified - a.lastModified)
    .map((s) => ({
      sessionId: s.sessionId,
      title: s.customTitle ?? s.summary,
      lastModified: s.lastModified,
      cwd: s.cwd as string,
      repo: path.relative(root, s.cwd as string).split(path.sep)[0],
      branch: s.gitBranch,
    }));

// Modellen opvragen zonder prompt: de SDK start Claude Code, we lezen de lijst en sluiten meteen.
const idle = async function* () {
  await new Promise(() => undefined);
};

let modelsPromise: Promise<ModelOption[]> | null = null;
export const availableModels = () => {
  modelsPromise ??= (async () => {
    const q = query({ prompt: idle(), options: { cwd: homedir(), env: { ...process.env }, settingSources: ['user'], persistSession: false } });
    try {
      return (await q.supportedModels()).map((m) => ({
        value: m.value,
        label: m.displayName,
        efforts: m.supportedEffortLevels ?? [],
      }));
    } finally {
      q.close();
    }
  })().catch(() => {
    modelsPromise = null;
    return [];
  });
  return modelsPromise;
};
