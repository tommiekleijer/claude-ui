import type { SessionMessage } from '@anthropic-ai/claude-agent-sdk';
import type { ChatItem, ToolItem } from '../shared/protocol.js';

type Block = { type: string; [key: string]: unknown };
type ApiMessage = { id?: string; content?: string | Block[] };

type AssistantBlock =
  | { kind: 'text'; id: string; text: string }
  | { kind: 'tool'; id: string; name: string; input: Record<string, unknown> };

const blocksOf = (message: unknown): Block[] => {
  const content = (message as ApiMessage | undefined)?.content;
  if (typeof content === 'string') {
    return [{ type: 'text', text: content }];
  }
  return Array.isArray(content) ? content : [];
};

const resultText = (content: unknown): string => {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part: Block) => (part.type === 'text' ? String(part.text) : `[${part.type}]`))
      .join('\n');
  }
  return '';
};

const str = (value: unknown) => (typeof value === 'string' ? value : '');

/** Korte omschrijving van een tool-aanroep: commando, bestand, patroon, … */
export const toolSummary = (input: Record<string, unknown>) =>
  str(input.command) ||
  str(input.file_path) ||
  str(input.pattern) ||
  str(input.url) ||
  str(input.query) ||
  str(input.description);

export const assistantBlocks = (message: unknown): AssistantBlock[] => {
  const messageId = (message as ApiMessage).id ?? '';
  return blocksOf(message).flatMap((block, index): AssistantBlock[] => {
    if (block.type === 'text' && String(block.text).trim()) {
      return [{ kind: 'text', id: `${messageId}:${index}`, text: String(block.text) }];
    }
    if (block.type === 'tool_use') {
      return [
        {
          kind: 'tool',
          id: String(block.id),
          name: String(block.name),
          input: (block.input ?? {}) as Record<string, unknown>,
        },
      ];
    }
    return [];
  });
};

export const toolResults = (message: unknown) =>
  blocksOf(message)
    .filter((block) => block.type === 'tool_result')
    .map((block) => ({
      id: String(block.tool_use_id),
      output: resultText(block.content),
      isError: Boolean(block.is_error),
    }));

// Door Claude Code zelf ingevoegde berichten (slash-commands, herinneringen) horen niet in de chat.
const isInternalText = (text: string) =>
  /^\s*<(command-|local-command|system-reminder|bash-|task-notification)/.test(text) || text.startsWith('Caveat:');

/** `subagent`: het gesprek van een subagent, waarin elk bericht bij de Agent-tool van de hoofdsessie hoort. */
/** Contextgebruik na het laatste antwoord, uit de token-telling van dat antwoord. */
export const lastContextTokens = (messages: SessionMessage[]) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const entry = messages[i];
    const usage = (entry.message as { usage?: Record<string, number> } | undefined)?.usage;
    if (entry.type === 'assistant' && !entry.parent_tool_use_id && usage) {
      return (
        (usage.input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0) +
        (usage.output_tokens ?? 0)
      );
    }
  }
  return 0;
};

export const historyItems = (messages: SessionMessage[], subagent = false): ChatItem[] => {
  const items: ChatItem[] = [];
  const tools = new Map<string, ToolItem>();

  for (const entry of messages) {
    if (entry.parent_tool_use_id && !subagent) {
      continue;
    }
    if (entry.type === 'assistant') {
      for (const block of assistantBlocks(entry.message)) {
        if (block.kind === 'text') {
          items.push({ kind: 'assistant', id: block.id, text: block.text, streaming: false });
        } else {
          const tool: ToolItem = { kind: 'tool', id: block.id, name: block.name, input: block.input, done: false };
          tools.set(block.id, tool);
          items.push(tool);
        }
      }
    } else if (entry.type === 'user') {
      for (const result of toolResults(entry.message)) {
        const tool = tools.get(result.id);
        if (tool) {
          Object.assign(tool, { output: result.output, isError: result.isError, done: true });
        }
      }
      const blocks = blocksOf(entry.message);
      const allTexts = blocks.filter((b) => b.type === 'text').map((b) => String(b.text));
      const fileNames = allTexts.flatMap((t) => t.match(/^<(?:bestand|bijlage) naam="(.+?)"/)?.[1] ?? []);
      const texts = allTexts.filter((t) => !isInternalText(t) && !/^<(bestand|bijlage) naam="/.test(t));
      const images = blocks.flatMap((b) => {
        const source = b.type === 'image' ? (b.source as { type?: string; media_type?: string; data?: string } | undefined) : undefined;
        return source?.type === 'base64' && source.data ? `data:${source.media_type};base64,${source.data}` : [];
      });
      const attachments = [...blocks.filter((b) => b.type === 'image' && !images.length).map(() => 'afbeelding'), ...fileNames];
      if (texts.length || attachments.length || images.length) {
        items.push({ kind: 'user', id: entry.uuid, text: texts.join('\n\n'), attachments, ...(images.length ? { images } : {}) });
      }
    }
  }
  return items.map((item) => (item.kind === 'tool' ? { ...item, done: true } : item));
};
