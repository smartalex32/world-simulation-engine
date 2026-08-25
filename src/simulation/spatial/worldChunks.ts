/** Versioned, integer-only addressing for future sparse/chunked world storage. */
export const WORLD_CHUNK_LAYOUT_VERSION = 1
export const WORLD_CHUNK_SIZE = 32

export interface WorldChunkLayout { version: typeof WORLD_CHUNK_LAYOUT_VERSION; chunkSize: number; columns: number; rows: number; chunkCount: number }
export interface WorldChunkBounds { chunkQ: number; chunkR: number; minQ: number; maxQ: number; minR: number; maxR: number }

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
