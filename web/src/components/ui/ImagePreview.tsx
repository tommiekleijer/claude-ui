import { X } from 'lucide-react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Icoonknop } from '../../vertex';
import styles from './ui.module.scss';

const ImagePreview = ({ src, name, onClose }: { src: string; name: string; onClose: () => void }) => {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Via een portal op <body>: binnen een bericht in de wachtrij (die doorzichtig is) zou de foto anders ook doorzichtig worden.
  return createPortal(
    <div className={styles.lightbox} onClick={onClose} role="dialog" aria-label={name}>
      <div className={styles.lightboxBar}>
        <span>{name}</span>
        <Icoonknop maat={32} aria-label="Sluiten" title="Sluiten" onClick={onClose}>
          <X size={16} />
        </Icoonknop>
      </div>
      <img src={src} alt={name} onClick={(event) => event.stopPropagation()} />
    </div>,
    document.body,
  );
};

export default ImagePreview;
