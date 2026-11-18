const COMMANDS = new Set([
  'cd', 'make', 'npm', 'npx', 'pnpm', 'yarn', 'bun', 'bunx', 'node', 'git', 'gh', 'docker', 'kubectl', 'helm',
  'claude', 'composer', 'php', 'python', 'python3', 'pip', 'uv', 'ls', 'cat', 'tail', 'head', 'less', 'grep', 'rg',
  'find', 'curl', 'wget', 'ssh', 'scp', 'sudo', 'bash', 'sh', 'zsh', 'sops', 'terraform', 'gcloud', 'gsutil',
  'apt', 'brew', 'cp', 'mv', 'mkdir', 'rm', 'touch', 'chmod', 'systemctl', 'journalctl', 'code', 'wsl', 'export',
  'source', 'echo', 'mysql', 'psql', 'symfony', 'vendor/bin/phpunit', 'go', 'cargo', 'tsc', 'vite',
]);

/** Ziet de tekst eruit als een shell-commando dat je kunt uitvoeren? */
export const looksLikeCommand = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed || trimmed.length > 2000) {
    return false;
  }
  const first = trimmed.replace(/^\$\s+/, '').split(/\s+/)[0];
  return COMMANDS.has(first) || first.startsWith('./') || /\s&&\s/.test(trimmed);
};

/** Commando zonder voorafgaande "$ "-prompts. */
export const cleanCommand = (text: string) =>
  text
    .trim()
    .split('\n')
    .map((line) => line.replace(/^\$\s+/, ''))
    .join('\n');

export const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg)$/i;

/** Een bestandspad zoals `server/session.ts:120`, `~/foo/bar.md` of `/home/x/foto.png`. */
export const looksLikePath = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed) || /^[a-z]+:\/\//i.test(trimmed)) {
    return false;
  }
  const withoutLine = trimmed.replace(/:\d+(:\d+)?$/, '');
  return /^(~?\/|\.\.?\/)/.test(withoutLine) || (/\//.test(withoutLine) && /\.[a-z0-9]{1,8}$/i.test(withoutLine)) || /^[\w.-]+\.[a-z0-9]{1,8}$/i.test(withoutLine);
};
