import { describe, expect, it } from 'vitest'
import { worldChunkBounds, worldChunkKey, worldChunkLayout } from './worldChunks'

describe('world chunk addressing', () => {
  it('addresses a billion-cell world without materializing cells', () => {
    const layout = worldChunkLayout(1_000_000, 1_000)
    expect(layout).toMatchObject({ version: 1, chunkSize: 32, columns: 31_250, rows: 32, chunkCount: 1_000_000 })
    expect(worldChunkKey(999_999, 999)).toBe('world-chunk:31249:31')
    expect(worldChunkBounds(1_000_000, 1_000, 31_249, 31)).toMatchObject({ minQ: 999_968, maxQ: 999_999, minR: 992, maxR: 999 })
  })
})
