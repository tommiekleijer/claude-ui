import { InputHTMLAttributes, ReactNode } from 'react';
import styles from './Zoekveld.module.css';

/** Zoekveld met zoekicoon. Het icoon geef je zelf mee, zodat het pakket geen icoonbibliotheek nodig heeft. */
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { icoon?: ReactNode; label?: string };

const Zoekveld = ({ icoon, label = 'Zoeken', className = '', ...rest }: Props) => (
  <label className={`${styles.zoekveld} ${className}`.trim()}>
    {icoon && <span className={styles.icoon}>{icoon}</span>}
    <span className={styles['alleen-scherm-lezer']}>{label}</span>
    <input type="search" {...rest} />
  </label>
);

export default Zoekveld;
