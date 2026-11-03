import { MATE, type EngineRequest, type EngineResponse } from './search';

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

// Analysis (the advantage bar, game reviews) runs on workers of its own, so it never
// delays or gets cancelled with the opponent's moves.
const analysts = new Map<string, { worker: Worker; pending: Map<number, (r: EngineResponse) => void> }>();

/** Score a position at full strength. Requests on one `channel` run one after another. */
export function analyse(fen: string, opts: { depth: number; ms: number; mate?: number }, channel = 'bar'): Promise<EngineResponse> {
  let a = analysts.get(channel);
  if (!a) {
    const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    const p = new Map<number, (r: EngineResponse) => void>();
    worker.onmessage = (e: MessageEvent<EngineResponse>) => {
      p.get(e.data.id)?.(e.data);
      p.delete(e.data.id);
    };
    a = { worker, pending: p };
    analysts.set(channel, a);
  }
  const id = ++seq;
  const { worker, pending: waiting } = a;
  return new Promise((resolve) => {
    waiting.set(id, resolve);
    worker.postMessage({ id, fen, level: 8, ...opts } satisfies EngineRequest);
  });
}

/** Stop an analysis channel; its pending requests never resolve. */
export function stopAnalysis(channel: string) {
  analysts.get(channel)?.worker.terminate();
  analysts.delete(channel);
}

/** Mate scores sit near ±MATE; this turns a score into "M3" style or pawns. */
export function scoreText(cp: number): string {
  if (Math.abs(cp) > MATE - 1000) {
    const plies = MATE - Math.abs(cp);
    // Zero plies left: the position on the board is already mate.
    return plies === 0 ? '#' : (cp > 0 ? '' : '-') + 'M' + Math.ceil(plies / 2);
  }
  const p = cp / 100;
  return (p > 0 ? '+' : '') + p.toFixed(1);
}

export const isMate = (cp: number) => Math.abs(cp) > MATE - 1000;

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
