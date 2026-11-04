// claude.ts: claude.ai artifact capabilities (null when the page runs anywhere else).
export type Sample = ((input: string, o?: object) => Promise<{ text: string }>) & { json: (input: string, o?: object) => Promise<unknown> };
export type Downloads = { save(f: { filename: string; data: string | Blob }): Promise<unknown> };

const api = (globalThis as { claude?: { use?: (n: string) => Promise<unknown> } }).claude;
const cache = new Map<string, Promise<unknown>>();
export function capability<T>(name: string): Promise<T | null> {
  if (!cache.has(name)) cache.set(name, api?.use ? api.use(name).catch(() => null) : Promise.resolve(null));
  return cache.get(name) as Promise<T | null>;
}
