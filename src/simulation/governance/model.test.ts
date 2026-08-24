import { describe, expect, it } from 'vitest'
import { updateLegitimacy } from './model'

describe('civic legitimacy', () => {
  it('derives visible food-relief access and fairness from observed community conditions', () => {
    const governance = { id: 'g', communityId: 'c', councilOrganizationId: 'o', representativeIds: [], legitimacy: 500, publicGood: 'food-relief' as const, serviceAccessPermille: 0, contributionFairnessPermille: 500, lastUpdatedTick: 0 }
    const community = { structural: { 'community.structural.foodSecurity': 800 }, emergent: { 'community.emergent.socialTrust': 700, 'community.emergent.cooperation': 600, 'community.emergent.conflict': 200 } }
    updateLegitimacy(governance, community as never, 24)
    expect(governance).toMatchObject({ publicGood: 'food-relief', serviceAccessPermille: 800, contributionFairnessPermille: 600, legitimacy: 725, lastUpdatedTick: 24 })
  })
})
