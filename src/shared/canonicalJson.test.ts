import { describe, expect, it } from 'vitest'
import { canonicalStringify } from './canonicalJson'

describe('cross-runtime canonical JSON', () => {
  it('matches the browser and Node golden representation without locale ordering', () => {
    const value = { z: 1, accents: { 'é': 2, e: 1 }, omitted: undefined, nested: [{ y: 2, x: 1 }, null] }
    expect(canonicalStringify(value)).toBe('{"accents":{"e":1,"é":2},"nested":[{"x":1,"y":2},null],"z":1}')
  })

  it('preserves array order while recursively sorting object keys', () => {
    expect(canonicalStringify([{ b: 2, a: 1 }, { d: 4, c: 3 }])).toBe('[{"a":1,"b":2},{"c":3,"d":4}]')
  })
})
