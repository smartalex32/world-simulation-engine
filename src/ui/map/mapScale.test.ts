import { describe, expect, it } from 'vitest'
import { mapScaleBar } from './mapScale'

describe('map scale bar', () => {
  it('chooses a conventional distance and draws the matching pixel width', () => {
    const scale = mapScaleBar(1000, 18, 1)
    expect(scale.distanceMeters).toBe(5000)
    expect(scale.pixelWidth).toBeCloseTo(90)
    expect(scale.label).toBe('5 km')
  })

  it('keeps an honest useful-width scale while zoomed far out', () => {
    const scale = mapScaleBar(1000, 18, .002)
    expect(scale.distanceMeters).toBe(2_000_000)
    expect(scale.pixelWidth).toBeCloseTo(72)
    expect(scale.label).toBe('2000 km')
  })
})
