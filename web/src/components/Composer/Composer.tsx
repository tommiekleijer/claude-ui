import { ArrowUp, Clock, Loader2, Mic, Paperclip, Square, X } from 'lucide-react';
import { ClipboardEvent, DragEvent, FormEvent, KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Attachment } from '../../../../shared/protocol';
import { native, NativeFile } from '../../native';
import {
  addUserItem,
  clearConversation,
  clearQuote,
  clearTerminalHint,
  enqueue,
  notify,
  openTerminal,
  openUsage,
  refreshMcpAfterLogin,
  runShellCommand,
  send,
  setLastSent,
  useApp,
  useStore,
} from '../../store';
import { Chip, Icoonknop, Knop } from '../../vertex';
import { loadModel, Recording, startRecording, transcribe } from '../../speech/dictation';
import ImagePreview from '../ui/ImagePreview';
import styles from './Composer.module.scss';
import ModeControl from './ModeControl';
import ModelControls from './ModelControls';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_FILE_BYTES = 100 * 1024 * 1024;

type PendingAttachment = Attachment & { size: number; preview?: string };

const readDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const readAttachment = async (file: File): Promise<PendingAttachment | null> => {
  if (file.size === 0) {
    notify(`${file.name || 'Het bestand'} is leeg en wordt niet meegestuurd.`);
    return null;
  }
  if (file.size > MAX_FILE_BYTES) {
    notify(`${file.name} is te groot (max 100 MB).`);
    return null;
  }
  if (IMAGE_TYPES.includes(file.type)) {
    const dataUrl = await readDataUrl(file);
    const extension = file.type.split('/')[1];
    const name = file.name && file.name !== 'image.png' ? file.name : `plakken-${Date.now()}.${extension}`;
    return { name, kind: 'image', mediaType: file.type, data: dataUrl.split(',')[1], size: file.size, preview: dataUrl };
  }
  if (file.size <= MAX_TEXT_BYTES) {
    const text = await file.text();
    if (!text.includes('\u0000') && !text.includes('\uFFFD')) {
      return { name: file.name, kind: 'text', mediaType: file.type || 'text/plain', data: text, size: file.size };
    }
  }
  const dataUrl = await readDataUrl(file);
  return {
    name: file.name,
    kind: 'file',
    mediaType: file.type || 'application/octet-stream',
    data: dataUrl.split(',')[1] ?? '',
    size: file.size,
  };
};

// Bestandsbeheerders zetten gekopieerde bestanden als file://-uri's op het klembord; de browser mag die niet lezen.
const pathsFromUriList = (text: string) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('file://'))
    .map((uri) => decodeURIComponent(new URL(uri).pathname));

const formatSize = (bytes: number) =>
  bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;

