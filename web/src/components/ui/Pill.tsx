import { Chip } from '../../vertex';
import styles from './ui.module.scss';

export type PillTone = 'running' | 'done' | 'error' | 'idle';

const TOON = { running: 'waarschuwing', done: 'positief', error: 'negatief', idle: 'neutraal' } as const;

/** Statuslabel: een Vertex-Chip met een bolletje ervoor. */
const Pill = ({ tone, children }: { tone: PillTone; children: string }) => (
  <Chip toon={TOON[tone]}>
    <span className={styles.dot} />
    {children}
  </Chip>
);

export default Pill;
