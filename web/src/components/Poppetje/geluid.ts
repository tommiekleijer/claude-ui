// Robotgebrabbel met de Web Audio API: alles wordt gesynthetiseerd, geen geluidsbestanden.
// Schattig = zachte sinustonen, hoog, op een pentatonische toonladder (klinkt altijd zuiver), met een klein glijtje en vibrato.
let ctx: AudioContext | null = null;
let uit: GainNode | null = null;

const audio = () => {
  if (!ctx) {
    ctx = new AudioContext();
    uit = ctx.createGain();
    uit.gain.value = 0.15;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 4000;
    uit.connect(filter).connect(ctx.destination);
  }
  // Browsers starten audio pas na een klik of toets; daarna mag hij resumen.
  void ctx.resume();
  return { ctx, uit: uit! };
};

const willekeurig = (min: number, max: number) => min + Math.random() * (max - min);
const kies = <T,>(lijst: T[]) => lijst[Math.floor(Math.random() * lijst.length)];

// C-majeur pentatonisch, rond C6: hoog en vrolijk.
const NOTEN = [784, 880, 1047, 1175, 1319, 1568, 1760];

type Piep = { freq: number; naar?: number; start: number; duur: number; volume?: number; vibrato?: number };

/** Een zacht toontje: sinus plus een stille octaaf erboven voor een iets 'stemmiger' klank. */
const piep = ({ freq, naar, start, duur, volume = 1, vibrato = 0 }: Piep) => {
  const { ctx: c, uit: o } = audio();
  const t = c.currentTime + start;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(volume, t + Math.min(0.02, duur / 3));
  gain.gain.exponentialRampToValueAtTime(0.001, t + duur);
  gain.connect(o);

  [1, 2].forEach((boventoon) => {
    const osc = c.createOscillator();
    const niveau = c.createGain();
    osc.type = 'sine';
    niveau.gain.value = boventoon === 1 ? 1 : 0.15;
    osc.frequency.setValueAtTime(freq * boventoon, t);
    if (naar) {
      osc.frequency.exponentialRampToValueAtTime(naar * boventoon, t + duur * 0.8);
    }
    if (vibrato) {
      const lfo = c.createOscillator();
      const diepte = c.createGain();
      lfo.frequency.value = 18;
      diepte.gain.value = freq * boventoon * vibrato;
      lfo.connect(diepte).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + duur + 0.02);
    }
    osc.connect(niveau).connect(gain);
    osc.start(t);
    osc.stop(t + duur + 0.02);
  });
};

/** Een zinnetje van 3 tot 7 bliepjes; soms eindigt het vragend omhoog. */
export const brabbel = () => {
  let t = 0;
  const lettergrepen = 3 + Math.floor(Math.random() * 5);
  const vragend = Math.random() < 0.3;
  for (let i = 0; i < lettergrepen; i++) {
    const laatste = i === lettergrepen - 1;
    const freq = kies(NOTEN);
    const duur = laatste ? willekeurig(0.12, 0.18) : willekeurig(0.06, 0.1);
    piep({
      freq: freq * 0.92,
      naar: laatste && vragend ? freq * 1.3 : freq,
      start: t,
      duur,
      volume: 0.7,
      vibrato: laatste ? 0.02 : 0,
    });
    t += duur + willekeurig(0.03, 0.06);
  }
};

export const giechel = () => {
  [1319, 1568, 1319, 1760].forEach((freq, i) => piep({ freq, naar: freq * 1.1, start: i * 0.08, duur: 0.07, volume: 0.8 }));
};

/** Pruilerig 'hmpf', geen gebrom: lager, kort en omlaag. */
export const boos = () => {
  [0, 0.22, 0.44].forEach((start) => {
    piep({ freq: 660, naar: 440, start, duur: 0.16, volume: 0.9, vibrato: 0.04 });
  });
};

export const ontploffing = () => {
  // Opzwellen als een ballon, dan een zachte 'plop' en een vallend fluitje.
  piep({ freq: 523, naar: 1568, start: 0, duur: 0.72, volume: 0.5, vibrato: 0.03 });
  piep({ freq: 220, naar: 60, start: 0.72, duur: 0.18, volume: 1.2 });
  piep({ freq: 1760, naar: 330, start: 0.8, duur: 0.9, volume: 0.5, vibrato: 0.015 });
};

export const klaar = () => {
  [1047, 1319, 1568, 2093].forEach((freq, i) => piep({ freq, start: i * 0.09, duur: 0.14, volume: 0.7 }));
  piep({ freq: 1319, naar: 1760, start: 1.0, duur: 0.1, volume: 0.6 });
  piep({ freq: 1760, naar: 1175, start: 1.13, duur: 0.14, volume: 0.6 });
};

export const fout = () => {
  piep({ freq: 1175, naar: 1047, start: 0, duur: 0.14, volume: 0.8 });
  piep({ freq: 880, naar: 660, start: 0.18, duur: 0.3, volume: 0.8, vibrato: 0.02 });
};

export const wakker = () => {
  piep({ freq: 880, naar: 2093, start: 0, duur: 0.1 });
  piep({ freq: 1760, start: 0.13, duur: 0.08, volume: 0.6 });
};

export const slaap = () => {
  piep({ freq: 523, naar: 440, start: 0, duur: 0.7, volume: 0.4, vibrato: 0.01 });
  piep({ freq: 494, naar: 392, start: 0.9, duur: 0.9, volume: 0.3, vibrato: 0.01 });
};

export const vraag = () => {
  piep({ freq: 1047, start: 0, duur: 0.09, volume: 0.7 });
  piep({ freq: 1047, naar: 1568, start: 0.13, duur: 0.2, volume: 0.7 });
};
