import {
  query,
  type PermissionResult,
  type PermissionUpdate,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type {
  Attachment,
  Effort,
  Limits,
  ChatItem,
  ManageInfo,
  Question,
  Mode,
  PermissionDecision,
  ServerEvent,
  Settings,
  TaskInfo,
} from '../shared/protocol.js';
import { assistantBlocks, toolResults, toolSummary } from './mapMessages.js';
import { duplicateConnectors, saveContextMax, saveLimits, savedContextMax, savedLimits } from './projects.js';

// Laatst bekende abonnementslimieten, gedeeld over verbindingen zodat ze direct zichtbaar zijn.
export let lastLimits: Limits = savedLimits();
export const setLastLimits = (limits: Limits) => {
  lastLimits = { ...lastLimits, ...Object.fromEntries(Object.entries(limits).filter(([, v]) => v)) };
  void saveLimits(lastLimits);
};

type RateLimitWindow = { utilization?: number; resetsAt?: number };
const toWindow = (w?: RateLimitWindow) =>
  w?.utilization !== undefined && w.resetsAt ? { percentage: Math.round(w.utilization * 100), resetsAt: w.resetsAt } : undefined;

const uploadsDir = path.join(process.env.XDG_CACHE_HOME ?? path.join(homedir(), '.cache'), 'claude-ui', 'uploads');

// Bestanden die Claude niet direct kan lezen (xlsx, pdf, zip, …) komen op schijf; Claude krijgt het pad.
const saveUpload = async (attachment: Attachment) => {
  const dir = path.join(uploadsDir, `${Date.now()}`);
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, path.basename(attachment.name));
  await writeFile(filePath, Buffer.from(attachment.data, 'base64'));
  return filePath;
};

type Send = (event: ServerEvent) => void;

type PendingPermission = {
  resolve: (result: PermissionResult) => void;
  input: Record<string, unknown>;
  suggestions?: PermissionUpdate[];
};

/** Async-iterable wachtrij: de SDK leest hieruit zolang de sessie open is (streaming input). */
class InputQueue implements AsyncIterable<SDKUserMessage> {
  private items: SDKUserMessage[] = [];
  private waiter: ((result: IteratorResult<SDKUserMessage>) => void) | null = null;
  private closed = false;

  push(item: SDKUserMessage) {
    if (this.waiter) {
      this.waiter({ value: item, done: false });
      this.waiter = null;
    } else {
      this.items.push(item);
    }
  }

  close() {
    this.closed = true;
    this.waiter?.({ value: undefined, done: true });
    this.waiter = null;
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () => {
        const item = this.items.shift();
        if (item) {
          return Promise.resolve({ value: item, done: false });
        }
        if (this.closed) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve) => {
          this.waiter = resolve;
        });
      },
    };
  }
}

const buildUserMessage = async (text: string, attachments: Attachment[]): Promise<SDKUserMessage> => ({
  type: 'user',
  parent_tool_use_id: null,
  message: {
    role: 'user',
    content: [
      ...(await Promise.all(
        attachments.map(async (a) =>
          a.kind === 'file'
            ? { type: 'text' as const, text: `<bijlage naam="${a.name}" pad="${await saveUpload(a)}" />` }
            : a.kind === 'image'
          ? {
              type: 'image' as const,
              source: {
                type: 'base64' as const,
                media_type: a.mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
                data: a.data,
              },
            }
          : { type: 'text' as const, text: `<bestand naam="${a.name}">\n${a.data}\n</bestand>` },
        ),
      )),
      { type: 'text' as const, text },
    ],
  },
});

export class ClaudeSession {
  sessionId: string | null;
  private readonly queue = new InputQueue();
  private readonly abort = new AbortController();
  private readonly pending = new Map<string, PendingPermission>();
  private readonly streamedMessages = new Set<string>();
  private currentMessageId = '';
  private interrupted = false;
  private readonly pendingQuestions = new Map<string, { resolve: (result: PermissionResult) => void; input: Record<string, unknown> }>();
  /** Uitvoer van `!`-commando's; gaat mee met het volgende bericht, zodat Claude hem ziet (zoals in Claude Code). */
  private shellContext: string[] = [];
  private lastPrompt = '';
  private turnActive = false;
  /** Laatst afgeronde achtergrondtaak: de aanleiding als Claude daarna uit zichzelf verdergaat. */
  private lastFinishedTask: string | null = null;
  /** De lopende beurt wordt afgebroken voor een voorrangsbericht; zijn einde is niet het einde van het werk. */
  private supersededTurns = 0;
  private readonly tasks = new Map<string, TaskInfo>();
  private readonly taskOutputs = new Map<string, string>();
  /** Live gesprek per subagent, op id van de Agent-tool die hem startte. */
  private readonly subagentChats = new Map<string, ChatItem[]>();
  private readonly subagentTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly q: Query;

