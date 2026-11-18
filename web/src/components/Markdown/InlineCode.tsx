import { Play } from 'lucide-react';
import { MouseEvent, ReactNode, useEffect, useState } from 'react';
import { native } from '../../native';
import { notify, readImage, runInTerminal } from '../../store';
import ImagePreview from '../ui/ImagePreview';
import { IMAGE_EXTENSIONS, looksLikeCommand, looksLikePath } from './detect';
import styles from './Markdown.module.scss';

/**
 * Inline code in een bericht. Een commando klik je aan om het in de terminal uit te voeren;
 * een bestandspad open je met Ctrl+klik (afbeeldingen verschijnen in de chat, de rest in de standaard-app).
 */
const InlineCode = ({ children, forcePath = false }: { children?: ReactNode; forcePath?: boolean }) => {
  const text = typeof children === 'string' ? children : Array.isArray(children) ? children.join('') : '';
  const [image, setImage] = useState<{ src: string; path: string } | null>(null);
  const [big, setBig] = useState(false);
  const isPath = forcePath || (!looksLikeCommand(text) && looksLikePath(text));
  const isImagePath = isPath && IMAGE_EXTENSIONS.test(text.trim().replace(/:\d+(:\d+)?$/, ''));

  // Afbeeldingspaden laten we meteen als afbeelding zien; Ctrl+klik klapt hem weer in of uit.
  useEffect(() => {
    if (!isImagePath) {
      return undefined;
    }
    let active = true;
    readImage(text.trim()).then((result) => {
      if (active && result.dataUrl) {
        setImage({ src: result.dataUrl, path: result.path });
      }
    });
    return () => {
      active = false;
    };
  }, [isImagePath, text]);

  if (!forcePath && looksLikeCommand(text)) {
    return (
      <code
        className={styles.command}
        role="button"
        tabIndex={0}
        title="Klik om uit te voeren in de terminal"
        onClick={() => runInTerminal(text.trim())}
      >
        <Play size={10} className={styles.commandIcon} />
        {children}
      </code>
    );
  }

  if (isPath) {
    const open = async (event: MouseEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      if (image && !event.shiftKey) {
        setImage(null);
        return;
      }
      const result = await readImage(text.trim());
      if (event.shiftKey) {
        if (native) {
          native.showInFolder(result.path);
        } else {
          notify('Bestanden tonen kan alleen in de app.');
        }
      } else if (result.dataUrl && IMAGE_EXTENSIONS.test(result.path)) {
        setImage({ src: result.dataUrl, path: result.path });
      } else if (result.error === 'Bestand niet gevonden') {
        notify(`Bestand niet gevonden: ${result.path}`);
      } else if (native) {
        const error = await native.openPath(result.path);
        if (error) {
          notify(`Openen mislukt: ${error}`);
        }
      } else {
        notify('Bestanden openen kan alleen in de app.');
      }
    };
    return (
      <>
        <code className={styles.path} title="Ctrl+klik: openen · Ctrl+Shift+klik: tonen in bestandsbeheer" onClick={open}>
          {children}
        </code>
        {image && (
          <span className={styles.inlineImage}>
            <img src={image.src} alt={image.path} onClick={() => setBig(true)} />
          </span>
        )}
        {image && big && <ImagePreview src={image.src} name={image.path} onClose={() => setBig(false)} />}
      </>
    );
  }

  return <code>{children}</code>;
};

export default InlineCode;
