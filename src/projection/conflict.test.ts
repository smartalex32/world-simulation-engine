import { describe, expect, it } from 'vitest'
import { buildProjectedContentionProfiles } from './conflict'

describe('contention projection', () => {
  it('aggregates only recorded interpersonal disputes and does not imply warfare', () => {
    const profiles = buildProjectedContentionProfiles([{ catchment: { id: 'west', displayName: 'West Valley', anchorCellId: '0,0', cellCount: 10 } }] as never, [
      { id: 'a', communityId: 'west', grievance: 300, incidents: 2, lastIncidentTick: 24 },
      { id: 'b', communityId: 'west', grievance: 700, incidents: 3, lastIncidentTick: 48 },
      { id: 'outside', communityId: 'east', grievance: 900, incidents: 5, lastIncidentTick: 72 },
    ] as never)
    expect(profiles).toEqual([{
      communityId: 'west', catchmentName: 'West Valley', recordedDisputeCount: 2, activeContentionCount: 2, averageActiveGrievancePermille: 500, totalIncidentCount: 5, latestIncidentTick: 48,
      severity: 'elevated', resolutionScope: 'local-non-lethal-contention', diplomacyStatus: 'not-modeled', militaryOrganizationStatus: 'not-modeled', occupationStatus: 'not-modeled', warfareStatus: 'not-modeled',
    }])
  })
})
