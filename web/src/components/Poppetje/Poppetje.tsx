import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useTabState } from '../../store';
import * as geluid from './geluid';
import styles from './Poppetje.module.scss';

const ACTIES = ['dansen', 'lopen', 'zwaaien', 'springen', 'draaien', 'typen', 'juichen'] as const;

/** Korte momenten die voorgaan op wat hij aan het doen is; daarna weer terug naar normaal (of weg als Claude klaar is). */
type Moment = 'ontploft' | 'boos' | 'fout' | 'klaar' | 'wakker' | 'giechel';
const DUUR: Record<Moment, number> = { ontploft: 2600, boos: 2000, fout: 1600, klaar: 2400, wakker: 800, giechel: 700 };

const GELUID: Record<Moment, () => void> = {
  ontploft: geluid.ontploffing,
  boos: geluid.boos,
  fout: geluid.fout,
  klaar: geluid.klaar,
  wakker: geluid.wakker,
  giechel: geluid.giechel,
};

const SLAAP_NA_MS = 90_000;
// Snelle tools (Read, Edit) zijn in milliseconden klaar; zo lang blijft hij er minstens mee bezig.
const TOOL_MINIMAAL_MS = 1500;
const BOOS_NA_KLIKKEN = 5;

const GEREEDSCHAP: Record<string, 'typen' | 'zoeken' | 'timmeren'> = {
  Bash: 'typen',
  BashOutput: 'typen',
  Read: 'zoeken',
  Grep: 'zoeken',
  Glob: 'zoeken',
  WebFetch: 'zoeken',
  WebSearch: 'zoeken',
  ToolSearch: 'zoeken',
  Edit: 'timmeren',
  MultiEdit: 'timmeren',
  Write: 'timmeren',
  NotebookEdit: 'timmeren',
};

const isSubagent = (name: string) => name === 'Agent' || name === 'Task';

const willekeurig = (behalve?: string) => {
  const keuze = ACTIES.filter((a) => a !== behalve);
  return keuze[Math.floor(Math.random() * keuze.length)];
};

const useWillekeurigeActie = () => {
  const [actie, setActie] = useState(() => willekeurig());
  useEffect(() => {
    const timer = setInterval(() => setActie((huidig) => willekeurig(huidig)), 4000);
    return () => clearInterval(timer);
  }, []);
  return actie;
};

const OGEN = ['4,2', '4,3', '11,2', '11,3'];

/** De losse pixels van het poppetje, voor de ontploffing. */
const PIXELS: [number, number][] = [
  ...Array.from({ length: 12 * 8 }, (_, i): [number, number] => [2 + (i % 12), Math.floor(i / 12)]).filter(
    ([x, y]) => !OGEN.includes(`${x},${y}`),
  ),
  ...[0, 1, 14, 15].flatMap((x): [number, number][] => [[x, 4], [x, 5]]),
  ...[3, 5, 10, 12].flatMap((x): [number, number][] => [[x, 8], [x, 9]]),
];

// Ruimte boven het hoofd voor muts, vraagteken en zzz; 3 px per rastervak.
const VIEWBOX = '-2 -7 20 17';
const BREEDTE = 60;
const HOOGTE = 51;

const Ontploffing = () => {
  const scherven = useMemo(
    () =>
      PIXELS.map(([x, y]) => {
        const hoek = Math.atan2(y - 4.5, x - 8) + (Math.random() - 0.5);
        const afstand = 10 + Math.random() * 22;
        return {
          x,
          y,
          stijl: {
            '--dx': `${Math.cos(hoek) * afstand}px`,
            '--dy': `${Math.sin(hoek) * afstand - 4}px`,
            '--r': `${(Math.random() - 0.5) * 720}deg`,
          } as CSSProperties,
        };
      }),
    [],
  );
  return (
    <svg className={`${styles.poppetje} ${styles.ontploft}`} shapeRendering="crispEdges" viewBox={VIEWBOX} width={BREEDTE} height={HOOGTE}>
      <circle className={styles.flits} cx="8" cy="4.5" r="5" />
      {scherven.map(({ x, y, stijl }) => (
        <rect key={`${x},${y}`} className={styles.scherf} x={x} y={y} width="1.1" height="1.1" style={stijl} />
      ))}
    </svg>
  );
};

type FiguurProps = { stand: string; muts?: boolean; klein?: boolean };

