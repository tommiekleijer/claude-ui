import { useEffect, useState } from 'react';
import type { LimitWindow } from '../../../../shared/protocol';
import { openUsage, useStore } from '../../store';
import Pill from '../ui/Pill';
import styles from './StatusBar.module.scss';

const FIVE_HOURS = 5 * 3600;

type Tone = 'ok' | 'warn' | 'bad' | 'critical';

// Zelfde drempels als ~/.claude/statusline-command.sh.
const toneForPct = (pct: number): Tone => (pct >= 95 ? 'critical' : pct >= 80 ? 'bad' : pct >= 50 ? 'warn' : 'ok');
const toneForPace = (used: number, elapsed: number): Tone =>
  used >= 95 ? 'critical' : used - elapsed > 10 ? 'bad' : used - elapsed > 0 ? 'warn' : 'ok';
const MOOD: Record<Tone, string> = { ok: '😊', warn: '😐', bad: '😠', critical: '🤬' };

const timeLeft = (secs: number) => {
  if (secs <= 0) {
    return '';
  }
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return d > 0 ? `${d}d${h}h` : h > 0 ? `${h}h${m}m` : `${m}m`;
};

const useNow = () => {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 30000);
    return () => clearInterval(timer);
  }, []);
  return now;
};

const Value = ({ tone, children }: { tone: Tone; children: string }) => (
  <span className={styles[tone]}>{children}</span>
);

const FiveHour = ({ window, now }: { window: LimitWindow; now: number }) => {
  const remaining = window.resetsAt - now;
  const elapsed = Math.min(100, Math.max(0, ((FIVE_HOURS - remaining) / FIVE_HOURS) * 100));
  const tone = toneForPace(window.percentage, elapsed);
  return (
    <span className={styles.segment} title="Gebruik van het 5-uursvenster, tegenover hoeveel van het venster al voorbij is">
      <span className={styles.label}>5h</span>
      <Value tone={tone}>{`${window.percentage}%`}</Value>
      <span className={styles.dim}>/max {Math.round(elapsed)}%</span>
      {MOOD[tone]}
      <span className={styles.dim}>(x1.25: {Math.round(window.percentage * 5)}%)</span>
      {remaining > 0 && <span className={styles.dim}>[{timeLeft(remaining)}]</span>}
    </span>
  );
};

const StatusBar = () => {
  const connected = useStore((s) => s.connected);
  const running = useStore((s) => s.running);
  const model = useStore((s) => s.model);
  const cwd = useStore((s) => s.cwd);
  const limits = useStore((s) => s.limits);
  const context = useStore((s) => s.context);
  const now = useNow();

  return (
    <footer className={styles.bar}>
      {!connected ? (
        <Pill tone="error">offline</Pill>
      ) : running ? (
        <Pill tone="running">bezig</Pill>
      ) : (
        <Pill tone="idle">klaar</Pill>
      )}
      {model && <span className={styles.model}>{model}</span>}
      {context && (
        <span className={styles.segment} title={`${context.totalTokens.toLocaleString('nl-NL')} van ${context.maxTokens.toLocaleString('nl-NL')} tokens`}>
          <span className={styles.label}>Ctx</span>
          <Value tone={toneForPct(context.percentage)}>{`${context.percentage}%`}</Value>
          {MOOD[toneForPct(context.percentage)]}
        </span>
      )}
      <button type="button" className={styles.usage} onClick={openUsage} title="Usage-overzicht openen">
        {limits.fiveHour && <FiveHour window={limits.fiveHour} now={now} />}
      {limits.sevenDay && (
        <span className={styles.segment}>
          <span className={styles.label}>7d</span>
          <Value tone={toneForPct(limits.sevenDay.percentage)}>{`${limits.sevenDay.percentage}%`}</Value>
          {MOOD[toneForPct(limits.sevenDay.percentage)]}
          {limits.sevenDay.resetsAt > now && (
            <span className={styles.dim}>[{timeLeft(limits.sevenDay.resetsAt - now)}]</span>
          )}
        </span>
      )}
        {!limits.fiveHour && !limits.sevenDay && <span className={styles.dim}>usage</span>}
      </button>
      <span className={styles.path} title={cwd ?? ''}>
        {cwd ?? ''}
      </span>
    </footer>
  );
};

export default StatusBar;
