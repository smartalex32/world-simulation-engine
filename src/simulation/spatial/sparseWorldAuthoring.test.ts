import { describe, expect, it } from 'vitest'
import { projectSparseAuthoringViewport } from './sparseWorldAuthoring'

describe('sparse world authoring', () => {
  it('streams a deterministic bounded slice from a billion-cell canvas', () => {
    const draft = { seed: 'billion', width: 1_000_000, height: 1_000 }
    const first = projectSparseAuthoringViewport(draft, { minQ: 999_968, maxQ: 999_999, minR: 992, maxR: 999 })
    expect(first.cells).toHaveLength(256)
    expect(first.chunkKeys).toEqual(['world-chunk:31249:31'])
    expect(projectSparseAuthoringViewport(draft, { minQ: 999_968, maxQ: 999_999, minR: 992, maxR: 999 })).toEqual(first)
  })
})
