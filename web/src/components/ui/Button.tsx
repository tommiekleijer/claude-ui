import { ButtonHTMLAttributes, ReactNode } from 'react';
import styles from './ui.module.scss';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'danger' | 'subtle';
  icon?: ReactNode;
};

export const Button = ({ variant = 'subtle', icon, children, className, ...rest }: ButtonProps) => (
  <button type="button" {...rest} className={[styles.button, styles[variant], className].filter(Boolean).join(' ')}>
    {icon}
    {children}
  </button>
);

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: ReactNode };

export const IconButton = ({ label, icon, className, ...rest }: IconButtonProps) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    {...rest}
    className={[styles.iconButton, className].filter(Boolean).join(' ')}
  >
    {icon}
  </button>
);