  constructor(
    cwd: string,
    resume: string | null,
    private readonly settings: Settings,
    private readonly send: Send,
    private readonly onTurnDone: () => void,
  ) {
    this.sessionId = resume;
    this.q = query({
      prompt: this.queue,
      options: {
        cwd,
        resume: resume ?? undefined,
        model: settings.model ?? undefined,
        effort: settings.effort ?? undefined,
        // CLAUDE_UI: je eigen hooks (bv. meldingen) kunnen hiermee overslaan; de app meldt zelf.
        env: { ...process.env, CLAUDE_UI: '1' },
        includePartialMessages: true,
        promptSuggestions: true,
        permissionMode: settings.mode ?? undefined,
        // Alleen nodig zodat de gebruiker zelf 'bypassPermissions' kan kiezen; zonder die keuze verandert er niets.
        allowDangerouslySkipPermissions: true,
        settingSources: ['user', 'project', 'local'],
        skills: 'all',
        settings: { deniedMcpServers: duplicateConnectors().map((serverName) => ({ serverName })) },
        abortController: this.abort,
        canUseTool: (toolName, input, options) =>
          new Promise<PermissionResult>((resolve) => {
            const id = options.toolUseID;
            if (toolName === 'AskUserQuestion') {
              // Claude's vragen met keuzes: de app toont ze als dialoog; het antwoord gaat terug in de tool-invoer.
              this.pendingQuestions.set(id, { resolve, input });
              options.signal.addEventListener('abort', () => {
                if (this.pendingQuestions.delete(id)) {
                  this.send({ type: 'question_cancelled', id });
                  resolve({ behavior: 'deny', message: 'Afgebroken' });
                }
              });
              this.send({ type: 'question', id, questions: (input.questions ?? []) as Question[] });
              return;
            }
            this.pending.set(id, { resolve, input, suggestions: options.suggestions });
            options.signal.addEventListener('abort', () => {
              if (this.pending.delete(id)) {
                this.send({ type: 'permission_cancelled', id });
                resolve({ behavior: 'deny', message: 'Afgebroken' });
              }
            });
            this.send({
              type: 'permission_request',
              id,
              toolName,
              input,
              title: options.title,
              reason: options.decisionReason,
              canAlways: Boolean(options.suggestions?.length),
            });
          }),
      },
    });
    void this.pump();
  }

  /** force: met voorrang ('now'): Claude onderbreekt de lopende beurt en beantwoordt dit bericht meteen. */
  async push(text: string, attachments: Attachment[], force = false) {
    this.send({ type: 'running', running: true });
    this.lastPrompt = text;
    const context = this.shellContext.splice(0).join('\n');
    const message = await buildUserMessage(context ? `${context}\n\n${text}` : text, attachments);
    if (force && this.turnActive) {
      this.supersededTurns += 1;
      message.priority = 'now';
    }
    this.turnActive = true;
    this.queue.push(message);
  }

  async setModel(model: string) {
    await this.q.setModel(model);
  }

  async stopTask(taskId: string) {
    await this.q.stopTask(taskId);
  }

  /** Laatste deel van de output van een achtergrondtaak (alleen bestanden die de SDK zelf meldde). */
  async taskOutput(taskId: string) {
    const file = this.taskOutputs.get(taskId);
    if (!file) {
      return '(geen output beschikbaar)';
    }
    const text = await readFile(file, 'utf8').catch(() => '(output niet leesbaar)');
    return text.length > 64000 ? `…\n${text.slice(-64000)}` : text;
  }

  async manage(): Promise<ManageInfo> {
    const [mcp, commands, agents] = await Promise.all([
      this.q.mcpServerStatus(),
      this.q.supportedCommands(),
      this.q.supportedAgents(),
    ]);
    return {
      mcp: mcp.map((m) => ({ name: m.name, status: m.status, scope: m.scope, error: m.error, tools: m.tools?.length ?? 0 })),
      commands: commands.map((c) => ({ name: c.name, description: c.description })),
      agents: agents.map((a) => ({ name: a.name, description: a.description })),
    };
  }

  async toggleMcp(name: string, enabled: boolean) {
    await this.q.toggleMcpServer(name, enabled);
  }

  async reconnectMcp(name: string) {
    await this.q.reconnectMcpServer(name);
  }

