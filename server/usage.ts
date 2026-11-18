import { query } from '@anthropic-ai/claude-agent-sdk';
import { homedir } from 'node:os';
import type { Limits, UsageReport } from '../shared/protocol.js';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// "Nov 18, 1pm" / "Nov 20, 7:30pm" (lokale tijd) -> epoch-seconden
const parseReset = (text: string): number | undefined => {
  const m = text.match(/([A-Za-z]{3})\w* (\d{1,2}),? (\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (!m) {
    return undefined;
  }
  const month = MONTHS.indexOf(m[1].toLowerCase());
  let hour = Number(m[3]) % 12;
  if (m[5].toLowerCase() === 'pm') {
    hour += 12;
  }
  const now = new Date();
  const date = new Date(now.getFullYear(), month, Number(m[2]), hour, Number(m[4] ?? 0));
  if (date.getTime() < now.getTime() - 180 * 86400 * 1000) {
    date.setFullYear(now.getFullYear() + 1);
  }
  return Math.round(date.getTime() / 1000);
};

/**
 * Leest de tekst van Claude Code's /usage (een lokaal command: geen tokens) en zet die om in een overzicht.
 * Contract: regels als "Current session: 43% used · resets Nov 18, 1pm (Europe/Amsterdam)" en
 * onder "What's contributing" per periode ("Last 24h …") regels als "  88%  Start fresh when …" en "Top subagents: …".
 */
export const parseUsage = (text: string): UsageReport => {
  const windows: UsageReport['windows'] = [];
  const sections: UsageReport['sections'] = [];
  const notes: string[] = [];
  let inContributors = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const win = line.match(/^(Current [^:]+):\s*(\d+)% used(?:\s*·\s*resets (.+))?$/);
    if (win) {
      windows.push({
        label: win[1]
          .replace('Current session', 'Huidige sessie (5 uur)')
          .replace('Current week (all models)', 'Deze week (alle modellen)')
          .replace(/Current week \((.+)\)/, 'Deze week ($1)'),
        percentage: Number(win[2]),
        resets: win[3]?.replace(/\s*\([^)]*\)\s*$/, ''),
        resetsAt: win[3] ? parseReset(win[3]) : undefined,
      });
      continue;
    }
    if (/^What's contributing/i.test(line)) {
      inContributors = true;
      continue;
    }
    if (!inContributors || !line) {
      continue;
    }
    if (/^Last \w+/.test(line)) {
      sections.push({ title: line.replace(/^Last 24h/, 'Laatste 24 uur').replace(/^Last 7d/, 'Laatste 7 dagen'), items: [], tops: [] });
      continue;
    }
    const current = sections[sections.length - 1];
    const item = raw.match(/^\s+(\d+)%\s+(.+)$/);
    if (current && item) {
      current.items.push({ percentage: Number(item[1]), text: item[2].trim() });
    } else if (current && /^Top /.test(line)) {
      current.tops.push(line);
    } else {
      notes.push(line);
    }
  }
  return { windows, sections, notes, fetchedAt: Date.now(), raw: text };
};

export const fetchUsage = async (): Promise<UsageReport | null> => {
  // persistSession: false, anders komt elke aanroep als losse sessie in ~/.claude/projects.
  const q = query({
    prompt: '/usage',
    options: { cwd: homedir(), env: { ...process.env }, settingSources: ['user'], persistSession: false },
  });
  try {
    for await (const message of q) {
      if (message.type === 'result' && message.subtype === 'success') {
        return parseUsage(message.result);
      }
    }
  } finally {
    q.close();
  }
  return null;
};

/** Zet de 5-uurs- en weeklimiet uit het overzicht om naar de statusbalk-limieten. */
export const limitsFromReport = (report: UsageReport): Limits => {
  const [session, week] = [
    report.windows.find((w) => w.label.startsWith('Huidige sessie')),
    report.windows.find((w) => w.label.startsWith('Deze week (alle')),
  ];
  return {
    fiveHour: session?.resetsAt ? { percentage: session.percentage, resetsAt: session.resetsAt } : undefined,
    sevenDay: week?.resetsAt ? { percentage: week.percentage, resetsAt: week.resetsAt } : undefined,
  };
};
