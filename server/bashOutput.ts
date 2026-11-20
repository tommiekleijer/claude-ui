import type { HookCallback } from '@anthropic-ai/claude-agent-sdk';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Boven de BASH_MAX_OUTPUT_LENGTH van Claude Code (standaard 30000) bewaart de CLI de uitvoer zelf en krijgt Claude een
// voorproefje met het pad; daar blijven we af. Dit raakt dus alleen uitvoer tussen deze grens en die van de CLI.
const MIN_LENGTH = 8000;
const HEAD = 40;
const TAIL = 60;
const CONTEXT = 3;
// Alleen de contextregels rond fouten worden hierdoor begrensd; de foutregels zelf blijven altijd staan.
const MAX_CONTEXT_LINES = 400;

// Alleen commando's die typisch veel ruis geven (tests, builds, installs, logs); bij de rest wil Claude meestal alles zien.
const NOISY =
  /(^|[\s;&|(/.])(npm|npx|pnpm|yarn|bun|make|composer|pip3?|poetry|uv|pytest|tox|phpunit|phpstan|psalm|php-cs-fixer|jest|vitest|mocha|playwright|tsc|eslint|ruff|mypy|cargo|mvn|gradlew?|dotnet|bundle|rspec|rake|apt(-get)?|brew|webpack|vite|vendor\/bin\/\S+|go\s+(test|build|vet|mod)|docker(\s+compose|-compose)?\s+(build|pull|up|logs)|kubectl\s+logs)\b/;
// Claude filtert al zelf of wil de inhoud letterlijk zien.
const EXPLICIT =
  /(^|[\s;&|(])(cat|bat|less|more|head|tail|sed|awk|grep|egrep|rg|jq|yq|cut|wc|sort|uniq|nl|xxd|od|diff)\b|\bgit\s+(diff|show|log|blame)\b/;

const IMPORTANT =
  /error|fail|warn|exception|fatal|panic|traceback|denied|cannot|unable|not found|undefined|segmentation|✗|✖|✘|❌|^\s*(tests?|test suites|summary|total|ok \(|failures!)\b|\b\d+\s+(passed|failed|skipped|errors?)\b/i;

const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(\x07|\x1b\\)|\x1b[@-Z\\-_]/g;
// Een voortgangsbalk met een percentage of teller, of alleen een spinner met een percentage.
const BAR = /[█▓▒░■□▏▎▍▌▋▊▉]{3,}|\[[=#>.\- ]{5,}\]/;
const AMOUNT = /\d{1,3}(\.\d+)?\s*%|\d+\s*\/\s*\d+/;
const SPINNER = /^[\s⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏|/\\-]*\d{1,3}(\.\d+)?\s*%\s*$/;
const isProgress = (line: string) => ((BAR.test(line) && AMOUNT.test(line)) || SPINNER.test(line)) && !IMPORTANT.test(line);

const omitted = (count: number) => `[… ${count} regels weggelaten door claude-ui …]`;

/** ANSI-codes en voortgangsbalken weg, herhaalde regels samengevoegd. */
const clean = (text: string) => {
  const lines: string[] = [];
  let repeats = 0;
  for (const raw of text.replace(ANSI, '').split('\n')) {
    // Met \r overschreven regels (voortgang): alleen wat er uiteindelijk stond.
    const line = raw.split('\r').filter(Boolean).pop() ?? '';
    if (isProgress(line)) {
      continue;
    }
    if (line.trim() && line === lines[lines.length - 1]) {
      repeats += 1;
      continue;
    }
    if (repeats) {
      lines.push(`[… vorige regel nog ${repeats} keer herhaald, weggelaten door claude-ui …]`);
      repeats = 0;
    }
    lines.push(line);
  }
  if (repeats) {
    lines.push(`[… vorige regel nog ${repeats} keer herhaald, weggelaten door claude-ui …]`);
  }
  return lines;
};

/**
 * Kop, staart en regels met fouten/waarschuwingen (met wat context) blijven staan; de rest wordt een markering.
 * `dropped`: aantal regels met inhoud dat echt weg is (niet de voortgangsbalken en samengevoegde herhalingen).
 */
export const compact = (text: string) => {
  const lines = clean(text);
  if (lines.join('\n').length <= MIN_LENGTH || lines.length <= HEAD + TAIL) {
    return { text: lines.join('\n'), dropped: 0 };
  }
  const keep = new Set<number>();
  for (let i = 0; i < HEAD; i++) {
    keep.add(i);
  }
  for (let i = lines.length - TAIL; i < lines.length; i++) {
    keep.add(i);
  }
  const important = lines.flatMap((line, i) => (i >= HEAD && i < lines.length - TAIL && IMPORTANT.test(line) ? [i] : []));
  important.forEach((i) => keep.add(i));
  let context = 0;
  for (const i of important) {
    for (let j = Math.max(0, i - CONTEXT); j <= Math.min(lines.length - 1, i + CONTEXT) && context < MAX_CONTEXT_LINES; j++) {
      if (!keep.has(j)) {
        keep.add(j);
        context += 1;
      }
    }
  }
  const result: string[] = [];
  let gap = 0;
  lines.forEach((line, i) => {
    if (!keep.has(i)) {
      gap += 1;
      return;
    }
    if (gap) {
      result.push(omitted(gap));
      gap = 0;
    }
    result.push(line);
  });
  return { text: result.join('\n'), dropped: lines.length - keep.size };
};

type BashResponse = {
  stdout: string;
  stderr: string;
  isImage?: boolean;
  backgroundTaskId?: string;
  persistedOutputPath?: string;
  structuredContent?: unknown[];
};

/**
 * PostToolUse-hook voor Bash: lange, ruisachtige uitvoer compacter maken voordat Claude hem leest.
 * Een commando met een foutcode komt hier niet langs: de CLI meldt dat als PostToolUseFailure, en die kan de uitvoer niet vervangen.
 */
export const compactBashOutput: HookCallback = async (input) => {
  if (input.hook_event_name !== 'PostToolUse' || input.tool_name !== 'Bash') {
    return {};
  }
  const command = String((input.tool_input as { command?: unknown }).command ?? '');
  const response = input.tool_response as BashResponse;
  if (
    typeof response?.stdout !== 'string' ||
    typeof response.stderr !== 'string' ||
    response.isImage ||
    response.backgroundTaskId ||
    response.persistedOutputPath ||
    response.structuredContent?.length ||
    !NOISY.test(command) ||
    EXPLICIT.test(command)
  ) {
    return {};
  }
  const long = (text: string) => text.length > MIN_LENGTH;
  if (!long(response.stdout) && !long(response.stderr)) {
    return {};
  }
  const stdout = long(response.stdout) ? compact(response.stdout) : { text: response.stdout, dropped: 0 };
  const stderr = long(response.stderr) ? compact(response.stderr) : { text: response.stderr, dropped: 0 };
  if (stdout.text === response.stdout && stderr.text === response.stderr) {
    return {};
  }
  let note = '';
  if (stdout.dropped + stderr.dropped > 0) {
    // Dezelfde map waarin de CLI zelf te lange uitvoer bewaart (<sessie>/tool-results naast het transcript): die mag Claude zonder prompt lezen.
    const dir = path.join(path.dirname(input.transcript_path), input.session_id, 'tool-results');
    const file = path.join(dir, `${input.tool_use_id}.txt`);
    await mkdir(dir, { recursive: true });
    await writeFile(file, response.stderr ? `${response.stdout}\n--- stderr ---\n${response.stderr}` : response.stdout);
    note = `[claude-ui heeft deze lange uitvoer ingekort; de volledige uitvoer staat in ${file}]\n`;
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      updatedToolOutput: { ...response, stdout: `${note}${stdout.text}`, stderr: stderr.text },
    },
  };
};