  private recordSubagent(parentId: string, message: SDKMessage) {
    const chat = this.subagentChats.get(parentId) ?? [];
    if (message.type === 'assistant') {
      for (const block of assistantBlocks(message.message)) {
        if (chat.some((i) => i.id === block.id)) {
          continue;
        }
        chat.push(
          block.kind === 'tool'
            ? { kind: 'tool', id: block.id, name: block.name, input: block.input, done: false }
            : { kind: 'assistant', id: block.id, text: block.text, streaming: false },
        );
      }
    } else if (message.type === 'user') {
      for (const result of toolResults(message.message)) {
        const tool = chat.find((i) => i.id === result.id);
        if (tool?.kind === 'tool') {
          Object.assign(tool, { output: result.output, isError: result.isError, done: true });
        }
      }
      const content = (message.message as { content?: unknown }).content;
      const text = typeof content === 'string' ? content : '';
      if (text && !chat.some((i) => i.kind === 'user')) {
        chat.push({ kind: 'user', id: `${parentId}:prompt`, text, attachments: [] });
      }
    } else {
      return;
    }
    this.subagentChats.set(parentId, chat);
    // Hooguit een paar keer per seconde versturen, ook bij veel kleine berichten.
    if (!this.subagentTimers.has(parentId)) {
      this.subagentTimers.set(
        parentId,
        setTimeout(() => {
          this.subagentTimers.delete(parentId);
          this.send({ type: 'subagent', toolUseId: parentId, items: this.subagentChats.get(parentId) ?? [], live: true });
        }, 300),
      );
    }
  }

  /** Live gesprek van een subagent, als die in deze sessie draaide. */
  subagentChat(toolUseId: string) {
    return this.subagentChats.get(toolUseId);
  }

  private updateTask(id: string, patch: Partial<TaskInfo>) {
    const current = this.tasks.get(id) ?? {
      id,
      kind: 'other' as const,
      description: '',
      status: 'running',
      background: false,
      hasOutput: false,
    };
    const next = { ...current, ...patch };
    if (!['running', 'pending'].includes(next.status) && !next.endedAt) {
      next.endedAt = Date.now();
    }
    this.tasks.set(id, next);
    this.send({ type: 'tasks', tasks: [...this.tasks.values()] });
  }

