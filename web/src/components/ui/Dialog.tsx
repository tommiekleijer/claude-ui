import { ReactNode, useEffect } from 'react';
import styles from './ui.module.scss';

type DialogProps = { title: ReactNode; footer?: ReactNode; children: ReactNode; onClose?: () => void; wide?: boolean };

const Dialog = ({ title, footer, children, onClose, wide }: DialogProps) => {
  useEffect(() => {
    if (!onClose) {
      return undefined;
    }
    const handleKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
      <div className={wide ? `${styles.dialog} ${styles.wide}` : styles.dialog} role="dialog" aria-modal="true">
        <div className={styles.dialogHeader}>{title}</div>
        <div className={styles.dialogBody}>{children}</div>
        {footer && <div className={styles.dialogFooter}>{footer}</div>}
      </div>
    </div>
  );
};

export default Dialog;
