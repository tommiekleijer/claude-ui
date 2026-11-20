import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { native, type UpdateState } from '../../native';
import { useApp } from '../../store';
import { Knop } from '../../vertex';
import styles from './UpdateMelding.module.scss';

export const updateTekst = (update: UpdateState) =>
  update.status === 'available'
    ? `Versie ${update.version} is beschikbaar.`
    : update.status === 'downloading'
      ? `Downloaden… ${update.percent}%`
      : update.status === 'ready'
        ? 'De update is klaar om te installeren.'
        : update.status === 'checking'
          ? 'Zoeken naar updates…'
          : update.status === 'none'
            ? 'Je hebt de nieuwste versie.'
            : update.status === 'error'
              ? `Updaten mislukt: ${update.message}`
              : update.status === 'dev'
                ? 'Updates werken alleen in de geïnstalleerde app.'
                : '';

export const UpdateActies = ({ update }: { update: UpdateState }) => (
  <>
    {update.status === 'available' && (
      <Knop variant="primair" maat="s" onClick={() => void native?.updates.install()}>
        {native?.platform === 'darwin' ? 'Downloaden' : 'Installeren'}
      </Knop>
    )}
    {update.status === 'ready' && (
      <Knop variant="primair" maat="s" onClick={() => void native?.updates.restart()}>
        Herstarten om bij te werken
      </Knop>
    )}
    {(update.status === 'idle' || update.status === 'none' || update.status === 'error') && (
      <Knop variant="secundair" maat="s" onClick={() => void native?.updates.check()}>
        Controleren
      </Knop>
    )}
  </>
);

const UpdateMelding = () => {
  const update = useApp((s) => s.update);
  // Downloaden en klaar dragen geen versie mee; onthoud die van 'available' voor de link en voor Later.
  const [versie, setVersie] = useState<string | null>(null);
  const [later, setLater] = useState<string | null>(null);

  useEffect(() => {
    if (update?.status === 'available') {
      setVersie(update.version);
    }
  }, [update]);

  if (
    !update ||
    !versie ||
    versie === later ||
    (update.status !== 'available' && update.status !== 'downloading' && update.status !== 'ready' && update.status !== 'error')
  ) {
    return null;
  }
  return (
    <div className={styles.melding} role="status">
      <Download size={14} />
      <span>{updateTekst(update)}</span>
      <Knop variant="tertiair" maat="s" href={`https://github.com/tommiekleijer/claude-ui/releases/tag/v${versie}`}>
        Wat is er nieuw
      </Knop>
      <UpdateActies update={update} />
      <Knop variant="tertiair" maat="s" onClick={() => setLater(versie)}>
        Later
      </Knop>
    </div>
  );
};

export default UpdateMelding;