  private handleTaskMessage(message: SDKMessage & { type: 'system' }) {
    const m = message as Record<string, unknown> & { subtype: string; task_id?: string };
    if (!m.task_id) {
      return;
    }
    const usage = m.usage as { total_tokens: number; tool_uses: number; duration_ms: number } | undefined;
    const usagePatch = usage ? { tokens: usage.total_tokens, toolUses: usage.tool_uses, durationMs: usage.duration_ms } : {};
    switch (m.subtype) {
      case 'task_started': {
        const taskType = String(m.task_type ?? '');
        this.updateTask(m.task_id, {
          kind: m.subagent_type || taskType.includes('agent') ? 'agent' : taskType.includes('bash') ? 'bash' : 'other',
          description: String(m.description ?? ''),
          subagentType: m.subagent_type as string | undefined,
          background: Boolean(m.is_backgrounded),
          toolUseId: m.tool_use_id as string | undefined,
          status: 'running',
        });
        return;
      }
      case 'task_progress':
        this.updateTask(m.task_id, {
          ...usagePatch,
          lastTool: m.last_tool_name as string | undefined,
          summary: (m.summary as string | undefined) ?? this.tasks.get(m.task_id)?.summary,
        });
        return;
      case 'task_updated': {
        const patch = (m.patch ?? {}) as { status?: string; description?: string; is_backgrounded?: boolean; error?: string };
        this.updateTask(m.task_id, {
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.description ? { description: patch.description } : {}),
          ...(patch.is_backgrounded !== undefined ? { background: patch.is_backgrounded } : {}),
          ...(patch.error ? { summary: patch.error } : {}),
        });
        return;
      }
      case 'task_notification':
        if (m.output_file) {
          this.taskOutputs.set(m.task_id, String(m.output_file));
        }
        this.updateTask(m.task_id, {
          ...usagePatch,
          status: String(m.status),
          summary: String(m.summary ?? ''),
          hasOutput: Boolean(m.output_file),
        });
        {
          const task = this.tasks.get(m.task_id);
          const what = task?.kind === 'agent' ? 'Subagent' : task?.kind === 'bash' ? 'Achtergrondcommando' : 'Taak';
          const status = m.status === 'completed' ? 'klaar' : m.status === 'failed' ? 'mislukt' : 'gestopt';
          this.lastFinishedTask = `${what} ${status}${task?.description ? `: ${task.description}` : ''}`;
        }
        return;
    }
  }

  /**
   * Claude begint een beurt zonder bericht van de gebruiker (bv. omdat een subagent of achtergrondtaak klaar is):
   * meld dat apart, zodat de app het niet aan het vorige antwoord vastplakt.
   */
  private startOwnTurn() {
    if (this.turnActive) {
      return;
    }
    this.turnActive = true;
    this.send({ type: 'running', running: true });
    this.send({ type: 'turn_started', reason: this.lastFinishedTask ?? 'Claude gaat uit zichzelf verder' });
    this.lastFinishedTask = null;
  }

  async setMode(mode: Mode) {
    await this.q.setPermissionMode(mode);
  }

  async setEffort(effort: Effort) {
    await this.q.applyFlagSettings({ effortLevel: effort });
  }

  async interrupt() {
    this.interrupted = true;
    await this.q.interrupt();
  }

  addShellContext(command: string, output: string, exitCode: number) {
    this.shellContext.push(
      `<bash-input>${command}</bash-input>\n<bash-stdout>${output}</bash-stdout>${exitCode ? `\n<bash-exit-code>${exitCode}</bash-exit-code>` : ''}`,
    );
  }

  /** `chat`: de gebruiker wil eerst over de vragen praten ("Chat about this" in Claude Code) in plaats van ze te beantwoorden. */
  answerQuestion(id: string, answers: Record<string, string> | null, chat = false) {
    const pending = this.pendingQuestions.get(id);
    if (!pending) {
      return;
    }
    this.pendingQuestions.delete(id);
    if (chat) {
      pending.resolve({ behavior: 'deny', message: 'De gebruiker wil eerst met je over deze vragen praten en beantwoordt ze nu niet. Stel ze niet opnieuw; stop en wacht op zijn volgende bericht.' });
      return;
    }
    if (!answers) {
      pending.resolve({ behavior: 'deny', message: 'De gebruiker heeft de vraag overgeslagen; ga verder op basis van je eigen inschatting of vraag het in tekst.' });
      return;
    }
    pending.resolve({ behavior: 'allow', updatedInput: { ...pending.input, answers } });
  }

  respond(id: string, decision: PermissionDecision) {
    const pending = this.pending.get(id);
    if (!pending) {
      return;
    }
    this.pending.delete(id);
    if (decision === 'deny') {
      pending.resolve({ behavior: 'deny', message: 'De gebruiker heeft deze actie geweigerd.' });
      return;
    }
    pending.resolve({
      behavior: 'allow',
      updatedInput: pending.input,
      updatedPermissions:
        // Net als "don't ask again" in Claude Code: opslaan in .claude/settings.local.json van het project.
        decision === 'always'
          ? pending.suggestions?.map((s) =>
              // Een moduswissel (bv. naar acceptEdits) geldt alleen voor deze sessie, zoals in Claude Code.
              s.type === 'setMode'
                ? { ...s, destination: 'session' as const }
                : { ...s, destination: s.destination === 'session' ? ('localSettings' as const) : s.destination },
            )
          : undefined,
    });
  }

  close() {
    this.queue.close();
    this.abort.abort();
    this.q.close();
  }

  private async sendContext() {
    const usage = await this.q.getContextUsage().catch(() => null);
    if (usage) {
      if (usage.maxTokens && usage.maxTokens !== savedContextMax()) {
        void saveContextMax(usage.maxTokens);
      }
      this.send({
        type: 'context',
        percentage: Math.min(100, Math.round(usage.percentage)),
        totalTokens: usage.totalTokens,
        maxTokens: usage.maxTokens,
      });
    }
  }

  private async pump() {
    try {
      for await (const message of this.q) {
        this.handle(message);
      }
    } catch (error) {
      if (!this.abort.signal.aborted) {
        this.send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      this.send({ type: 'running', running: false });
    }
  }

  private handle(message: SDKMessage) {
    if ('parent_tool_use_id' in message && message.parent_tool_use_id) {
      // Activiteit van een subagent: tonen in de kaart van de Agent-tool die hem startte.
      this.recordSubagent(message.parent_tool_use_id, message);
      if (message.type === 'assistant') {
        for (const block of assistantBlocks(message.message)) {
          this.send({
            type: 'sub_activity',
            parentId: message.parent_tool_use_id,
            id: block.id,
            kind: block.kind,
            label: block.kind === 'tool' ? `${block.name} ${toolSummary(block.input)}`.trim() : block.text.slice(0, 300),
          });
        }
      }
      return;
    }
    switch (message.type) {
      case 'system':
        if (message.subtype.startsWith('task_')) {
          this.handleTaskMessage(message);
        } else if (message.subtype === 'init') {
          this.sessionId = message.session_id;
          this.send({
            type: 'init',
            sessionId: message.session_id,
            model: message.model,
            cwd: message.cwd,
            permissionMode: message.permissionMode,
            apiKeySource: message.apiKeySource,
          });
        } else if (message.subtype === 'status' && message.permissionMode && message.permissionMode !== this.settings.mode) {
          // Claude Code wisselt zelf van modus, bv. na het goedkeuren van een plan (ExitPlanMode).
          this.settings.mode = message.permissionMode;
          this.send({ type: 'settings', ...this.settings });
        }
        return;
      case 'stream_event': {
        const event = message.event;
        if (event.type === 'message_start') {
          this.startOwnTurn();
          this.currentMessageId = event.message.id;
        } else if (event.type === 'content_block_start' && event.content_block.type === 'text') {
          this.streamedMessages.add(this.currentMessageId);
          this.send({ type: 'text_start', id: `${this.currentMessageId}:${event.index}` });
        } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          this.send({ type: 'text_delta', id: `${this.currentMessageId}:${event.index}`, text: event.delta.text });
        } else if (event.type === 'content_block_stop') {
          this.send({ type: 'text_end', id: `${this.currentMessageId}:${event.index}` });
        }
        return;
      }
      case 'assistant':
        this.startOwnTurn();
        for (const block of assistantBlocks(message.message)) {
          if (block.kind === 'tool') {
            this.send({ type: 'tool_start', id: block.id, name: block.name, input: block.input });
          } else if (!this.streamedMessages.has(message.message.id)) {
            this.send({ type: 'text_start', id: block.id });
            this.send({ type: 'text_delta', id: block.id, text: block.text });
            this.send({ type: 'text_end', id: block.id });
          }
        }
        return;
      case 'user':
        for (const result of toolResults(message.message)) {
          this.send({ type: 'tool_end', ...result });
        }
        return;
      case 'result': {
        // Een /-command dat de SDK niet kan uitvoeren: de app opent het in de ingebouwde terminal.
        const resultText = message.subtype === 'success' ? String(message.result ?? '') : '';
        const slash = this.lastPrompt.trim().match(/^\/[\w:-]+/)?.[0];
        if (slash && /isn't available in this environment|in the terminal for details/i.test(resultText)) {
          this.send({ type: 'needs_terminal', command: this.lastPrompt.trim() });
        }
        const usage = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
        for (const model of Object.values(message.modelUsage ?? {})) {
          if (model.contextWindow && model.contextWindow > (savedContextMax() ?? 0)) {
            void saveContextMax(model.contextWindow);
          }
          usage.input += model.inputTokens;
          usage.output += model.outputTokens;
          usage.cacheRead += model.cacheReadInputTokens;
          usage.cacheCreation += model.cacheCreationInputTokens;
        }
        this.send({
          type: 'result',
          costUsd: message.total_cost_usd,
          usage,
          durationMs: message.duration_ms,
          isError: message.subtype !== 'success' || message.is_error,
          errorText: this.supersededTurns > 0
            ? 'Onderbroken voor je nieuwe bericht'
            : this.interrupted
            ? 'Gestopt'
            : message.subtype !== 'success'
              ? message.errors?.join('\n')
              : undefined,
        });
        this.interrupted = false;
        if (this.supersededTurns > 0) {
          // Afgebroken voor een voorrangsbericht: dat bericht loopt nu, dus nog niet "klaar" melden.
          this.supersededTurns -= 1;
          return;
        }
        this.turnActive = false;
        this.send({ type: 'running', running: false });
        this.onTurnDone();
        void this.sendContext();
        return;
      }
      case 'rate_limit_event': {
        const info = message.rate_limit_info as { unifiedWindows?: Record<string, RateLimitWindow> };
        const windows = info.unifiedWindows ?? {};
        lastLimits = {
          fiveHour: toWindow(windows.five_hour) ?? lastLimits.fiveHour,
          sevenDay: toWindow(windows.seven_day) ?? lastLimits.sevenDay,
        };
        this.send({ type: 'limits', limits: lastLimits });
        void saveLimits(lastLimits);
        return;
      }
      case 'prompt_suggestion':
        this.send({ type: 'prompt_suggestion', suggestion: message.suggestion });
        return;
      default:
        return;
    }
  }
}
