import { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import styles from './Icoonknop.module.css';

/** Ronde knop met alleen een icoon. Standaard (kaartvlak met rand en schaduw), getint of primair. Altijd een aria-label meegeven. */
type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  stijl?: 'standaard' | 'getint' | 'primair';
  maat?: 40 | 32;
  href?: string;
  'aria-label': string;
  children: ReactNode;
};

const Icoonknop = ({ stijl = 'standaard', maat = 40, href, children, className = '', style, ...rest }: Props) => {
  const klas = [styles.ik, styles[stijl], className].filter(Boolean).join(' ');
  const stijlMaat = { ...style, '--maat': `${maat}px` } as CSSProperties;
  return href ? (
    <a className={klas} style={stijlMaat} href={href} aria-label={rest['aria-label']}>
      {children}
    </a>
  ) : (
    <button className={klas} style={stijlMaat} type="button" {...rest}>
      {children}
    </button>
  );
};

export default Icoonknop;
