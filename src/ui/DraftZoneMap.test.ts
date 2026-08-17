import { describe, expect, it } from 'vitest'
import { draftViewportBounds } from './DraftZoneMap'

describe('draft viewport bounds', () => {
  it('clamps a generated-terrain request to the draft world', () => {
    const bounds = draftViewportBounds({ width: 32, height: 24 }, { width: 800, height: 300, scale: 1, x: 0, y: 0 })
    expect(bounds).toEqual({ minQ: 0, maxQ: 31, minR: 0, maxR: 16 })
  })

  it('keeps a close view bounded rather than requesting a whole large world', () => {
    const bounds = draftViewportBounds({ width: 128, height: 128 }, { width: 400, height: 240, scale: 3, x: -800, y: -450 })
    expect(bounds.maxQ - bounds.minQ + 1).toBeLessThan(32)
    expect(bounds.maxR - bounds.minR + 1).toBeLessThan(32)
  })

  it('crops a fitted 128 by 128 world to the worker transport limit', () => {
    const bounds = draftViewportBounds({ width: 128, height: 128 }, { width: 900, height: 640, scale: .2, x: 120, y: 120 })
    const count = (bounds.maxQ - bounds.minQ + 1) * (bounds.maxR - bounds.minR + 1)
    expect(count).toBeLessThanOrEqual(4096)
    expect(bounds).toEqual(draftViewportBounds({ width: 128, height: 128 }, { width: 900, height: 640, scale: .2, x: 120, y: 120 }))
  })
})
