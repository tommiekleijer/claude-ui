import { Check, Copy, Play } from 'lucide-react';
import { isValidElement, ReactNode, useRef, useState } from 'react';
import { runInTerminal } from '../../store';
import { cleanCommand, looksLikeCommand } from './detect';
import { Icoonknop } from '../../vertex';
import styles from './Markdown.module.scss';

const SHELL_LANGUAGES = /language-(bash|sh|shell|zsh|console|shell-session)\b/;

const CodeBlock = ({ children }: { children: ReactNode }) => {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(ref.current?.innerText ?? '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const className = isValidElement<{ className?: string }>(children) ? (children.props.className ?? '') : '';
  const isShell =
    SHELL_LANGUAGES.test(className) ||
    (!/language-(?!plaintext|text)/.test(className) && looksLikeCommand(ref.current?.innerText ?? textOf(children)));

  return (
    <div className={styles.codeBlock}>
      <span className={styles.codeActions}>
        {isShell && (
          <Icoonknop
            maat={32}
            aria-label="Uitvoeren in de terminal"
            title="Uitvoeren in de terminal"
            onClick={() => runInTerminal(cleanCommand(ref.current?.innerText ?? ''))}
          >
            <Play size={14} />
          </Icoonknop>
        )}
        <Icoonknop maat={32} aria-label={copied ? 'Gekopieerd' : 'Kopiëren'} title={copied ? 'Gekopieerd' : 'Kopiëren'} onClick={handleCopy}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </Icoonknop>
      </span>
      <pre ref={ref}>{children}</pre>
    </div>
  );
};

const textOf = (node: ReactNode): string => {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(textOf).join('');
  }
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return textOf(node.props.children);
  }
  return '';
};

export default CodeBlock;
