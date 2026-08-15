import { describe, expect, it } from 'vitest'
import { axialToPixel, cellId, hexDistance, hexNeighbors, isInBounds, pixelToAxial } from './hex'

describe('hex geometry', () => {
  it('calculates IDs, distance, neighbors, and bounds', () => {
    expect(cellId({ q: 4, r: 7 })).toBe('4,7')
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -2 })).toBe(3)
    expect(hexNeighbors({ q: 2, r: 2 })).toHaveLength(6)
    expect(new Set(hexNeighbors({ q: 2, r: 2 }).map(cellId)).size).toBe(6)
    expect(isInBounds({ q: 31, r: 23 }, 32, 24)).toBe(true)
    expect(isInBounds({ q: 32, r: 23 }, 32, 24)).toBe(false)
  })

  it('round-trips cell centers through display coordinates', () => {
    for (const coordinate of [{ q: 0, r: 0 }, { q: 9, r: 4 }, { q: 31, r: 23 }]) {
      const pixel = axialToPixel(coordinate, 18)
      expect(pixelToAxial(pixel.x, pixel.y, 18)).toEqual(coordinate)
    }
  })
})