const Composer = () => {
  const cwd = useStore((s) => s.cwd);
  const running = useStore((s) => s.running);
  const terminalHint = useStore((s) => s.terminalHint);
  const promptSuggestion = useStore((s) => s.promptSuggestion);
  const terminalAvailable = useApp((s) => s.terminalAvailable);
  const connected = useStore((s) => s.connected);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [dragging, setDragging] = useState(false);
  const [previewing, setPreviewing] = useState<PendingAttachment | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queue = useStore((s) => s.queue);
  const canSend = Boolean(cwd) && connected && (text.trim().length > 0 || attachments.length > 0);
  const activeId = useApp((s) => s.activeId);
  const pickerOpen = useApp((s) => s.pickerOpen);
  const manageOpen = useApp((s) => s.manageOpen);
  const hasPermission = useStore((s) => s.permissions.length > 0);
  const commands = useStore((s) => s.manage?.commands);
  const hasManage = useStore((s) => s.manage !== null);
  const quote = useApp((s) => s.quote);
  const speechLanguage = useApp((s) => s.speechLanguage);
  const speechModel = useApp((s) => s.speechModel);
  const [dictation, setDictation] = useState<'idle' | 'recording' | 'working'>('idle');
  const [dictationStatus, setDictationStatus] = useState('');
  const recording = useRef<Recording | null>(null);
  const drafts = useRef(new Map<number, { text: string; attachments: PendingAttachment[] }>());
  const shownTab = useRef(activeId);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [suggestDismissed, setSuggestDismissed] = useState(false);

  const focus = () => {
    const el = textareaRef.current;
    if (el && !el.disabled) {
      el.focus();
    }
  };

  // Geselecteerde chattekst als citaat achter het concept zetten en daar verder typen.
  useEffect(() => {
    if (quote === null) {
      return;
    }
    const block = quote.split('\n').map((line) => `> ${line}`).join('\n');
    setText((current) => `${current.trimEnd() ? `${current.trimEnd()}\n\n` : ''}${block}\n\n`);
    clearQuote();
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el && !el.disabled) {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }
    });
  }, [quote]);

  // Concept per tabblad bewaren en terugzetten bij het wisselen.
  useEffect(() => {
    if (shownTab.current !== activeId) {
      drafts.current.set(shownTab.current, { text, attachments });
      const draft = drafts.current.get(activeId);
      setText(draft?.text ?? '');
      setAttachments(draft?.attachments ?? []);
      shownTab.current = activeId;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  // Focus zo veel mogelijk terug naar het invoerveld: na wisselen, na dialogen, na klikken op knoppen en bij typen.
  useEffect(() => {
    if (!pickerOpen && !manageOpen && !hasPermission) {
      requestAnimationFrame(focus);
    }
  }, [activeId, pickerOpen, manageOpen, hasPermission, cwd, running]);

  useEffect(() => {
    const isEditable = (el: Element | null) =>
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      Boolean((el as HTMLElement | null)?.isContentEditable);
    const canSteal = () =>
      !document.querySelector('[role=dialog], [role=listbox]') &&
      !isEditable(document.activeElement) &&
      !window.getSelection()?.toString();
    const handleClick = () => setTimeout(() => canSteal() && focus(), 0);
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && canSteal()) {
        focus();
      }
    };
    const handleInsert = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      setText((current) => (current.trim() ? `${current} ${value}` : value));
      setTimeout(focus, 0);
    };
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKey);
    window.addEventListener('composer-insert', handleInsert);
    window.addEventListener('composer-focus', focus);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('composer-insert', handleInsert);
      window.removeEventListener('composer-focus', focus);
    };
  }, []);

  // Slash-commands aanvullen zoals in Claude Code.
  const slash = text.match(/^\/(\S*)$/);
  useEffect(() => {
    if (slash && !hasManage && cwd) {
      send({ type: 'manage' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(slash), hasManage, cwd]);
  const suggestions =
    slash && !suggestDismissed && commands
      ? commands.filter((c) => c.name.toLowerCase().startsWith(slash[1].toLowerCase())).slice(0, 8)
      : [];
  const complete = (name: string) => {
    setText(`/${name} `);
    setSuggestIndex(0);
    focus();
  };



  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
    }
  }, [text, promptSuggestion]);

  const addFiles = async (files: File[]) => {
    const read = await Promise.all(files.map(readAttachment));
    setAttachments((current) => [...current, ...read.filter((a) => a !== null)]);
  };

  const addNative = (results: NativeFile[]) => {
    const files = results.filter((r) => r.kind !== 'path');
    const paths = results.flatMap((r) => (r.kind === 'path' ? [r.path] : []));
    setAttachments((current) => [
      ...current,
      ...files.map((f) => (f.kind === 'image' ? { ...f, preview: `data:${f.mediaType};base64,${f.data}` } : f)),
    ]);
    if (paths.length > 0) {
      insertText(paths.join(' '));
    }
  };

  // Dicteren: opnemen, met Whisper (lokaal) omzetten en de tekst op de cursor in het veld zetten.
  const toggleDictation = async () => {
    if (dictation === 'working') {
      return;
    }
    if (dictation === 'recording') {
      const current = recording.current;
      recording.current = null;
      setDictation('working');
      setDictationStatus('Omzetten…');
      try {
        const audio = await current!.stop();
        const spoken = await transcribe(audio, speechModel, speechLanguage, (percent) => setDictationStatus(`Spraakmodel downloaden… ${percent}%`));
        if (spoken) {
          const el = textareaRef.current;
          const before = el ? text.slice(0, el.selectionStart) : text;
          insertText(`${before && !/\s$/.test(before) ? ' ' : ''}${spoken}`);
        } else {
          notify('Ik heb niets verstaan.');
        }
      } catch (error) {
        notify(`Dicteren mislukt: ${error instanceof Error ? error.message : String(error)}`);
      }
      setDictation('idle');
      setDictationStatus('');
      focus();
      return;
    }
    try {
      recording.current = await startRecording();
      setDictation('recording');
      setDictationStatus('Aan het opnemen… klik om te stoppen');
      // Het model alvast laden (de eerste keer downloaden), zodat het omzetten straks direct kan.
      void loadModel(speechModel, (percent) => setDictationStatus(`Spraakmodel downloaden… ${percent}%`))
        .then(() => setDictationStatus((s) => (s.startsWith('Spraakmodel') ? 'Aan het opnemen… klik om te stoppen' : s)))
        .catch(() => undefined);
    } catch (error) {
      notify(`Microfoon niet beschikbaar: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const insertText = (value: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + value + text.slice(end));
  };

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!canSend) {
      return;
    }
    const trimmed = text.trim();
    // Commando's die de app zelf afhandelt; de rest gaat naar Claude Code.
    const local = (() => {
      if (trimmed === '/usage') {
        openUsage();
        return true;
      }
      if (trimmed === '/clear') {
        clearConversation();
        return true;
      }
      const setting = trimmed.match(/^\/(model|effort)\s+(\S+)$/);
      if (setting) {
        send(setting[1] === 'model' ? { type: 'set_model', model: setting[2] } : { type: 'set_effort', effort: setting[2] as never });
        return true;
      }
      if (trimmed.startsWith('!') && trimmed.length > 1 && attachments.length === 0) {
        runShellCommand(trimmed.slice(1).trim());
        return true;
      }
      return false;
    })();
    if (local) {
      setText('');
      focus();
      return;
    }
    const message = text.trim() || 'Bekijk de bijlage(n).';
    const payload = attachments.map(({ size: _s, preview: _p, ...a }) => a);
    if (running || queue.length > 0) {
      enqueue(message, payload);
    } else {
      send({ type: 'send', text: message, attachments: payload });
      setLastSent({ text: message, attachments: payload });
      addUserItem(message, payload);
    }
    setText('');
    setAttachments([]);
    focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setSuggestIndex((i) => (i + step + suggestions.length) % suggestions.length);
        return;
      }
      if ((event.key === 'Tab' || event.key === 'Enter') && !event.shiftKey) {
        const pick = suggestions[Math.min(suggestIndex, suggestions.length - 1)];
        if (event.key === 'Tab' || `/${pick.name}` !== text.trim()) {
          event.preventDefault();
          complete(pick.name);
          return;
        }
      }
      if (event.key === 'Escape') {
        setSuggestDismissed(true);
        return;
      }
    }
    if (event.key === 'Tab' && !event.shiftKey && !text && promptSuggestion) {
      event.preventDefault();
      setText(promptSuggestion);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      submit(event);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (files.length > 0) {
      event.preventDefault();
      if (native && files.some((f) => f.size === 0)) {
        // Op Windows kan de browser een bestand uit WSL of een netwerkmap niet lezen en geeft hij 0 bytes; de app leest het zelf.
        void native.readClipboardFiles().then((results) => (results.length ? addNative(results) : notify('Plakken mislukt: het bestand op het klembord is leeg of onleesbaar.')));
      } else {
        void addFiles(files);
      }
      return;
    }
    const plain = event.clipboardData.getData('text');
    const paths = pathsFromUriList(event.clipboardData.getData('text/uri-list') || plain);
    if (native && (paths.length > 0 || !plain)) {
      // Gekopieerde bestanden uit de bestandsbeheerder: de app leest ze zelf in.
      event.preventDefault();
      void native.readClipboardFiles().then((results) => (results.length ? addNative(results) : insertText(paths.join(' '))));
      return;
    }
    if (paths.length > 0) {
      event.preventDefault();
      insertText(paths.join(' '));
    }
  };

  const handleDrop = (event: DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      void (native ? native.readDroppedFiles(files).then(addNative) : addFiles(files));
      return;
    }
    const paths = pathsFromUriList(event.dataTransfer.getData('text/uri-list'));
    if (paths.length > 0) {
      insertText(paths.join(' '));
    }
  };

  return (
    <form
      className={styles.wrapper}
      onSubmit={submit}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {terminalHint && (
        <div className={styles.hint}>
          <span>
            <code>{terminalHint}</code> werkt alleen interactief.
          </span>
          {terminalAvailable && (
            <Knop
              variant="tertiair"
              maat="s"
              onClick={() => {
                openTerminal([terminalHint], terminalHint.startsWith('/mcp') ? refreshMcpAfterLogin : undefined);
                clearTerminalHint();
              }}
            >
              Openen in terminal
            </Knop>
          )}
          <button type="button" className={styles.miniKnop} onClick={clearTerminalHint} aria-label="Sluiten">
            <X size={14} />
          </button>
        </div>
      )}
      <div className={[styles.box, dragging && styles.dragging, text.startsWith('!') && styles.shellMode].filter(Boolean).join(' ')}>
        {attachments.length > 0 && (
          <div className={styles.chips}>
            {attachments.map((a, index) => (
              <Chip key={`${a.name}-${index}`} titel={a.name}>
                {a.preview ? (
                  <button type="button" className={styles.chipOpen} onClick={() => setPreviewing(a)} aria-label={`${a.name} bekijken`}>
                    <img src={a.preview} alt="" />
                    <span className={styles.chipName}>{a.name}</span>
                  </button>
                ) : (
                  <>
                    <Paperclip size={12} />
                    <span className={styles.chipName}>{a.name}</span>
                  </>
                )}
                <span className={styles.chipSize}>{formatSize(a.size)}</span>
                <button
                  type="button"
                  className={styles.miniKnop}
                  aria-label={`${a.name} verwijderen`}
                  onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))}
                >
                  <X size={12} />
                </button>
              </Chip>
            ))}
          </div>
        )}
        {suggestions.length > 0 && (
          <ul className={styles.suggestions} role="listbox">
            {suggestions.map((c, index) => (
              <li key={c.name}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === suggestIndex}
                  className={index === suggestIndex ? styles.suggestionActive : undefined}
                  onMouseEnter={() => setSuggestIndex(index)}
                  onClick={() => complete(c.name)}
                >
                  <span className={styles.suggestionName}>/{c.name}</span>
                  <span className={styles.suggestionDesc}>{c.description}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          ref={textareaRef}
          rows={1}
          aria-label="Bericht aan Claude"
          placeholder={!cwd ? 'Kies eerst een project' : promptSuggestion ? `${promptSuggestion}  ⇥ Tab` : 'Bericht aan Claude…  (Enter versturen, Shift+Enter nieuwe regel, Ctrl+V plakken, ! voor een shell-commando)'}
          value={text}
          disabled={!cwd}
          onChange={(event) => {
            setText(event.target.value);
            setSuggestIndex(0);
            setSuggestDismissed(false);
          }}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />
        <div className={styles.actions}>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              void addFiles(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
          <Icoonknop
            maat={32}
            stijl="getint"
            aria-label="Bestand toevoegen"
            title="Bestand toevoegen"
            disabled={!cwd}
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={16} />
          </Icoonknop>
          <Icoonknop
            maat={32}
            stijl={dictation === 'recording' ? 'primair' : 'getint'}
            className={dictation === 'recording' ? styles.recording : undefined}
            aria-label={dictation === 'recording' ? 'Stoppen met dicteren' : 'Dicteren'}
            title={dictation === 'recording' ? 'Stoppen en omzetten naar tekst' : 'Dicteren (spraak naar tekst)'}
            disabled={dictation === 'working'}
            onClick={() => void toggleDictation()}
          >
            {dictation === 'working' ? <Loader2 size={16} className={styles.spin} /> : dictation === 'recording' ? <Square size={14} /> : <Mic size={16} />}
          </Icoonknop>
          <ModeControl />
          <ModelControls />
          <span className={styles.spacer} />
          {dictationStatus && <span className={styles.dictationStatus}>{dictationStatus}</span>}
          {running && (
            <Knop variant="destructief" maat="s" icoon={<Square size={14} />} onClick={() => send({ type: 'interrupt' })}>
              Stoppen
            </Knop>
          )}
          <Icoonknop
            maat={32}
            stijl="primair"
            type="submit"
            aria-label={running ? 'In wachtrij zetten' : 'Versturen'}
            title={running ? 'In wachtrij zetten' : 'Versturen'}
            disabled={!canSend}
          >
            {running ? <Clock size={16} /> : <ArrowUp size={16} />}
          </Icoonknop>
        </div>
      </div>
      {previewing?.preview && (
        <ImagePreview src={previewing.preview} name={previewing.name} onClose={() => setPreviewing(null)} />
      )}
    </form>
  );
};

export default Composer;
