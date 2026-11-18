import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock';
import InlineCode from './InlineCode';
import remarkPaden from './remarkPaden';
import styles from './Markdown.module.scss';

const Markdown = ({ text }: { text: string }) => (
  <div className={styles.markdown}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks, remarkPaden]}
      rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
      components={{
        pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
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
