import { describe, expect, it } from 'vitest'
import { buildProjectedGovernanceProfiles } from './governance'

describe('governance projection', () => {
  it('exposes observed catchment evidence without converting it into territory or civic membership', () => {
    const result = buildProjectedGovernanceProfiles([
      { id: 'gov-b', communityId: 'west', councilOrganizationId: 'council-west', representativeIds: ['dead', 'living'], legitimacy: 720, publicGood: 'food-relief', serviceAccessPermille: 800, contributionFairnessPermille: 650, lastUpdatedTick: 48 },
    ], [{ catchment: { id: 'west', displayName: 'West Valley', anchorCellId: '0,0', cellCount: 12 } } as never], [
      { id: 'living', lifeStatus: 'alive' }, { id: 'dead', lifeStatus: 'dead' },
    ] as never, [])
    expect(result).toEqual([expect.objectContaining({
      catchmentName: 'West Valley', catchmentCellCount: 12, representativeIds: ['dead', 'living'], activeRepresentativeCount: 1,
      councilOrganizationStatus: 'referenced-not-modeled', legitimacyPermille: 720, evaluatedLegitimacyPermille: 363,
      legitimacyFactors: [
        { id: 'food-relief-access', label: 'Food-relief access', valuePermille: 800 },
        { id: 'contribution-fairness', label: 'Contribution fairness', valuePermille: 650 },
        { id: 'social-trust', label: 'Social trust', valuePermille: 0 },
        { id: 'conflict-absence', label: 'Conflict absence', valuePermille: 0 },
      ],
      taxationStatus: 'not-modeled', budgetStatus: 'not-modeled', lawAndEnforcementStatus: 'not-modeled', corruptionStatus: 'not-modeled',
      territoryStatus: 'not-modeled', civicMembershipStatus: 'not-modeled', cultureAndIdentityStatus: 'separate-not-inferred',
    })])
  })
})
