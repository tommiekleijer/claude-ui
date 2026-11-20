export type Attachment = {
  name: string;
  kind: 'image' | 'text' | 'file';
  mediaType: string;
  /** base64 voor afbeeldingen en overige bestanden, platte tekst voor tekstbestanden */
  data: string;
};

/** `images`: data-URL's van meegestuurde afbeeldingen, om ze in de chat te tonen. */
export type UserItem = { kind: 'user'; id: string; text: string; attachments: string[]; images?: string[] };
export type AssistantItem = { kind: 'assistant'; id: string; text: string; streaming: boolean };
export type ToolItem = {
  kind: 'tool';
  id: string;
  name: string;
  input: Record<string, unknown>;
  output?: string;
  isError?: boolean;
  done: boolean;
};
export type MarkerItem = { kind: 'marker'; id: string; text: string };
export type ChatItem = UserItem | AssistantItem | ToolItem | MarkerItem;

export type SessionSummary = {
  sessionId: string;
  title: string;
  lastModified: number;
  cwd: string;
  repo: string;
  branch?: string;
};

export type Usage = { input: number; output: number; cacheRead: number; cacheCreation: number };

export type PermissionDecision = 'allow' | 'deny' | 'always';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type Mode = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'bypassPermissions' | 'dontAsk';
/** mode null = de standaard uit de Claude Code-settings (permissions.defaultMode). */
export type TaskInfo = {
  id: string;
  kind: 'agent' | 'bash' | 'other';
  description: string;
  subagentType?: string;
  status: string;
  background: boolean;
  toolUseId?: string;
  toolUses?: number;
  tokens?: number;
  durationMs?: number;
  lastTool?: string;
  summary?: string;
  hasOutput: boolean;
  /** Moment (ms) waarop de taak klaar, mislukt of gestopt is. */
  endedAt?: number;
};
export type McpInfo = { name: string; status: string; scope?: string; error?: string; tools: number };
export type NamedItem = { name: string; description: string };
export type ManageInfo = { mcp: McpInfo[]; commands: NamedItem[]; agents: NamedItem[] };
export type UsageReport = {
  windows: { label: string; percentage: number; resets?: string; resetsAt?: number }[];
  /** Per periode ("Last 24h", "Last 7d"): de grootste veroorzakers en de top-skills/subagents/MCP-servers. */
  sections: { title: string; items: { percentage: number; text: string }[]; tops: string[] }[];
  notes: string[];
  fetchedAt: number;
  raw: string;
};
export type QuestionOption = { label: string; description: string; preview?: string };
export type Question = { question: string; header: string; options: QuestionOption[]; multiSelect: boolean };
export type Thema = 'systeem' | 'licht' | 'donker';
export type UiSettings = { opacity: number; sidebarOpen: boolean; dockWidth: number; dockSide: 'left' | 'right'; thema: Thema; meldingen: boolean; accent: string | null; speechLanguage: 'nl' | 'en' | 'auto'; speechModel: 'base' | 'small' | 'turbo'; promptSuggestions: boolean; shortcuts: Record<string, string> };
export type SavedTab = { cwd: string; sessionId: string | null };
export type SavedTabs = { tabs: SavedTab[]; active: number };
export type Settings = { model: string | null; effort: Effort | null; mode: Mode | null };
export type ModelOption = { value: string; label: string; efforts: Effort[] };
export type LimitWindow = { percentage: number; resetsAt: number };
export type Limits = { fiveHour?: LimitWindow; sevenDay?: LimitWindow };

export type MemoryFile = { label: string; path: string; exists: boolean; content: string };
export type ScopeSettings = {
  scope: 'user' | 'project' | 'local';
  path: string;
  allow: string[];
  ask: string[];
  deny: string[];
  hooks: { event: string; matcher: string; command: string }[];
  error?: string;
};
export type ConfigInfo = { memory: MemoryFile[]; scopes: ScopeSettings[] };
/** Uitvoer van `claude auth status --json` (de velden die de app gebruikt); error als die niet te lezen was. */
export type AuthStatus = { loggedIn: boolean; authMethod: string; email?: string; orgName?: string; subscriptionType?: string; error?: string };
export type TokenCount = { name: string; tokens: number };
/** Wat er los van het gesprek zelf standaard in de context staat. */
export type ContextBreakdown = { categories: TokenCount[]; memoryFiles: TokenCount[]; mcpServers: TokenCount[] };
export type ContextInfo = { percentage: number; totalTokens: number; maxTokens: number; breakdown?: ContextBreakdown };

