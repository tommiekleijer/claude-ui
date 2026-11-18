/// <reference lib="webworker" />
import { env, pipeline } from '@huggingface/transformers';
import jsepMjs from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url';
import jsepWasm from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url';
import plainMjs from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';
import plainWasm from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';

// De WASM-bestanden van onnxruntime zitten in de app zelf; alleen het model wordt de eerste keer gedownload.
env.allowLocalModels = false;
env.useBrowserCache = true;

export type WorkerRequest =
  | { type: 'load'; model: string; forceWasm?: boolean }
  | { type: 'transcribe'; model: string; audio: Float32Array; language: string | null; forceWasm?: boolean };
export type WorkerResponse =
  | { type: 'progress'; percent: number }
  | { type: 'ready'; device: 'webgpu' | 'wasm' }
  | { type: 'result'; text: string }
  | { type: 'error'; message: string; webgpuFailed?: boolean };

type Transcriber = (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string }>;
let loaded: { model: string; transcriber: Transcriber; device: 'webgpu' | 'wasm' } | null = null;

const reply = (response: WorkerResponse) => postMessage(response);

const hasGpu = async () => {
  try {
    return Boolean(await (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu?.requestAdapter());
  } catch {
    return false;
  }
};

const load = async (model: string, forceWasm = false) => {
  if (loaded?.model === model) {
    return loaded;
  }
  const files = new Map<string, { loaded: number; total: number }>();
  const progress_callback = (info: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (info.status === 'progress' && info.file && info.total) {
      files.set(info.file, { loaded: info.loaded ?? 0, total: info.total });
      const all = [...files.values()];
      reply({ type: 'progress', percent: Math.round((all.reduce((n, f) => n + f.loaded, 0) / all.reduce((n, f) => n + f.total, 0)) * 100) });
    }
  };
  const create = (device: 'webgpu' | 'wasm') => {
    env.backends.onnx.wasm!.wasmPaths = device === 'webgpu' ? { mjs: jsepMjs, wasm: jsepWasm } : { mjs: plainMjs, wasm: plainWasm };
    return pipeline('automatic-speech-recognition', model, {
      device,
      dtype: device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8',
      progress_callback,
    }) as unknown as Promise<Transcriber>;
  };
  let transcriber: Transcriber;
  let device: 'webgpu' | 'wasm' = 'wasm';
  if (!forceWasm && (await hasGpu())) {
    try {
      transcriber = await create('webgpu');
      device = 'webgpu';
    } catch (error) {
      // onnxruntime onthoudt een mislukte WebGPU-start; de aanroeper probeert het in een nieuwe worker met alleen WASM.
      reply({ type: 'error', message: error instanceof Error ? error.message : String(error), webgpuFailed: true });
      return null;
    }
  } else {
    transcriber = await create('wasm');
  }
  loaded = { model, transcriber, device };
  return loaded;
};

addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const result = await load(request.model, request.forceWasm);
    if (!result) {
      return;
    }
    const { transcriber, device } = result;
    if (request.type === 'load') {
      reply({ type: 'ready', device });
      return;
    }
    const output = await transcriber(request.audio, {
      language: request.language ?? undefined,
      task: 'transcribe',
      chunk_length_s: 30,
    });
    reply({ type: 'result', text: output.text.trim() });
  } catch (error) {
    // Bij een mislukte WebGPU-run (bv. een slecht stuurprogramma) volgende keer opnieuw laden, nu met WASM.
    loaded = null;
    reply({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
});
