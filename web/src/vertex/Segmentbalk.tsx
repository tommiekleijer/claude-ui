import styles from './Segmentbalk.module.css';

/** Segmentbalk: één keuze uit een paar opties, met optioneel een teller per optie. */
type Optie = { waarde: string; label: string; teller?: number | string | null };
type Props = {
  opties: Optie[];
  waarde: string;
  onKies?: (waarde: string) => void;
  /** Gradient voor gebruik op een paarse kaart. */
  achtergrond?: 'standaard' | 'gradient';
  label?: string;
  /** Alle opties even breed over de volle breedte. */
  vol?: boolean;
};

const Segmentbalk = ({ opties, waarde, onKies, achtergrond = 'standaard', label, vol = false }: Props) => (
  <div className={[styles.balk, styles[achtergrond], vol && styles.vol].filter(Boolean).join(' ')} role="group" aria-label={label}>
    {opties.map((o) => (
      <button
        key={o.waarde}
        type="button"
        className={waarde === o.waarde ? `${styles.optie} ${styles.actief}` : styles.optie}
        aria-pressed={waarde === o.waarde}
        onClick={() => onKies?.(o.waarde)}
      >
        {o.label}
        {o.teller != null && o.teller !== '' && <span className={styles.teller}>{o.teller}</span>}
      </button>
    ))}
  </div>
);

export default Segmentbalk;
