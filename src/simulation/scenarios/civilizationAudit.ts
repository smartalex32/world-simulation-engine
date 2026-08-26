import type { SnapshotEnvelope } from '../domain/types'
import { SimulationEngine } from '../engine/engine'

/**
 * A fixed-seed, cross-system recovery audit. The intervals deliberately cross
 * daily, weekly, and monthly schedules without making elapsed host time part
 * of the authoritative result.
 */
export const CIVILIZATION_AUDIT_CONFIGURATION = Object.freeze({
  seed: 'civilization-integration-audit-v1',
  checkpointHours: 720,
  continuationHours: 168,
})

export interface CivilizationAuditEvidence {
  tick: number
  digest: string
  geography: { cellCount: number; settlementCount: number; roadCount: number }
  population: { detailedPeople: number; livingPeople: number; cohortPeople: number }
  households: { count: number; parentChildLinks: number }
  social: { relationshipCount: number; disputeCount: number }
  material: { marketCount: number; householdFoodUnits: number }
  civic: { communityCount: number; organizationCount: number; governanceCount: number }
  learning: { culturalExposures: number; languageAcquisitions: number; knowledgeRecords: number; techniqueCount: number }
  development: { retainedExperiences: number; retainedChanges: number }
}

export interface CivilizationIntegrationAuditResult {
  configuration: typeof CIVILIZATION_AUDIT_CONFIGURATION
  checkpoint: CivilizationAuditEvidence
  uninterrupted: CivilizationAuditEvidence
  recovered: CivilizationAuditEvidence
  recoveryMatchesUninterrupted: boolean
}

/**
 * Runs one canonical continuity audit. It is intentionally read-only from the
 * caller's point of view: the result is evidence for CI and release review,
 * not a new simulation rule or a performance claim.
 */
export async function runCivilizationIntegrationAudit(): Promise<CivilizationIntegrationAuditResult> {
  const engine = SimulationEngine.create(CIVILIZATION_AUDIT_CONFIGURATION.seed)
  engine.advance(CIVILIZATION_AUDIT_CONFIGURATION.checkpointHours)
  const checkpointSnapshot = await engine.snapshot()
  const recovered = await SimulationEngine.restore(checkpointSnapshot)

  engine.advance(CIVILIZATION_AUDIT_CONFIGURATION.continuationHours)
  recovered.advance(CIVILIZATION_AUDIT_CONFIGURATION.continuationHours)
  const uninterruptedSnapshot = await engine.snapshot()
  const recoveredSnapshot = await recovered.snapshot()

  return {
    configuration: CIVILIZATION_AUDIT_CONFIGURATION,
    checkpoint: summarize(checkpointSnapshot),
    uninterrupted: summarize(uninterruptedSnapshot),
    recovered: summarize(recoveredSnapshot),
    recoveryMatchesUninterrupted: uninterruptedSnapshot.digest === recoveredSnapshot.digest,
  }
}

function summarize(snapshot: SnapshotEnvelope): CivilizationAuditEvidence {
  const { state } = snapshot
  return {
    tick: state.tick,
    digest: snapshot.digest,
    geography: {
      cellCount: state.world.grid.cells.length,
      settlementCount: state.world.settlements.length,
      roadCount: state.world.roads?.length ?? 0,
    },
    population: {
      detailedPeople: state.people.length,
      livingPeople: state.people.filter((person) => person.lifeStatus !== 'dead').length,
      cohortPeople: state.cohorts.reduce((total, cohort) => total + cohort.populationCount, 0),
    },
    households: { count: state.households.length, parentChildLinks: state.parentChildLinks.length },
    social: { relationshipCount: state.relationships.length, disputeCount: state.disputes.length },
    material: {
      marketCount: state.markets.length,
      householdFoodUnits: state.households.reduce((total, household) => total + (household.inventory?.food ?? 0), 0),
    },
    civic: { communityCount: state.communities.length, organizationCount: state.organizations.length, governanceCount: state.governance.length },
    learning: {
      culturalExposures: state.people.reduce((total, person) => total + (person.culture?.exposureCount ?? 0), 0),
      languageAcquisitions: state.people.reduce((total, person) => total + (person.language?.acquisitionCount ?? 0), 0),
      knowledgeRecords: state.people.reduce((total, person) => total + Object.keys(person.knowledge ?? {}).length, 0),
      techniqueCount: state.people.reduce((total, person) => total + (person.techniques?.length ?? 0), 0),
    },
    development: {
      retainedExperiences: state.people.filter((person) => person.development.lastExperience !== undefined || person.development.broader?.lastExperience !== undefined).length,
      retainedChanges: state.people.filter((person) => person.development.lastChange !== undefined || person.development.broader?.lastChange !== undefined).length,
    },
  }
}
