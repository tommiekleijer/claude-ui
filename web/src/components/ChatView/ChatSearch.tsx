import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { matchesShortcut } from '../../shortcuts';
import { useApp, useStore } from '../../store';
import styles from './ChatView.module.scss';

const activeScroller = () => document.querySelector<HTMLElement>('[aria-live][aria-hidden="false"]');

/** Alle voorkomens van `query` in de zichtbare tekst van de chat (niet in dichtgeklapte tool-kaarten). */
const findRanges = (root: HTMLElement, query: string) => {
  const needle = query.toLowerCase();
  const ranges: Range[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement;
    const closed = parent?.closest('details:not([open])');
    if (closed && !parent?.closest('summary')) {
      continue;
    }
    const text = (node.textContent ?? '').toLowerCase();
    for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) {
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + needle.length);
      ranges.push(range);
    }
  }
  return ranges;
};

/** Zoeken in de chat van het actieve tabblad, met markeringen (CSS Highlight API, zonder de DOM te wijzigen). */
const ChatSearch = () => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Range[]>([]);
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeId = useApp((s) => s.activeId);
  const items = useStore((s) => s.items);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (matchesShortcut(event, 'search')) {
        event.preventDefault();
        setOpen(true);
        requestAnimationFrame(() => inputRef.current?.select());
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    const scroller = activeScroller();
    const found = open && query && scroller ? findRanges(scroller, query) : [];
    setMatches(found);
    setIndex((i) => Math.min(i, Math.max(found.length - 1, 0)));
    if (found.length) {
      CSS.highlights.set('zoek', new Highlight(...found));
    } else {
      CSS.highlights.delete('zoek');
    }
  }, [open, query, activeId, items]);

  useEffect(() => {
    const range = matches[index];
    const scroller = activeScroller();
    if (!range || !scroller) {
      CSS.highlights.delete('zoek-actief');
      return;
    }
    CSS.highlights.set('zoek-actief', new Highlight(range));
    const rect = range.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    if (rect.top < box.top + 40 || rect.bottom > box.bottom - 40) {
      scroller.scrollTop += rect.top - box.top - box.height / 2;
    }
  }, [matches, index]);

  const close = () => {
    setOpen(false);
    CSS.highlights.delete('zoek');
    CSS.highlights.delete('zoek-actief');
  };
  const step = (delta: number) => matches.length && setIndex((i) => (i + delta + matches.length) % matches.length);

  if (!open) {
    return null;
  }
  return (
    <div className={styles.search} role="search">
      <Search size={14} />
      <input
        ref={inputRef}
        value={query}
        placeholder="Zoeken in deze chat"
        aria-label="Zoeken in deze chat"
        onChange={(event) => {
          setQuery(event.target.value);
          setIndex(0);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            step(event.shiftKey ? -1 : 1);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            close();
          }
        }}
        autoFocus
      />
      <span className={styles.searchCount}>{query ? (matches.length ? `${index + 1} van ${matches.length}` : 'Geen resultaten') : ''}</span>
      <button type="button" className={styles.searchButton} aria-label="Vorige" title="Vorige (Shift+Enter)" onClick={() => step(-1)}>
        <ChevronUp size={14} />
      </button>
      <button type="button" className={styles.searchButton} aria-label="Volgende" title="Volgende (Enter)" onClick={() => step(1)}>
        <ChevronDown size={14} />
      </button>
      <button type="button" className={styles.searchButton} aria-label="Zoeken sluiten" title="Sluiten (Esc)" onClick={close}>
        <X size={14} />
      </button>
    </div>
  );
};

export default ChatSearch;