export type ServerEvent =
  | { type: 'hello'; apiKeyPresent: boolean; recent: string[]; root: string; models: ModelOption[]; limits: Limits; tabs: SavedTabs; ui: UiSettings; terminal: boolean }
  | ({ type: 'settings' } & Settings)
  | { type: 'root'; root: string; recent: string[] }
  | { type: 'limits'; limits: Limits }
  | { type: 'usage_report'; report: UsageReport }
  | ({ type: 'context' } & ContextInfo)
  | { type: 'dirs'; path: string; dirs: string[] }
  | { type: 'folder'; path: string; parent: string | null; dirs: { name: string; readable: boolean }[]; error?: string }
  | { type: 'project'; cwd: string; recent: string[] }
  | { type: 'sessions'; sessions: SessionSummary[] }
  | { type: 'history'; sessionId: string; items: ChatItem[] }
  | { type: 'init'; sessionId: string; model: string; cwd: string; permissionMode: string; apiKeySource: string }
  | { type: 'text_start'; id: string }
  | { type: 'text_delta'; id: string; text: string }
  | { type: 'text_end'; id: string }
  | { type: 'tool_start'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_end'; id: string; output: string; isError: boolean }
  | {
      type: 'permission_request';
      id: string;
      toolName: string;
      input: Record<string, unknown>;
      title?: string;
      reason?: string;
      canAlways: boolean;
    }
  | { type: 'permission_cancelled'; id: string }
  | { type: 'result'; costUsd: number; usage: Usage; durationMs: number; isError: boolean; errorText?: string }
  | { type: 'running'; running: boolean }
  /** Een beurt die niet door een bericht van de gebruiker begon. */
  | { type: 'turn_started'; reason: string }
  | { type: 'marker'; text: string }
  | { type: 'prompt_suggestion'; suggestion: string }
  | { type: 'tasks'; tasks: TaskInfo[] }
  | { type: 'sub_activity'; parentId: string; id: string; kind: 'tool' | 'text'; label: string }
  | ({ type: 'manage' } & ManageInfo)
  | ({ type: 'config' } & ConfigInfo)
  | { type: 'task_output'; taskId: string; output: string }
  | { type: 'subagent'; toolUseId: string; items: ChatItem[]; live?: boolean }
  | { type: 'question'; id: string; questions: Question[] }
  | { type: 'question_cancelled'; id: string }
  | { type: 'shell_result'; id: string; command: string; output: string; exitCode: number }
  /** Een /-command dat alleen in de terminal werkt: de app biedt aan het in de ingebouwde terminal te openen. */
  | { type: 'needs_terminal'; command: string }
  /** Niet (meer) ingelogd: de app opent het inlogscherm. */
  | { type: 'needs_login' }
  | { type: 'auth_status'; status: AuthStatus }
  /** url: de inloglink die `claude auth login` print, voor als de browser niet opent. */
  | { type: 'auth_login'; state: 'waiting' | 'done' | 'failed'; url?: string; error?: string }
  | { type: 'pty_started'; id: string; command: string }
  | { type: 'pty_data'; id: string; data: string }
  | { type: 'pty_exit'; id: string; code: number }
  | { type: 'image'; id: string; path: string; dataUrl: string | null; error?: string }
  | { type: 'notice'; message: string }
  | { type: 'error'; message: string };

export type ClientEvent =
  | { type: 'list_dirs' }
  | { type: 'list_folder'; path?: string }
  | { type: 'set_root'; path: string }
  | { type: 'open_project'; cwd: string }
  | { type: 'new_session' }
  | { type: 'resume_session'; sessionId: string; cwd: string }
  | { type: 'move_session'; sessionId: string; cwd: string }
  | { type: 'rename_session'; sessionId: string; title: string }
  | { type: 'send'; text: string; attachments: Attachment[]; force?: boolean }
  | { type: 'interrupt' }
  | { type: 'set_model'; model: string }
  | { type: 'set_effort'; effort: Effort }
  | { type: 'set_mode'; mode: Mode }
  | ({ type: 'save_tabs' } & SavedTabs)
  | ({ type: 'save_ui' } & UiSettings)
  /** answers null: de vraag overgeslagen. */
  | { type: 'question_response'; id: string; answers: Record<string, string> | null; chat?: boolean }
  | { type: 'shell'; id: string; command: string }
  /** Start de echte Claude Code in een terminal, met deze argumenten (bv. ["/mcp"]). */
  /** args: de echte Claude Code met deze argumenten; shell: een gewone shell waarin dit commando wordt uitgevoerd. */
  | { type: 'pty_start'; id: string; args?: string[]; shell?: string; cols: number; rows: number }
  | { type: 'read_image'; id: string; path: string }
  | { type: 'pty_input'; id: string; data: string }
  | { type: 'pty_resize'; id: string; cols: number; rows: number }
  | { type: 'pty_kill'; id: string }
  | { type: 'stop_task'; taskId: string }
  | { type: 'task_output'; taskId: string }
  | { type: 'manage' }
  | { type: 'config' }
  | { type: 'save_memory'; path: string; content: string }
  | { type: 'permission_rule'; scope: ScopeSettings['scope']; list: 'allow' | 'ask' | 'deny'; rule: string; remove: boolean }
  | { type: 'usage' }
  | { type: 'auth_status' }
  | { type: 'auth_login'; console: boolean; sso: boolean; email: string }
  /** De code van de inlogpagina, als de browser niet automatisch terugkoppelt. */
  | { type: 'auth_code'; code: string }
  | { type: 'auth_cancel' }
  | { type: 'auth_logout' }
  | { type: 'subagent'; toolUseId: string }
  | { type: 'mcp_toggle'; name: string; enabled: boolean }
  | { type: 'mcp_reconnect'; name: string }
  | { type: 'permission_response'; id: string; decision: PermissionDecision };
