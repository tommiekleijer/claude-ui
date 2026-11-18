import { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './Knop.module.css';

/** Knop. Primair (verloop), secundair (zacht accent), tertiair (alleen tekst), destructief. Als er een href is, wordt het een link. */
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primair' | 'secundair' | 'tertiair' | 'destructief';
  maat?: 'l' | 'm' | 's';
  href?: string;
  /** Icoon vooraan, bijvoorbeeld <Upload />. */
  icoon?: ReactNode;
};

const Knop = ({ variant = 'secundair', maat = 'm', href, icoon, children, className = '', ...rest }: Props) => {
  const klas = [styles.knop, styles[variant], styles[maat], className].filter(Boolean).join(' ');
  const inhoud = (
    <>
      {icoon && <span className={styles.icoon}>{icoon}</span>}
      {children}
    </>
  );
  return href ? (
    <a className={klas} href={href}>
      {inhoud}
    </a>
  ) : (
    <button className={klas} type="button" {...rest}>
      {inhoud}
    </button>
  );
};

export default Knop;
