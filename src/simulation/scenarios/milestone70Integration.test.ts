import { describe, expect, it } from 'vitest'
import { runCivilizationIntegrationAudit } from './civilizationAudit'

describe('Milestone 70 civilization integration audit', () => {
  it('preserves fixed-seed authoritative continuity through a monthly recovery checkpoint', async () => {
    const result = await runCivilizationIntegrationAudit()

    expect(result.checkpoint.tick).toBe(720)
    expect(result.uninterrupted.tick).toBe(888)
    expect(result.recovered).toEqual(result.uninterrupted)
    expect(result.recoveryMatchesUninterrupted).toBe(true)

    expect(result.uninterrupted.geography.cellCount).toBeGreaterThan(0)
    expect(result.uninterrupted.population.livingPeople).toBeGreaterThan(0)
    expect(result.uninterrupted.households.count).toBeGreaterThan(0)
    expect(result.uninterrupted.social.relationshipCount).toBeGreaterThan(0)
    expect(result.uninterrupted.material.householdFoodUnits).toBeGreaterThanOrEqual(0)
    expect(result.uninterrupted.civic.communityCount).toBeGreaterThan(0)
    expect(result.uninterrupted.learning.knowledgeRecords).toBeGreaterThan(0)
  }, 60_000)
})
