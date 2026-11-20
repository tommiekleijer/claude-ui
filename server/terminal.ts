import { ChildProcessWithoutNullStreams, execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import type { AuthStatus, ServerEvent } from '../shared/protocol.js';

type Pty = {
  onData: (cb: (data: string) => void) => void;
  onExit: (cb: (event: { exitCode: number }) => void) => void;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
};
type PtyModule = { spawn: (file: string, args: string[], options: Record<string, unknown>) => Pty };

// node-pty is optioneel: zonder build-tools installeert hij niet, dan valt alleen de ingebouwde terminal weg.
const loadPty = (): PtyModule | null => {
  try {
    return createRequire(import.meta.url)('node-pty') as PtyModule;
  } catch {
    return null;
  }
};
const pty = loadPty();
export const terminalAvailable = pty !== null;

const shell = process.env.SHELL || '/bin/bash';

/** Claude Code uit de meegeleverde SDK, voor als er geen `claude` in je PATH staat (de app installeert niets zelf). */
const bundledClaude = () => {
  try {
    const require = createRequire(import.meta.url);
    const dir = path.dirname(require.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`));
    const file = path.join(dir, process.platform === 'win32' ? 'claude.exe' : 'claude');
    return existsSync(file) ? file : null;
  } catch {
    return null;
  }
};
const claudeBin = bundledClaude();
const quote = (arg: string) => `'${arg.replace(/'/g, `'\\''`)}'`;
const claudeCommand = claudeBin ? `"$(command -v claude || echo ${quote(claudeBin)})"` : 'claude';
/** Shell-argumenten die Claude Code via de login-shell starten: `claude` uit je PATH, anders de meegeleverde. */
const claudeShellArgs = (args: string[]) => ['-lic', `exec ${claudeCommand} ${args.map(quote).join(' ')}`];

/** Terminals per verbinding (tabblad); ze stoppen als de verbinding sluit. */
export class Terminals {
  private readonly ptys = new Map<string, Pty>();

  constructor(private readonly send: (event: ServerEvent) => void) {}

  /**
   * Start de echte Claude Code (args) of een interactieve shell met een commando (shellCommand), via de
   * login-shell, zodat PATH en instellingen gelijk zijn aan je eigen terminal.
   */
  start(id: string, cwd: string, cols: number, rows: number, args?: string[], shellCommand?: string) {
    if (!pty) {
      this.send({ type: 'error', message: 'De ingebouwde terminal is niet beschikbaar (node-pty ontbreekt).' });
      return;
    }
    const isShell = shellCommand !== undefined;
    const title = isShell ? shellCommand : ['claude', ...(args ?? [])].join(' ');
    const spawnArgs = isShell ? ['-li'] : claudeShellArgs(args ?? []);
    const term = pty.spawn(shell, spawnArgs, {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
    });
    this.ptys.set(id, term);
    term.onData((data) => this.send({ type: 'pty_data', id, data }));
    term.onExit(({ exitCode }) => {
      this.ptys.delete(id);
      this.send({ type: 'pty_exit', id, code: exitCode });
    });
    this.send({ type: 'pty_started', id, command: title });
    if (isShell && shellCommand) {
      // Het commando intypen in de shell, zodat je daarna gewoon verder kunt werken (cd blijft staan).
      term.write(`${shellCommand}\r`);
    }
  }

  input(id: string, data: string) {
    this.ptys.get(id)?.write(data);
  }

  resize(id: string, cols: number, rows: number) {
    this.ptys.get(id)?.resize(Math.max(cols, 20), Math.max(rows, 5));
  }

  kill(id: string) {
    this.ptys.get(id)?.kill();
    this.ptys.delete(id);
  }

  closeAll() {
    for (const term of this.ptys.values()) {
      term.kill();
    }
    this.ptys.clear();
  }
}

const MAX_OUTPUT = 30_000;

/** Voert een `!`-commando uit in de projectmap, via de login-shell (zoals de bash-modus van Claude Code). */
export const runShell = (cwd: string, command: string) =>
  new Promise<{ output: string; exitCode: number }>((resolve) => {
    const child = spawn(shell, ['-lic', command], { cwd, env: process.env });
    let output = '';
    const append = (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > MAX_OUTPUT * 2) {
        output = output.slice(-MAX_OUTPUT);
      }
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    const timer = setTimeout(() => child.kill('SIGTERM'), 10 * 60 * 1000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const trimmed = output.length > MAX_OUTPUT ? `…\n${output.slice(-MAX_OUTPUT)}` : output;
      resolve({ output: trimmed.trimEnd(), exitCode: code ?? 1 });
    });
  });

const execFileAsync = promisify(execFile);

/** Niet ingelogd geeft exitcode 1, met de JSON gewoon op stdout; uitvoer van de shell-rc vóór de JSON telt niet mee. */
export const authStatus = async (): Promise<AuthStatus> => {
  const { stdout, stderr } = await execFileAsync(shell, claudeShellArgs(['auth', 'status', '--json'])).catch(
    (error: { stdout?: string; stderr?: string; message: string }) => ({ stdout: error.stdout ?? '', stderr: error.stderr || error.message }),
  );
  try {
    return JSON.parse(stdout.slice(stdout.indexOf('{'))) as AuthStatus;
  } catch {
    return { loggedIn: false, authMethod: 'none', error: (stderr || stdout).trim() || 'Geen uitvoer van claude auth status.' };
  }
};

export const authLogout = () => execFileAsync(shell, claudeShellArgs(['auth', 'logout']));

// Eén inlogproces tegelijk (inloggen geldt voor de hele machine); `send` is de verbinding die het startte.
let login: { child: ChildProcessWithoutNullStreams; send: (event: ServerEvent) => void } | null = null;

/**
 * `claude auth login` opent zelf de browser en wacht op de terugkoppeling via localhost. Daarnaast print hij een
 * inloglink die op een pagina met een code uitkomt; die code leest hij van stdin ("Paste code here if prompted").
 */
export const startLogin = (send: (event: ServerEvent) => void, options: { console: boolean; sso: boolean; email: string }) => {
  cancelLogin();
  const args = ['auth', 'login', options.console ? '--console' : '--claudeai', ...(options.sso ? ['--sso'] : []), ...(options.email ? [`--email=${options.email}`] : [])];
  const child = spawn(shell, claudeShellArgs(args), { env: process.env });
  const current = { child, send };
  login = current;
  send({ type: 'auth_login', state: 'waiting' });
  let output = '';
  let url: string | undefined;
  const append = (chunk: Buffer) => {
    output += chunk.toString();
    const found = output.match(/visit:\s*(\S+)\r?\n/)?.[1];
    if (found && !url) {
      url = found;
      send({ type: 'auth_login', state: 'waiting', url });
    }
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  // Een code plakken nadat het proces al stopte geeft EPIPE; de afloop meldt 'close' al.
  child.stdin.on('error', () => undefined);
  child.on('error', (error) => {
    if (login !== current) {
      return;
    }
    login = null;
    send({ type: 'auth_login', state: 'failed', error: error.message });
  });
  child.on('close', (code) => {
    if (login !== current) {
      return;
    }
    login = null;
    const error = output
      .split('\n')
      .filter((line) => line.trim() && !line.includes('visit:') && !line.startsWith('Paste code') && !line.startsWith('Opening browser'))
      .join('\n')
      .trim();
    send(code === 0 ? { type: 'auth_login', state: 'done' } : { type: 'auth_login', state: 'failed', error: error || `Inloggen mislukt (code ${code}).` });
  });
};

export const sendLoginCode = (code: string) => login?.child.stdin.write(`${code}\n`);

/** Stopt het inloggen; met `send` alleen als die verbinding het startte. */
export const cancelLogin = (send?: (event: ServerEvent) => void) => {
  if (login && (!send || login.send === send)) {
    const { child } = login;
    login = null;
    child.kill();
  }
};