/** Raster van 16 x 10: lijf 12 x 8, armen 2 x 2 opzij, ogen als gat in het lijf, vier pootjes eronder. */
const Figuur = ({ stand, muts, klein }: FiguurProps) => (
  <svg
    className={`${styles.poppetje} ${styles[stand] ?? ''} ${klein ? styles.klein : ''}`}
    viewBox={VIEWBOX}
    width={klein ? BREEDTE * 0.55 : BREEDTE}
    height={klein ? HOOGTE * 0.55 : HOOGTE}
  >
    <g className={styles.lijf}>
      <path fillRule="evenodd" d="M2 0h12v8H2z M4 2h1v2H4z M11 2h1v2h-1z" />
      <rect className={styles.ooglid} x="4" y="2" width="1" height="2" />
      <rect className={styles.ooglid} x="11" y="2" width="1" height="2" />
      <path className={styles.kruisOgen} d="M3.7 2.2l1.6 1.6M5.3 2.2l-1.6 1.6M10.7 2.2l1.6 1.6M12.3 2.2l-1.6 1.6" />
      <path className={styles.wenkbrauwen} d="M3.4 0.8l2.4 0.9M12.6 0.8l-2.4 0.9" />
      <rect className={styles.armLinks} x="0" y="4" width="2.05" height="2" />
      <g className={styles.armRechts}>
        <rect x="13.95" y="4" width="2.05" height="2" />
        <g className={styles.hamer}>
          <rect className={styles.steel} x="15.2" y="0.6" width="0.7" height="4" />
          <rect className={styles.kop} x="14.2" y="-0.2" width="2.7" height="1.3" />
        </g>
        <g className={styles.vergrootglas}>
          <path className={styles.handvat} d="M15.6 4.4l1-1.3" />
          <circle className={styles.lens} cx="17.4" cy="2.1" r="1.3" />
        </g>
      </g>
      <rect className={styles.toetsenbord} x="1" y="6.6" width="14" height="0.9" rx="0.2" />
      {muts && (
        <g className={styles.muts}>
          <path className={styles.mutsRood} d="M3 0L12.5 -5.2L13 0z" />
          <rect className={styles.mutsWit} x="2.4" y="-0.9" width="11.2" height="1.3" rx="0.6" />
          <circle className={styles.mutsWit} cx="12.7" cy="-5.3" r="0.9" />
        </g>
      )}
    </g>
    <rect className={styles.poot} x="3" y="7.95" width="1" height="2.05" />
    <rect className={`${styles.poot} ${styles.pootAnders}`} x="5" y="7.95" width="1" height="2.05" />
    <rect className={styles.poot} x="10" y="7.95" width="1" height="2.05" />
    <rect className={`${styles.poot} ${styles.pootAnders}`} x="12" y="7.95" width="1" height="2.05" />
    <text className={styles.vraag} x="8" y="-2.2">?</text>
    <g className={styles.zzz}>
      <text x="12" y="-2">z</text>
      <text x="14" y="-4">z</text>
      <text x="16" y="-6">z</text>
    </g>
    <text className={styles.hihi} x="13" y="-2.5">hihi</text>
  </svg>
);

const Sneeuw = () => {
  const vlokken = useMemo(
    () =>
      Array.from({ length: 14 }, () => ({
        left: `${Math.random() * 100}%`,
        animationDelay: `${-Math.random() * 4}s`,
        animationDuration: `${3 + Math.random() * 3}s`,
      })),
    [],
  );
  return (
    <span className={styles.sneeuw} aria-hidden>
      {vlokken.map((stijl, index) => (
        <span key={index} style={stijl} />
      ))}
    </span>
  );
};

/**
 * Het Claude Code-poppetje onderaan de chat: doet iets zolang Claude bezig is en reageert op wat er gebeurt.
 * Alleen het poppetje van het actieve tabblad maakt geluid; de andere tabbladen zijn ook gemount.
 */
