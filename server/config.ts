import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { ConfigInfo, ScopeSettings } from '../shared/protocol.js';

type Scope = ScopeSettings['scope'];
type RuleList = 'allow' | 'ask' | 'deny';

const memoryPaths = (cwd: string) => [
  { label: 'Gebruiker (~/.claude/CLAUDE.md)', path: path.join(homedir(), '.claude', 'CLAUDE.md') },
  { label: 'Project (CLAUDE.md)', path: path.join(cwd, 'CLAUDE.md') },
  { label: 'Project, lokaal (CLAUDE.local.md)', path: path.join(cwd, 'CLAUDE.local.md') },
];

const settingsPaths = (cwd: string): { scope: Scope; path: string }[] => [
  { scope: 'user', path: path.join(homedir(), '.claude', 'settings.json') },
  { scope: 'project', path: path.join(cwd, '.claude', 'settings.json') },
  { scope: 'local', path: path.join(cwd, '.claude', 'settings.local.json') },
];

const readText = (file: string) => readFile(file, 'utf8').catch(() => null);

const readJson = async (file: string): Promise<Record<string, any>> => {
  const text = await readText(file);
  if (!text?.trim()) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${file} is geen geldige JSON; pas hem eerst handmatig aan.`);
  }
};

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);

const hooksOf = (settings: Record<string, any>) =>
  Object.entries((settings.hooks ?? {}) as Record<string, any[]>).flatMap(([event, groups]) =>
    (Array.isArray(groups) ? groups : []).flatMap((group) =>
      (Array.isArray(group?.hooks) ? group.hooks : []).map((hook: any) => ({
        event,
        matcher: typeof group.matcher === 'string' ? group.matcher : '',
        command: String(hook?.command ?? hook?.prompt ?? hook?.url ?? hook?.type ?? ''),
      })),
    ),
  );

export const readConfig = async (cwd: string): Promise<ConfigInfo> => {
  const memory = await Promise.all(
    memoryPaths(cwd).map(async (m) => {
      const content = await readText(m.path);
      return { ...m, exists: content !== null, content: content ?? '' };
    }),
  );
  const scopes = await Promise.all(
    settingsPaths(cwd).map(async ({ scope, path: file }): Promise<ScopeSettings> => {
      try {
        const settings = await readJson(file);
        const permissions = settings.permissions ?? {};
        return {
          scope,
          path: file,
          allow: strings(permissions.allow),
          ask: strings(permissions.ask),
          deny: strings(permissions.deny),
          hooks: hooksOf(settings),
        };
      } catch (error) {
        return { scope, path: file, allow: [], ask: [], deny: [], hooks: [], error: (error as Error).message };
      }
    }),
  );
  return { memory, scopes };
};

export const saveMemory = async (cwd: string, file: string, content: string) => {
  if (!memoryPaths(cwd).some((m) => m.path === file)) {
    throw new Error('Dit bestand mag je hier niet bewerken.');
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
};

export const changeRule = async (cwd: string, scope: Scope, list: RuleList, rule: string, remove: boolean) => {
  const target = settingsPaths(cwd).find((s) => s.scope === scope);
  if (!target || !['allow', 'ask', 'deny'].includes(list)) {
    throw new Error('Onbekende instelling.');
  }
  const settings = await readJson(target.path);
  const permissions = (settings.permissions ??= {});
  const current = strings(permissions[list]);
  permissions[list] = remove ? current.filter((r) => r !== rule) : current.includes(rule) ? current : [...current, rule];
  await mkdir(path.dirname(target.path), { recursive: true });
  await writeFile(target.path, `${JSON.stringify(settings, null, 2)}\n`);
};
