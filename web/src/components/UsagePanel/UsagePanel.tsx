import { Gauge, RefreshCw } from 'lucide-react';
import { closeUsage, send, useApp } from '../../store';
import Dialog from '../ui/Dialog';
import { Icoonknop } from '../../vertex';
import styles from './UsagePanel.module.scss';

const tone = (pct: number) => (pct >= 90 ? styles.bad : pct >= 70 ? styles.warn : styles.ok);

const timeLeft = (resetsAt?: number) => {
  if (!resetsAt) {
    return '';
  }
  const secs = resetsAt - Date.now() / 1000;
  if (secs <= 0) {
    return '';
  }
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return d > 0 ? `nog ${d}d ${h}u` : h > 0 ? `nog ${h}u ${m}m` : `nog ${m}m`;
};

const UsagePanel = () => {
  const report = useApp((s) => s.usageReport);

  return (
    <Dialog
      onClose={closeUsage}
      title={
        <>
          <Gauge size={20} />
          Usage
          <span className={styles.updated}>
            {report ? `bijgewerkt ${new Date(report.fetchedAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
          <Icoonknop maat={32} aria-label="Vernieuwen" title="Vernieuwen" onClick={() => send({ type: 'usage' })}>
            <RefreshCw size={16} />
          </Icoonknop>
        </>
      }
    >
      {!report && <p className={styles.empty}>Laden…</p>}
      {report && (
        <>
          <ul className={styles.windows}>
            {report.windows.map((w) => (
              <li key={w.label}>
                <div className={styles.row}>
                  <span className={styles.label}>{w.label}</span>
                  <span className={`${styles.pct} ${tone(w.percentage)}`}>{w.percentage}%</span>
                </div>
                <div className={styles.bar}>
                  <span className={tone(w.percentage)} style={{ width: `${Math.min(100, w.percentage)}%` }} />
                </div>
                {w.resets && (
                  <div className={styles.reset}>
                    reset {w.resets}
                    {timeLeft(w.resetsAt) && ` · ${timeLeft(w.resetsAt)}`}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {report.sections.length > 0 && <h3 className={styles.heading}>Waar gaat je usage heen?</h3>}
          {report.sections.map((section) => (
            <section key={section.title} className={styles.section}>
              <h4 className={styles.sectionTitle}>{section.title}</h4>
              <ul className={styles.contributors}>
                {section.items.map((c) => (
                  <li key={c.text}>
                    <span className={styles.contribPct}>{c.percentage}%</span>
                    <span className={styles.contribBar}>
                      <span style={{ width: `${Math.min(100, c.percentage)}%` }} />
                    </span>
                    <span className={styles.contribText}>{c.text}</span>
                  </li>
                ))}
              </ul>
              {section.tops.length > 0 && (
                <ul className={styles.tops}>
                  {section.tops.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {report.notes.length > 0 && (
            <ul className={styles.notes}>
              {report.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </Dialog>
  );
};

export default UsagePanel;