const Poppetje = ({ tabId, actief }: { tabId: number; actief: boolean }) => {
  const running = useTabState(tabId, (s) => s.running);
  const gestopt = useTabState(tabId, (s) => s.gestopt);
  const items = useTabState(tabId, (s) => s.items);
  const wacht = useTabState(tabId, (s) => s.permissions.length > 0 || s.questions.length > 0);
  const context = useTabState(tabId, (s) => s.context?.percentage ?? 0);
  const voorbereiding = useTabState(tabId, (s) => s.voorbereiding);
  const [recenteTool, setRecenteTool] = useState<string | null>(null);
  const willekeurigeActie = useWillekeurigeActie();
  const [moment, setMoment] = useState<Moment | null>(null);
  const [slaapt, setSlaapt] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const klikken = useRef<number[]>([]);

  const actiefRef = useRef(actief);
  actiefRef.current = actief;

  const toon = useCallback((m: Moment) => {
    window.clearTimeout(timer.current);
    setMoment(m);
    timer.current = window.setTimeout(() => setMoment(null), DUUR[m]);
    if (actiefRef.current) {
      GELUID[m]();
    }
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Tussendoor brabbelt hij af en toe wat in zichzelf.
  const brabbelt = actief && running && !moment && !slaapt && !wacht;
  useEffect(() => {
    if (!brabbelt) {
      return undefined;
    }
    let volgende: number;
    const plan = () => {
      volgende = window.setTimeout(() => {
        geluid.brabbel();
        plan();
      }, 2500 + Math.random() * 5000);
    };
    geluid.brabbel();
    plan();
    return () => window.clearTimeout(volgende);
  }, [brabbelt]);

  useEffect(() => {
    if (actief && running && wacht) {
      geluid.vraag();
    }
  }, [actief, running, wacht]);

  useEffect(() => {
    if (actief && slaapt) {
      geluid.slaap();
    }
  }, [actief, slaapt]);

  let bezigMet: string | null = null;
  let subagent = false;
  let laatsteFout: string | null = null;
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.kind !== 'tool') {
      continue;
    }
    if (!item.done && isSubagent(item.name)) {
      subagent = true;
    } else if (!item.done && bezigMet === null) {
      bezigMet = item.name;
    }
    if (item.isError && laatsteFout === null) {
      laatsteFout = item.id;
    }
  }

  const huidigeTool = bezigMet ?? voorbereiding;
  const vasthouden = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!huidigeTool || isSubagent(huidigeTool)) {
      return;
    }
    setRecenteTool(huidigeTool);
    window.clearTimeout(vasthouden.current);
    vasthouden.current = window.setTimeout(() => setRecenteTool(null), TOOL_MINIMAAL_MS);
  }, [huidigeTool]);
  useEffect(() => () => window.clearTimeout(vasthouden.current), []);

  useEffect(() => {
    if (gestopt) {
      toon('ontploft');
    }
  }, [gestopt, toon]);

  const vorigeFout = useRef(laatsteFout);
  useEffect(() => {
    if (laatsteFout && laatsteFout !== vorigeFout.current && running) {
      toon('fout');
    }
    vorigeFout.current = laatsteFout;
  }, [laatsteFout, running, toon]);

  const vorigeRunning = useRef(running);
  useEffect(() => {
    // Klaar zonder stop: buigen en weglopen. Na een stop ontploft hij al.
    if (vorigeRunning.current && !running && Date.now() - gestopt > DUUR.ontploft) {
      toon('klaar');
    }
    vorigeRunning.current = running;
  }, [running, gestopt, toon]);

  // Lang niets nieuws: in slaap vallen; komt er weer iets binnen, dan schrikt hij wakker.
  const slaaptNu = useRef(false);
  useEffect(() => {
    if (slaaptNu.current) {
      slaaptNu.current = false;
      setSlaapt(false);
      if (running) {
        toon('wakker');
      }
    }
    if (!running) {
      return undefined;
    }
    const slaapTimer = window.setTimeout(() => {
      slaaptNu.current = true;
      setSlaapt(true);
    }, SLAAP_NA_MS);
    return () => window.clearTimeout(slaapTimer);
  }, [items, running, toon]);

  const klik = () => {
    const nu = Date.now();
    klikken.current = [...klikken.current.filter((t) => nu - t < 2000), nu];
    if (klikken.current.length >= BOOS_NA_KLIKKEN) {
      klikken.current = [];
      toon('boos');
    } else if (moment !== 'boos') {
      toon('giechel');
    }
  };

  if (!running && moment === null) {
    return null;
  }

  const datum = new Date();
  const december = datum.getMonth() === 11;
  const april = datum.getMonth() === 3 && datum.getDate() === 1;
  const stand =
    moment ?? (wacht ? 'toestemming' : slaapt ? 'slaapt' : GEREEDSCHAP[huidigeTool ?? recenteTool ?? ''] || willekeurigeActie);

  return (
    <button
      type="button"
      className={`${styles.baan} ${april ? styles.april : ''}`}
      onClick={klik}
      aria-label={moment === 'ontploft' ? 'Claude is gestopt' : running ? 'Claude is bezig' : 'Claude is klaar'}
      style={{ '--buik': 1 + Math.min(context, 100) / 250 } as CSSProperties}
    >
      {december && <Sneeuw />}
      <span className={styles.buik}>
        {moment === 'ontploft' ? <Ontploffing /> : <Figuur stand={stand} muts={december} />}
      </span>
      {subagent && moment !== 'ontploft' && <Figuur stand={willekeurigeActie} muts={december} klein />}
    </button>
  );
};

/** Klein poppetje voor de tabbalk, op tabbladen waar Claude bezig is. */
export const PoppetjeIcoon = () => (
  <svg className={styles.icoon} viewBox="0 0 16 10" width="16" height="10" aria-hidden>
    <path fillRule="evenodd" d="M2 0h12v8H2z M4 2h1v2H4z M11 2h1v2h-1z M0 4h2v2H0z M14 4h2v2h-2z" />
    <rect className={styles.poot} x="3" y="8" width="1" height="2" />
    <rect className={`${styles.poot} ${styles.pootAnders}`} x="5" y="8" width="1" height="2" />
    <rect className={styles.poot} x="10" y="8" width="1" height="2" />
    <rect className={`${styles.poot} ${styles.pootAnders}`} x="12" y="8" width="1" height="2" />
  </svg>
);

export default Poppetje;
