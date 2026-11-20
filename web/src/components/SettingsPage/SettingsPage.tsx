import { Droplet } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { native } from '../../native';
import { assignShortcut, comboFromEvent, formatCombo, shortcutCombo, ShortcutId, SHORTCUTS } from '../../shortcuts';
import { MODELS, SpeechLanguage, SpeechModel } from '../../speech/dictation';
import { closeSettings, setAccent, setMeldingen, setOpacity, setPromptSuggestions, setSpeech, setThema, useApp } from '../../store';
import type { Thema } from '../../../../shared/protocol';
import { Knop, Schakelaar, Segmentbalk } from '../../vertex';
import Dialog from '../ui/Dialog';
import { UpdateActies, updateTekst } from '../UpdateMelding/UpdateMelding';
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

export const Row = ({ label, hint, fout, children }: { label: string; hint?: string; fout?: string; children: React.ReactNode }) => (
  <div className={styles.row}>
    <div className={styles.rowText}>
      <span className={styles.label}>{label}</span>
      {hint && <span className={styles.hint}>{hint}</span>}
      {fout && <span className={styles.fout}>{fout}</span>}
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
  return (
    <section className={styles.section}>
      <h3 className={styles.heading}>Updates</h3>
      <Row label={`Claude UI ${version}`} hint={updateTekst(update)}>
        <UpdateActies update={update} />
      </Row>
    </section>
  );
};

const Sneltoetsen = () => {
  const shortcuts = useApp((s) => s.shortcuts);
  const [recording, setRecording] = useState<ShortcutId | null>(null);
  const [fout, setFout] = useState<{ id: ShortcutId; tekst: string } | null>(null);

  const assign = (id: ShortcutId, combo: string | null) => {
    const melding = assignShortcut(id, combo);
    setFout(melding ? { id, tekst: melding } : null);
  };

  useEffect(() => {
    if (!recording) {
      return undefined;
    }
    // In de capture-fase en gestopt, zodat de toets niet ook zijn huidige actie uitvoert of het venster sluit.
    const handleKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const combo = comboFromEvent(event);
      if (event.key === 'Escape') {
        setRecording(null);
      } else if (combo) {
        assign(recording, combo);
        setRecording(null);
      }
    };
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [recording]);

  return (
    <section className={styles.section}>
      <h3 className={styles.heading}>Sneltoetsen</h3>
      {SHORTCUTS.map((shortcut) => (
        <Row
          key={shortcut.id}
          label={shortcut.label}
          hint={recording === shortcut.id ? 'Druk de nieuwe combinatie in; Esc annuleert.' : undefined}
          fout={fout?.id === shortcut.id ? fout.tekst : undefined}
        >
          <kbd className={styles.toets}>{formatCombo(shortcutCombo(shortcut.id, shortcuts))}</kbd>
          <Knop
            variant="secundair"
            maat="s"
            onClick={() => {
              setFout(null);
              setRecording(shortcut.id);
            }}
          >
            {recording === shortcut.id ? 'Opnemen…' : 'Wijzigen'}
          </Knop>
          <Knop variant="tertiair" maat="s" disabled={!shortcuts[shortcut.id]} onClick={() => assign(shortcut.id, null)}>
            Standaard
          </Knop>
        </Row>
      ))}
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
  const promptSuggestions = useApp((s) => s.promptSuggestions);
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
      <section className={styles.section}>
        <h3 className={styles.heading}>Claude</h3>
        <Row label="Suggesties voor je volgende bericht" hint="Na elk antwoord een voorstel in het lege invoerveld (Tab neemt het over). Kost per beurt een extra modelaanroep (grotendeels uit de cache). Geldt vanaf de volgende chat.">
          <Schakelaar
            aria-label="Suggesties voor je volgende bericht"
            aan={promptSuggestions}
            onChange={(event) => setPromptSuggestions(event.target.checked)}
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
      <Sneltoetsen />
      <Updates />
    </Dialog>
  );
};

export default SettingsPage;
