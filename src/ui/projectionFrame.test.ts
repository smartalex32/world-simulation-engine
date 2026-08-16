import { describe, expect, it } from 'vitest'
import type { WorkbenchProjection } from '../projection'
import { mergeWorkbenchProjection } from './projectionFrame'

function projection(epoch: number, revision: number, tick: number): WorkbenchProjection {
  return { projectionEpoch: epoch, tick, map: { revision } } as WorkbenchProjection
}

describe('mergeWorkbenchProjection', () => {
  it('keeps a newer map revision while accepting newer simulation tick data', () => {
    const result = mergeWorkbenchProjection(projection(3, 9, 12), projection(3, 8, 13))
    expect(result.tick).toBe(13)
    expect(result.map.revision).toBe(9)
  })

  it('accepts a lower revision after a reset epoch', () => {
    const result = mergeWorkbenchProjection(projection(3, 9, 12), projection(4, 0, 0))
    expect(result.tick).toBe(0)
    expect(result.map.revision).toBe(0)
  })
})
