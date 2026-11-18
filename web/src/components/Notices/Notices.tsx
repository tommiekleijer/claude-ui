import { X } from 'lucide-react';
import { useEffect } from 'react';
import { dismissNotice, useStore } from '../../store';
import { Icoonknop } from '../../vertex';
import styles from './Notices.module.scss';

const Notices = () => {
  const notices = useStore((s) => s.notices);

  useEffect(() => {
    if (notices.length === 0) {
      return undefined;
    }
    const timer = setTimeout(() => dismissNotice(notices[0].id), 8000);
    return () => clearTimeout(timer);
  }, [notices]);

  return (
    <div className={styles.notices}>
      {notices.map((notice) => (
        <div key={notice.id} className={styles.notice} role="alert">
          <span>{notice.text}</span>
          <Icoonknop maat={32} aria-label="Sluiten" title="Sluiten" onClick={() => dismissNotice(notice.id)}>
            <X size={14} />
          </Icoonknop>
        </div>
      ))}
    </div>
  );
};

export default Notices;
