import type { EngineRequest, EngineResponse } from './engine.worker';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (r: EngineResponse) => void>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<EngineResponse>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
  }
  return worker;
}

export function bestMove(fen: string, level: number): Promise<EngineResponse> {
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage({ id, fen, level } satisfies EngineRequest);
  });
}

/** Drop any in-flight search, e.g. when the player undoes or starts a new game. */
export function cancelEngine() {
  pending.clear();
  worker?.terminate();
  worker = null;
}

export const LEVEL_NAMES = [
  'Outer Disciple',
  'Inner Disciple',
  'Core Disciple',
  'Elder',
  'Grand Elder',
  'Sect Master',
  'Heavenly Demon',
  'Martial Sovereign',
];
