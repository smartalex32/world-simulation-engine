import { describe, expect, it } from 'vitest'
import { buildProjectedSettlementDiffusion } from './diffusion'

describe('settlement diffusion projection', () => {
  it('reports observed residents without assigning settlement membership', () => {
    const settlements = [{ id: 'a', name: 'A', anchorCellId: '0,0' }]
    const people = [{ id: 'p', lifeStatus: 'alive', homeCellId: '0,0', language: { fluency: { 'language.valley': 800, 'language.ridge': 200 }, acquisitionCount: 1 }, culture: { beliefs: { 'belief.exploration': 600, 'belief.cooperation': 500 }, exposureCount: 1 } }]
    expect(buildProjectedSettlementDiffusion(settlements, people as never)).toEqual([{ settlementId: 'a', observedResidentCount: 1, averageValleyFluency: 800, averageExplorationBelief: 600 }])
  })
})
