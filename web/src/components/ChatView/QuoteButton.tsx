import { Quote } from 'lucide-react';
import { useEffect, useState } from 'react';
import { quoteInComposer } from '../../store';
import { Knop } from '../../vertex';
import styles from './ChatView.module.scss';

type Selected = { text: string; left: number; top: number };

/** Zweeft bij geselecteerde tekst in de chat (element met data-quotable) en zet die als citaat in het invoerveld. */
const QuoteButton = () => {
  const [selected, setSelected] = useState<Selected | null>(null);

  useEffect(() => {
    const show = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? '';
      if (!selection || selection.rangeCount === 0 || !text) {
        setSelected(null);
        return;
      }
      const range = selection.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      if (!element?.closest('[data-quotable]')) {
        setSelected(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      // Boven de selectie; onder de selectie als er bovenaan geen ruimte is (tabbalk).
      const top = rect.top > 96 ? rect.top - 40 : rect.bottom + 8;
      setSelected({ text, left: Math.min(Math.max(rect.right - 80, 8), window.innerWidth - 120), top });
    };
    const hide = () => {
      if (!window.getSelection()?.toString().trim()) {
        setSelected(null);
      }
    };
    const onMouseUp = () => setTimeout(show, 0);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keyup', onMouseUp);
    document.addEventListener('selectionchange', hide);
    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keyup', onMouseUp);
      document.removeEventListener('selectionchange', hide);
    };
  }, []);

  if (!selected) {
    return null;
  }
  return (
    <div className={styles.quoteButton} style={{ left: selected.left, top: selected.top }} onMouseDown={(event) => event.preventDefault()}>
      <Knop
        variant="primair"
        maat="s"
        icoon={<Quote size={14} />}
        onClick={() => {
          quoteInComposer(selected.text);
          window.getSelection()?.removeAllRanges();
          setSelected(null);
        }}
      >
        Reageer hierop
      </Knop>
    </div>
  );
};

export default QuoteButton;
