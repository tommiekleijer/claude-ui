import { Droplet } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { native } from '../../native';
import { MODELS, SpeechLanguage, SpeechModel } from '../../speech/dictation';
import { closeSettings, setAccent, setMeldingen, setOpacity, setSpeech, setThema, useApp } from '../../store';
import type { Thema } from '../../../../shared/protocol';
import { Knop, Schakelaar, Segmentbalk } from '../../vertex';
import Dialog from '../ui/Dialog';
import styles from './SettingsPage.module.scss';

const STANDAARD_ACCENT = '#6a55dc';
const KLEUREN = [
  { naam: 'Paars (standaard)', hex: STANDAARD_ACCENT },
  { naam: 'Blauw', hex: '#2f6fed' },
  { naam: 'Turquoise', hex: '#0ea5a4' },
  { naam: 'Groen', hex: '#1f9d6b' },
  { naam: 'Oranje', hex: '#e0701f' },
  { naam: 'Roze', hex: '#d6409f' },
  { naam: 'Rood', hex: '#d64545' },
];

const Row = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className={styles.row}>
    <div className={styles.rowText}>
      <span className={styles.label}>{label}</span>
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
    <div className={styles.control}>{children}</div>
  </div>
);

const Updates = () => {
  const update = useApp((s) => s.update);
  const [version, setVersion] = useState('');
  useEffect(() => {
    void native?.updates.version().then(setVersion);
  }, []);
  if (!native || !update) {
    return null;
  }
  const mac = native.platform === 'darwin';
  const status =
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
  return (
    <section className={styles.section}>
      <h3 className={styles.heading}>Updates</h3>
      <Row label={`Claude UI ${version}`} hint={status}>
        {update.status === 'available' && (
          <Knop variant="primair" maat="s" onClick={() => void native?.updates.install()}>
            {mac ? 'Downloaden' : 'Installeren'}
          </Knop>
        )}
        {update.status === 'ready' && (
          <Knop variant="primair" maat="s" onClick={() => void native?.updates.restart()}>
            Herstarten en installeren
          </Knop>
        )}
        {(update.status === 'idle' || update.status === 'none' || update.status === 'error') && (
          <Knop variant="secundair" maat="s" onClick={() => void native?.updates.check()}>
            Controleren
          </Knop>
        )}
      </Row>
    </section>
  );
};

const SettingsPage = () => {
  const thema = useApp((s) => s.thema);
  const opacity = useApp((s) => s.opacity);
  const meldingen = useApp((s) => s.meldingen);
  const accent = useApp((s) => s.accent);
  const speechLanguage = useApp((s) => s.speechLanguage);
  const speechModel = useApp((s) => s.speechModel);
  const huidig = (accent ?? STANDAARD_ACCENT).toLowerCase();
  const eigen = !KLEUREN.some((kleur) => kleur.hex === huidig);

  return (
    <Dialog
      onClose={closeSettings}
      title={
        <>
          <Droplet size={20} />
          Instellingen
        </>
      }
    >
      <section className={styles.section}>
        <h3 className={styles.heading}>Weergave</h3>
        <Row label="Thema" hint="Systeem volgt het thema van je computer.">
          <Segmentbalk
            label="Thema"
            opties={[
              { waarde: 'systeem', label: 'Systeem' },
              { waarde: 'licht', label: 'Licht' },
              { waarde: 'donker', label: 'Donker' },
            ]}
            waarde={thema}
            onKies={(waarde) => setThema(waarde as Thema)}
          />
        </Row>
        <Row label="Accentkleur" hint="De kleur van knoppen, links en markeringen.">
          <div className={styles.swatches} role="radiogroup" aria-label="Accentkleur">
            {KLEUREN.map((kleur) => (
              <button
                key={kleur.hex}
                type="button"
                role="radio"
                aria-checked={huidig === kleur.hex}
                aria-label={kleur.naam}
                title={kleur.naam}
                className={huidig === kleur.hex ? `${styles.swatch} ${styles.swatchActive}` : styles.swatch}
                style={{ '--swatch': kleur.hex } as CSSProperties}
                onClick={() => setAccent(kleur.hex === STANDAARD_ACCENT ? null : kleur.hex)}
              />
            ))}
            <label
              className={eigen ? `${styles.swatch} ${styles.custom} ${styles.swatchActive}` : `${styles.swatch} ${styles.custom}`}
              style={{ '--swatch': eigen ? huidig : 'transparent' } as CSSProperties}
              title={eigen ? `Eigen kleur (${huidig.toUpperCase()})` : 'Eigen kleur kiezen'}
            >
              <input type="color" aria-label="Eigen kleur kiezen" value={huidig} onChange={(event) => setAccent(event.target.value)} />
            </label>
          </div>
        </Row>
        <Row label="Achtergrond" hint="Hoe doorzichtig het venster is; alleen zichtbaar als de app dat toelaat.">
          <input
            type="range"
            className={styles.range}
            aria-label="Dekking van de achtergrond"
            min={30}
            max={100}
            step={5}
            value={opacity}
            onChange={(event) => setOpacity(Number(event.target.value))}
          />
          <span className={styles.value}>{opacity}%</span>
        </Row>
      </section>
      <section className={styles.section}>
        <h3 className={styles.heading}>Dicteren</h3>
        <Row label="Taal" hint="De taal waarin je praat. Automatisch herkent het zelf de taal, maar vergist zich sneller bij korte zinnen.">
          <Segmentbalk
            label="Taal van het dicteren"
            opties={[
              { waarde: 'nl', label: 'Nederlands' },
              { waarde: 'en', label: 'English' },
              { waarde: 'auto', label: 'Automatisch' },
            ]}
            waarde={speechLanguage}
            onKies={(waarde) => setSpeech({ speechLanguage: waarde as SpeechLanguage })}
          />
        </Row>
        <Row label="Spraakmodel" hint="Wordt lokaal op je computer uitgevoerd; niets gaat naar internet behalve de eerste download van het model.">
          <Segmentbalk
            label="Spraakmodel"
            opties={(Object.keys(MODELS) as SpeechModel[]).map((sleutel) => ({ waarde: sleutel, label: `${MODELS[sleutel].label} ${MODELS[sleutel].size}` }))}
            waarde={speechModel}
            onKies={(waarde) => setSpeech({ speechModel: waarde as SpeechModel })}
          />
        </Row>
      </section>
      {native && (
        <section className={styles.section}>
          <h3 className={styles.heading}>Meldingen</h3>
          <Row label="Systeemmeldingen" hint="Als Claude klaar is, een vraag heeft of toestemming nodig heeft in een chat waar je niet zit.">
            <Schakelaar aria-label="Systeemmeldingen" aan={meldingen} onChange={(event) => setMeldingen(event.target.checked)} />
          </Row>
        </section>
      )}
      <Updates />
    </Dialog>
  );
};

export default SettingsPage;
