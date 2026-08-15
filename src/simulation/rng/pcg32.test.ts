import { describe, expect, it } from 'vitest'
import { Pcg32, RandomProvider } from './pcg32'

describe('Pcg32', () => {
  it('matches the published PCG reference vector', () => {
    const rng = new Pcg32(42n, 54n)
    expect(Array.from({ length: 5 }, () => rng.nextUint32().toString(16).padStart(8, '0'))).toEqual([
      'a15c02b7',
      '7b47f409',
      'ba1d3330',
      '83d2f293',
      'bfa4784b',
    ])
  })

  it('restores named streams exactly', () => {
    const first = new RandomProvider('test-seed')
    const stream = first.stream('movement')
    Array.from({ length: 17 }, () => stream.nextUint32())
    const restored = new RandomProvider('test-seed', first.snapshot())
    expect(restored.stream('movement').nextUint32()).toBe(stream.nextUint32())
  })

  it('keeps streams isolated', () => {
    const first = new RandomProvider('same')
    const second = new RandomProvider('same')
    first.stream('unrelated').nextUint32()
    expect(first.stream('actions').nextUint32()).toBe(second.stream('actions').nextUint32())
  })
})
