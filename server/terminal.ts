import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import type { ServerEvent } from '../shared/protocol.js';

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
    const claudeCommand = claudeBin ? `"$(command -v claude || echo ${quote(claudeBin)})"` : 'claude';
    const spawnArgs = isShell ? ['-li'] : ['-lic', `exec ${claudeCommand} ${(args ?? []).map(quote).join(' ')}`];
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
