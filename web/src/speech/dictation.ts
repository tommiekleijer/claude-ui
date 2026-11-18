import type { WorkerRequest, WorkerResponse } from './whisper.worker';

/** Spraakmodellen (Whisper, lokaal) met hun kwantisatie; size = de eerste download. */
export const MODELS = {
  base: { id: 'onnx-community/whisper-base', dtype: 'q8', label: 'Snel', size: '~80 MB' },
  small: { id: 'onnx-community/whisper-small', dtype: 'q8', label: 'Nauwkeurig', size: '~250 MB' },
  // q8 zou ruim 1 GB zijn; q4 houdt hem rond de 760 MB met nauwelijks kwaliteitsverlies bij dit grote model.
  turbo: { id: 'onnx-community/whisper-large-v3-turbo', dtype: 'q4', label: 'Beste', size: '~760 MB' },
} as const;
export type SpeechModel = keyof typeof MODELS;
export type SpeechLanguage = 'nl' | 'en' | 'auto';

const LANGUAGE_NAME: Record<SpeechLanguage, string | null> = { nl: 'dutch', en: 'english', auto: null };

let worker: Worker | null = null;
let onProgress: ((percent: number) => void) | null = null;
let pending: { resolve: (value: WorkerResponse) => void } | null = null;

const getWorker = () => {
  if (!worker) {
    worker = new Worker(new URL('./whisper.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type === 'progress') {
        onProgress?.(event.data.percent);
      } else {
        pending?.resolve(event.data);
        pending = null;
      }
    };
  }
  return worker;
};

let forceWasm = false;

const call = async (request: WorkerRequest, progress?: (percent: number) => void): Promise<WorkerResponse> => {
  const response = await new Promise<WorkerResponse>((resolve) => {
    onProgress = progress ?? null;
    pending = { resolve };
    getWorker().postMessage({ ...request, forceWasm });
  });
  if (response.type === 'error' && response.webgpuFailed) {
    // WebGPU werkt hier niet (stuurprogramma): opnieuw met een verse worker die alleen WASM gebruikt.
    worker?.terminate();
    worker = null;
    forceWasm = true;
    return call(request, progress);
  }
  return response;
};

/** Laadt het model alvast (downloadt het de eerste keer), zodat het omzetten straks direct kan. */
export const loadModel = async (model: SpeechModel, progress: (percent: number) => void) => {
  const response = await call({ type: 'load', model: MODELS[model].id, dtype: MODELS[model].dtype }, progress);
  if (response.type === 'error') {
    throw new Error(response.message);
  }
};

export type Recording = { stop: () => Promise<Float32Array>; cancel: () => void };

/** Neemt op met de microfoon; stop() geeft mono 16 kHz audio terug, zoals Whisper het wil. */
export const startRecording = async (): Promise<Recording> => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => event.data.size > 0 && chunks.push(event.data);
  recorder.start();
  const release = () => stream.getTracks().forEach((track) => track.stop());
  return {
    cancel: () => {
      recorder.stop();
      release();
    },
    stop: () =>
      new Promise<Float32Array>((resolve, reject) => {
        recorder.onstop = async () => {
          release();
          try {
            const context = new AudioContext({ sampleRate: 16000 });
            const buffer = await context.decodeAudioData(await new Blob(chunks).arrayBuffer());
            await context.close();
            resolve(buffer.getChannelData(0));
          } catch (error) {
            reject(error);
          }
        };
        recorder.stop();
      }),
  };
};

export const transcribe = async (audio: Float32Array, model: SpeechModel, language: SpeechLanguage, progress: (percent: number) => void) => {
  const response = await call({ type: 'transcribe', model: MODELS[model].id, dtype: MODELS[model].dtype, audio, language: LANGUAGE_NAME[language] }, progress);
  if (response.type === 'error') {
    throw new Error(response.message);
  }
  return response.type === 'result' ? response.text : '';
};
