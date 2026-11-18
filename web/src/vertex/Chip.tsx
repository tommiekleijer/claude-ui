import { MouseEvent, ReactNode } from 'react';
import styles from './Chip.module.css';

/** Chip. Toon bepaalt de kleur. Met onClick wordt het een knop (bijvoorbeeld om een filter weg te halen). */
type Props = {
  toon?: 'accent' | 'positief' | 'waarschuwing' | 'neutraal' | 'negatief';
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  titel?: string;
  popupOpen?: boolean;
  children: ReactNode;
};

const Chip = ({ toon = 'neutraal', onClick, titel, popupOpen, children }: Props) =>
  onClick ? (
    <button type="button" className={`${styles.chip} ${styles[toon]}`} onClick={onClick}
      title={titel}
      aria-haspopup={popupOpen === undefined ? undefined : 'listbox'}
      aria-expanded={popupOpen}
    >
      {children}
    </button>
  ) : (
    <span className={`${styles.chip} ${styles[toon]}`} title={titel}>
      {children}
    </span>
  );

export default Chip;
