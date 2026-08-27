/** Versioned, integer-only addressing for future sparse/chunked world storage. */
export const WORLD_CHUNK_LAYOUT_VERSION = 1
export const WORLD_CHUNK_SIZE = 32

export interface WorldChunkLayout { version: typeof WORLD_CHUNK_LAYOUT_VERSION; chunkSize: number; columns: number; rows: number; chunkCount: number }
export interface WorldChunkBounds { chunkQ: number; chunkR: number; minQ: number; maxQ: number; minR: number; maxR: number }

/**
 * A serializable sparse value owned by one world chunk.  Empty chunks are
 * deliberately absent: a billion-cell canvas therefore costs memory only for
 * the cells an author actually changes.
 */
export interface SparseWorldChunk<T> { key: string; values: readonly { cellId: string; value: T }[] }

/** Immutable, canonically ordered sparse world edits. */
export interface SparseWorldStore<T> { readonly layout: WorldChunkLayout; readonly chunks: readonly SparseWorldChunk<T>[] }

export function worldChunkLayout(width: number, height: number, chunkSize = WORLD_CHUNK_SIZE): WorldChunkLayout {
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1 || !Number.isSafeInteger(chunkSize) || chunkSize < 1) throw new RangeError('World chunk dimensions must be positive safe integers')
  const columns = Math.ceil(width / chunkSize)
  const rows = Math.ceil(height / chunkSize)
  const chunkCount = columns * rows
  if (!Number.isSafeInteger(chunkCount)) throw new RangeError('World chunk count exceeds safe integer range')
  return { version: WORLD_CHUNK_LAYOUT_VERSION, chunkSize, columns, rows, chunkCount }
}

export function worldChunkKey(q: number, r: number, chunkSize = WORLD_CHUNK_SIZE): string {
  if (!Number.isSafeInteger(q) || q < 0 || !Number.isSafeInteger(r) || r < 0) throw new RangeError('World coordinates must be non-negative safe integers')
  return `world-chunk:${Math.floor(q / chunkSize)}:${Math.floor(r / chunkSize)}`
}

export function worldChunkBounds(width: number, height: number, chunkQ: number, chunkR: number, chunkSize = WORLD_CHUNK_SIZE): WorldChunkBounds {
  const layout = worldChunkLayout(width, height, chunkSize)
  if (!Number.isSafeInteger(chunkQ) || chunkQ < 0 || chunkQ >= layout.columns || !Number.isSafeInteger(chunkR) || chunkR < 0 || chunkR >= layout.rows) throw new RangeError('World chunk is outside layout')
  const minQ = chunkQ * chunkSize; const minR = chunkR * chunkSize
  return { chunkQ, chunkR, minQ, maxQ: Math.min(width - 1, minQ + chunkSize - 1), minR, maxR: Math.min(height - 1, minR + chunkSize - 1) }
}

/**
 * Groups sparse cell values by chunk without allocating an array proportional
 * to the world dimensions.  Callers provide a cell-id parser because the
 * engine's axial id format is part of the spatial domain rather than storage.
 */
export function sparseWorldStore<T>(width: number, height: number, values: readonly { cellId: string; value: T }[], parseCellId: (cellId: string) => { q: number; r: number } | undefined, chunkSize = WORLD_CHUNK_SIZE): SparseWorldStore<T> {
  const layout = worldChunkLayout(width, height, chunkSize)
  const byChunk = new Map<string, Map<string, T>>()
  for (const entry of values) {
    if (!entry || typeof entry.cellId !== 'string') throw new Error('Sparse world value is invalid')
    const coordinate = parseCellId(entry.cellId)
    if (!coordinate || !Number.isSafeInteger(coordinate.q) || !Number.isSafeInteger(coordinate.r) || coordinate.q < 0 || coordinate.q >= width || coordinate.r < 0 || coordinate.r >= height) throw new RangeError(`Sparse world value is outside layout: ${entry.cellId}`)
    const key = worldChunkKey(coordinate.q, coordinate.r, chunkSize)
    const chunk = byChunk.get(key) ?? new Map<string, T>()
    if (chunk.has(entry.cellId)) throw new Error(`Duplicate sparse world value: ${entry.cellId}`)
    chunk.set(entry.cellId, entry.value)
    byChunk.set(key, chunk)
  }
  const chunks = [...byChunk.entries()]
    .sort(([first], [second]) => compareText(first, second))
    .map(([key, entries]) => ({ key, values: [...entries.entries()].sort(([first], [second]) => compareText(first, second)).map(([cellId, value]) => ({ cellId, value })) }))
  return { layout, chunks }
}

/** Returns a detached, bounded chunk payload suitable for streaming to an editor. */
export function sparseWorldChunk<T>(store: SparseWorldStore<T>, key: string): SparseWorldChunk<T> | undefined {
  const source = store.chunks.find((chunk) => chunk.key === key)
  return source === undefined ? undefined : { key: source.key, values: source.values.map((entry) => ({ cellId: entry.cellId, value: entry.value })) }
}

function compareText(first: string, second: string): number { return first < second ? -1 : first > second ? 1 : 0 }
