/// <reference lib="webworker" />
// Runs the engine (search.ts) off the main thread.
import { think, type EngineRequest, type EngineResponse } from './search';

self.onmessage = (e: MessageEvent<EngineRequest>) => {
  const { id, fen, level, depth, ms, mate } = e.data;
  const res = think(fen, level, depth, ms, mate);
  (self as DedicatedWorkerGlobalScope).postMessage({ id, ...res } satisfies EngineResponse);
};
