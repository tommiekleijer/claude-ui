import { diffLines } from 'diff';
import styles from './ToolCard.module.scss';

const DiffView = ({ oldText, newText }: { oldText: string; newText: string }) => {
  const parts = diffLines(oldText, newText);

  return (
    <pre className={styles.diff}>
      {parts.flatMap((part, partIndex) =>
        part.value
          .replace(/\n$/, '')
          .split('\n')
          .map((line, lineIndex) => {
            const className = part.added ? styles.added : part.removed ? styles.removed : styles.context;
            const sign = part.added ? '+' : part.removed ? '-' : ' ';
            return (
              <span key={`${partIndex}-${lineIndex}`} className={className}>
                {sign} {line}
              </span>
            );
          }),
      )}
    </pre>
  );
};

export default DiffView;
