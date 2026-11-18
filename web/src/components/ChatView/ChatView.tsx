import { Loader2, Paperclip, X, Zap } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';
import type { ChatItem } from '../../../../shared/protocol';
import { dequeue, imageUrls, prioritize, TabIdContext, useApp, useTabState } from '../../store';
import ImagePreview from '../ui/ImagePreview';
import Markdown from '../Markdown/Markdown';
import QuoteButton from './QuoteButton';
import ToolCard from '../ToolCard/ToolCard';
import { Chip, Knop } from '../../vertex';
import styles from './ChatView.module.scss';

/** Meegestuurde afbeeldingen als miniaturen; klik voor groot. */
const ChatImages = ({ images }: { images: string[] }) => {
  const [big, setBig] = useState<string | null>(null);
  return (
    <>
      <div className={styles.images}>
        {images.map((src, index) => (
          <img key={index} src={src} alt="Bijlage" onClick={() => setBig(src)} />
        ))}
      </div>
      {big && <ImagePreview src={big} name="Bijlage" onClose={() => setBig(null)} />}
    </>
  );
};

export const renderItem = (item: ChatItem) => {
  switch (item.kind) {
    case 'user':
      return (
        <div key={item.id} className={styles.user}>
          {item.text && (
            <div className={styles.userText} data-quotable>
              <Markdown text={item.text} jumpToQuotes />
            </div>
          )}
          {item.images && item.images.length > 0 && <ChatImages images={item.images} />}
          {item.attachments.length > 0 && (
            <div className={styles.attachments}>
              {item.attachments.map((name, index) => (
                <Chip key={index}>
                  <Paperclip size={12} />
                  {name}
                </Chip>
              ))}
            </div>
          )}
        </div>
      );
    case 'assistant':
      return (
        <div key={item.id} data-quotable className={item.streaming ? `${styles.assistant} ${styles.streaming}` : styles.assistant}>
          <Markdown text={item.text} />
        </div>
      );
    case 'tool':
      return <ToolCard key={item.id} tool={item} />;
    case 'marker':
      return (
        <div key={item.id} className={styles.marker}>
          {item.text}
        </div>
      );
  }
};

/** Eén per tabblad; blijft opgebouwd als je wisselt, zodat terugwisselen direct is. */
const ChatView = ({ tabId, active }: { tabId: number; active: boolean }) => {
  const items = useTabState(tabId, (s) => s.items);
  const running = useTabState(tabId, (s) => s.running);
  const cwd = useTabState(tabId, (s) => s.cwd);
  const queue = useTabState(tabId, (s) => s.queue);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const last = items[items.length - 1];
  const showTyping = running && !(last?.kind === 'assistant' && last.streaming);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && (stick.current || last?.kind === 'user')) {
      el.scrollTop = el.scrollHeight;
    }
  }, [items, showTyping, last, queue.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      if (stick.current) {
        el.scrollTop = el.scrollHeight;
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (el) {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    }
  };

  return (
    <div
      ref={scrollRef}
      className={active ? styles.scroller : `${styles.scroller} ${styles.hidden}`}
      onScroll={handleScroll}
      aria-live={active ? 'polite' : 'off'}
      aria-hidden={!active}
      aria-busy={running}
    >
      <TabIdContext.Provider value={tabId}>
      <div className={styles.inner}>
        {items.length === 0 && !running && (
          <div className={styles.empty}>{cwd ? `Claude Code werkt in ${cwd}` : 'Kies eerst een project'}</div>
        )}
        {items.map(renderItem)}
        {showTyping && (
          <div className={styles.typing}>
            <span />
            <span />
            <span />
          </div>
        )}
        {queue
          .filter((q) => !q.resumed)
          .map((q) => (
            <div key={`queued-${q.id}`} className={`${styles.user} ${styles.queued}`}>
              {q.text && (
                <div className={styles.userText}>
                  <Markdown text={q.text} />
                </div>
              )}
              <ChatImages images={imageUrls(q.attachments)} />
              {q.attachments.some((a) => a.kind !== 'image') && (
                <div className={styles.attachments}>
                  {q.attachments.filter((a) => a.kind !== 'image').map((a, index) => (
                    <Chip key={index}>
                      <Paperclip size={12} />
                      {a.name}
                    </Chip>
                  ))}
                </div>
              )}
              <div className={styles.queuedBar}>
                <span>In wachtrij</span>
                <Knop
                  variant="tertiair"
                  maat="s"
                  icoon={<Zap size={14} />}
                  onClick={() => prioritize(q.id)}
                  title="Claude onderbreken en dit bericht nu versturen"
                >
                  Nu versturen
                </Knop>
                <button
                  type="button"
                  className={styles.dequeue}
                  onClick={() => dequeue(q.id)}
                  aria-label="Uit wachtrij halen"
                  title="Uit wachtrij halen"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
      </div>
      </TabIdContext.Provider>
    </div>
  );
};

/** Chatweergaven van alle bezochte tabbladen; een nieuw tabblad wordt op de achtergrond opgebouwd. */
export const ChatArea = () => {
  const tabIds = useApp((s) => s.tabIds);
  const activeId = useApp((s) => s.activeId);
  const [mounted, setMounted] = useState<number[]>([]);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!mounted.includes(activeId)) {
      startTransition(() => setMounted((m) => [...m, activeId]));
    }
  }, [activeId, mounted]);

  const live = mounted.filter((id) => tabIds.includes(id));
  return (
    <div className={styles.area}>
      <QuoteButton />
      {live.map((id) => (
        <ChatView key={id} tabId={id} active={id === activeId} />
      ))}
      {!live.includes(activeId) && (
        <div className={styles.loading}>
          <Loader2 size={22} />
        </div>
      )}
    </div>
  );
};

export default ChatView;
