import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import { jumpToQuote } from '../../quoteJump';
import CodeBlock from './CodeBlock';
import InlineCode from './InlineCode';
import remarkPaden from './remarkPaden';
import styles from './Markdown.module.scss';

/** `jumpToQuotes`: een citaat (blockquote) in je eigen bericht is klikbaar en brengt je naar het bericht waaruit het komt. */
const Markdown = ({ text, jumpToQuotes = false }: { text: string; jumpToQuotes?: boolean }) => (
  <div className={styles.markdown}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks, remarkPaden]}
      rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      components={{
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        blockquote: ({ children }) =>
          jumpToQuotes ? (
            <blockquote
              className={styles.jumpable}
              title="Ga naar het oorspronkelijke bericht"
              onClick={(event) => !window.getSelection()?.toString() && jumpToQuote(event.currentTarget.textContent ?? '', event.currentTarget)}
            >
              {children}
            </blockquote>
          ) : (
            <blockquote>{children}</blockquote>
          ),
        // Blokcode (in <pre>, met hljs/language-klasse of meerdere regels) blijft gewone code.
        code: ({ className, children, ...rest }) =>
          (rest as Record<string, unknown>)['data-pad'] ? (
            <InlineCode forcePath>{children}</InlineCode>
          ) : className || (typeof children === 'string' && children.includes('\n')) ? (
            <code className={className}>{children}</code>
          ) : (
            <InlineCode>{children}</InlineCode>
          ),
      }}
    >
      {text}
    </ReactMarkdown>
  </div>
);

export default memo(Markdown);
