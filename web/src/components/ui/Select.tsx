import { Check, ChevronDown } from 'lucide-react';
import { ComponentProps, ReactNode, useEffect, useRef, useState } from 'react';
import { Chip } from '../../vertex';
import styles from './Select.module.scss';

type Option = { value: string; label: string; hint?: string };

type SelectProps = {
  label: ReactNode;
  value: string | null;
  options: Option[];
  onChange: (value: string) => void;
  title?: string;
  toon?: ComponentProps<typeof Chip>['toon'];
};

/** Keuzelijst met een Vertex-Chip als knop; het menu is opgebouwd uit Vertex-tokens. */
const Select = ({ label, value, options, onChange, title, toon }: SelectProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className={styles.select} ref={ref}>
      <Chip toon={toon} titel={title} popupOpen={open} onClick={() => setOpen((o) => !o)}>
        {label}
        <ChevronDown size={12} />
      </Chip>
      {open && (
        <ul className={styles.menu} role="listbox">
          {options.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={styles.option}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className={styles.check}>{option.value === value && <Check size={14} />}</span>
                <span className={styles.optionLabel}>{option.label}</span>
                {option.hint && <span className={styles.hint}>{option.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default Select;
