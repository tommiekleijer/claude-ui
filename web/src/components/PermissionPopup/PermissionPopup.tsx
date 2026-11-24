import { ShieldQuestion } from 'lucide-react';
import type { PermissionDecision } from '../../../../shared/protocol';
import { removePermission, send, useStore } from '../../store';
import { ToolInput } from '../ToolCard/ToolCard';
import { Knop } from '../../vertex';
import Dialog from '../ui/Dialog';
import styles from './PermissionPopup.module.scss';

const PermissionPopup = () => {
  const request = useStore((s) => s.permissions[0]);
  const pending = useStore((s) => s.permissions.length);

  if (!request) {
    return null;
  }

  const answer = (decision: PermissionDecision) => {
    send({ type: 'permission_response', id: request.id, decision });
    removePermission(request.id);
  };

  return (
    <Dialog
      scoped
      title={
        <>
          <ShieldQuestion size={20} className={styles.icon} />
          Toestemming nodig{pending > 1 ? ` (1 van ${pending})` : ''}
        </>
      }
      footer={
        <>
          <Knop variant="destructief" maat="s" onClick={() => answer('deny')}>
            Weigeren
          </Knop>
          {request.canAlways && (
            <Knop maat="s" onClick={() => answer('always')} title="Wordt onthouden in .claude/settings.local.json van dit project">
              Altijd toestaan
            </Knop>
          )}
          <Knop variant="primair" maat="s" autoFocus onClick={() => answer('allow')}>
            Toestaan
          </Knop>
        </>
      }
    >
      <p className={styles.title}>{request.title ?? `Claude wil ${request.toolName} gebruiken`}</p>
      {request.reason && <p className={styles.reason}>{request.reason}</p>}
      <ToolInput tool={{ kind: 'tool', id: request.id, name: request.toolName, input: request.input, done: false }} />
    </Dialog>
  );
};

export default PermissionPopup;
