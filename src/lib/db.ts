// Tiny promise wrapper over IndexedDB for the match archive.

export type Mode = 'ai' | 'local' | 'lan';
export type Result = '1-0' | '0-1' | '1/2-1/2' | '*';

/** Match options chosen before the game starts. */
export interface Rules {
  hints: boolean;
  undo: boolean;
  /** Minutes per side and seconds added per move; null = untimed. */
  clock: { base: number; inc: number } | null;
  /** Same device only: turn the board to face whoever is to move. */
  flip: boolean;
}

/** Milliseconds left on each side's clock. */
export type Clocks = { w: number; b: number };

export interface GameRecord {
  id: string;
  mode: Mode;
  realm: string;
  white: string;
  black: string;
  /** Colour of the person on this device, or null for pass-and-play. */
  you: 'w' | 'b' | null;
  level?: number;
  pgn: string;
  fen: string;
  moves: number;
  result: Result;
  reason?: string;
  startedAt: number;
  updatedAt: number;
  rules?: Rules;
  clock?: Clocks;
}

const DB_NAME = 'frost-chess';
const STORE = 'games';
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
      store.createIndex('updatedAt', 'updatedAt');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const saveGame = (g: GameRecord) => tx('readwrite', (s) => s.put(g)).catch(console.warn);
export const deleteGame = (id: string) => tx('readwrite', (s) => s.delete(id));
export const clearGames = () => tx('readwrite', (s) => s.clear());

export async function listGames(): Promise<GameRecord[]> {
  try {
    const all = await tx<GameRecord[]>('readonly', (s) => s.getAll());
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch (e) {
    console.warn('IndexedDB unavailable', e);
    return [];
  }
}

/** Most recent unfinished game that can be resumed on this device alone. */
export async function lastUnfinished(): Promise<GameRecord | undefined> {
  return (await listGames()).find((g) => g.result === '*' && g.mode !== 'lan');
}
