import { describe, expect, it } from 'vitest'
import { canonicalStringify } from './snapshot'

describe('canonical serialization', () => {
  it('sorts object keys recursively without reordering arrays', () => {
    expect(canonicalStringify({ z: 1, a: { d: 4, b: 2 }, list: [{ y: 2, x: 1 }] })).toBe(
      '{"a":{"b":2,"d":4},"list":[{"x":1,"y":2}],"z":1}',
    )
  })
})
