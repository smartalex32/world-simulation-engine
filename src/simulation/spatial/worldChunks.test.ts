import { describe, expect, it } from 'vitest'
import { sparseWorldChunk, sparseWorldStore, worldChunkBounds, worldChunkKey, worldChunkLayout } from './worldChunks'

describe('world chunk addressing', () => {
  it('addresses a billion-cell world without materializing cells', () => {
    const layout = worldChunkLayout(1_000_000, 1_000)
    expect(layout).toMatchObject({ version: 1, chunkSize: 32, columns: 31_250, rows: 32, chunkCount: 1_000_000 })
    expect(worldChunkKey(999_999, 999)).toBe('world-chunk:31249:31')
    expect(worldChunkBounds(1_000_000, 1_000, 31_249, 31)).toMatchObject({ minQ: 999_968, maxQ: 999_999, minR: 992, maxR: 999 })
  })

  it('stores only edited cells for a billion-cell layout and streams one chunk', () => {
    const store = sparseWorldStore(1_000_000, 1_000, [{ cellId: '999999,999', value: 'water' }, { cellId: '1,2', value: 'hill' }], (id) => {
      const [q, r] = id.split(',').map(Number)
      return Number.isSafeInteger(q) && Number.isSafeInteger(r) ? { q: q!, r: r! } : undefined
    })
    expect(store.layout.chunkCount).toBe(1_000_000)
    expect(store.chunks).toHaveLength(2)
    expect(sparseWorldChunk(store, 'world-chunk:31249:31')).toEqual({ key: 'world-chunk:31249:31', values: [{ cellId: '999999,999', value: 'water' }] })
  })
})
