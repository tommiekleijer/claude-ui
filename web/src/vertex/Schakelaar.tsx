import { InputHTMLAttributes } from 'react';
import styles from './Schakelaar.module.css';

/** Schakelaar (aan/uit). Gebruik binnen een <label> of geef een aria-label mee. */
type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'checked'> & { aan?: boolean };

const Schakelaar = ({ aan = false, className = '', ...rest }: Props) => (
  <input className={`${styles.schakelaar} ${className}`.trim()} type="checkbox" role="switch" checked={aan} {...rest} />
);

export default Schakelaar;
