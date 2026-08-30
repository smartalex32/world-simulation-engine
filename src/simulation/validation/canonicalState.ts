import type { ContentPackRuntime } from '../../contentPacks/runtime'
import type { SimulationState } from '../domain/types'
import { validateCommunitySimulationState } from '../community/invariants'
import { validateEconomyState, validateHouseholdActivityState, validateInfrastructureState } from '../engine/invariants'
import { relationshipId } from '../relationships/model'
import { HOUSEHOLD_GENERATION_STREAM } from '../households/config'
import { validatePersonVariableValues } from '../variables/storage'

export type CanonicalValidationSubsystem = 'world' | 'population' | 'markets' | 'organizations' | 'governance' | 'disputes' | 'relationships' | 'counters' | 'randomStreams' | 'households' | 'infrastructure' | 'economy' | 'communities'

/** A stable, machine-readable error emitted at canonical state boundaries. */
export class CanonicalSimulationValidationError extends Error {
  constructor(readonly detail: { subsystem: CanonicalValidationSubsystem; path: string; code: string; message: string }) {
    super(detail.message)
    this.name = 'CanonicalSimulationValidationError'
  }
}

/**
 * Validates authoritative state independently of snapshot envelopes, UI, I/O,
 * clocks, and randomness. This is the one validator for created, restored,
 * runtime-mutated, and persisted canonical state.
 */
export function validateCanonicalSimulationState(state: SimulationState, runtime: Pick<ContentPackRuntime, 'variables'>): void {
  validateLocal('households', () => validateHouseholdActivityState(state))
  validateLocal('infrastructure', () => validateInfrastructureState(state))
  validateLocal('economy', () => validateEconomyState(state))
  validateLocal('communities', () => validateCommunitySimulationState(state))

  const { width, height, cells } = state.world.grid
  if (typeof state.runId !== 'string' || state.runId.length === 0 || !Number.isSafeInteger(state.nextEventSequence) || state.nextEventSequence < 1) fail('world', 'state.runId', 'run-identity', 'Simulation run identity or next event sequence is invalid')
  if (cells.length !== width * height) fail('world', 'state.world.grid.cells', 'cell-count', 'World cell count does not match bounds')
  if (new Set(cells.map((cell) => cell.id)).size !== cells.length) fail('world', 'state.world.grid.cells', 'duplicate-id', 'World contains duplicate cell IDs')
  for (const cell of cells) if (!Number.isInteger(cell.foodAmount) || cell.foodAmount < 0 || cell.foodAmount > cell.resourceCapacity) fail('world', `state.world.grid.cells.${cell.id}`, 'food-stock', `Cell ${cell.id} has invalid food stock`)
  if (!Number.isSafeInteger(state.tick) || state.tick < 0) fail('world', 'state.tick', 'clock', 'Simulation tick is invalid')

  if (new Set(state.people.map((person) => person.id)).size !== state.people.length || state.people.some((person, index) => index > 0 && state.people[index - 1]!.id >= person.id)) fail('population', 'state.people', 'identity-or-ordering', 'Population is not uniquely canonically ordered')
  const personIds = new Set(state.people.map((person) => person.id))
  const cellIds = new Set(cells.map((cell) => cell.id))
  const cellsById = new Map(cells.map((cell) => [cell.id, cell]))
  const locationsById = new Map(state.activityLocations.map((location) => [location.id, location]))
  const communityIds = new Set(state.communities.map((community) => community.catchment.id))
  const marketIds = new Set(state.markets.map((market) => market.id))
  if (marketIds.size !== state.markets.length || state.markets.some((market, index) => index > 0 && state.markets[index - 1]!.id >= market.id)) fail('markets', 'state.markets', 'identity-or-ordering', 'Markets are not uniquely canonically ordered')
  for (const market of state.markets) if (!cellsById.get(market.cellId)?.movementCost || locationsById.get(market.activityLocationId)?.cellId !== market.cellId) fail('markets', `state.markets.${market.id}`, 'missing-reference', `Market ${market.id} has an invalid location`)
  const organizationIds = new Set(state.organizations.map((organization) => organization.id))
  if (organizationIds.size !== state.organizations.length || state.organizations.some((organization, index) => index > 0 && state.organizations[index - 1]!.id >= organization.id)) fail('organizations', 'state.organizations', 'identity-or-ordering', 'Organizations are not uniquely canonically ordered')
  for (const organization of state.organizations) {
    if (organization.kind !== 'school') fail('organizations', `state.organizations.${organization.id}.kind`, 'kind', `Organization ${organization.id} has invalid kind`)
    if (organization.members.some((member) => member.role !== 'learner')) fail('organizations', `state.organizations.${organization.id}.members`, 'member-role', `Organization ${organization.id} has invalid member role`)
    if (!cellsById.get(organization.locationCellId)?.movementCost || locationsById.get(organization.activityLocationId)?.cellId !== organization.locationCellId || new Set(organization.members.map((member) => member.personId)).size !== organization.members.length || organization.members.some((member) => !personIds.has(member.personId))) fail('organizations', `state.organizations.${organization.id}`, 'member-or-location-reference', `Organization ${organization.id} has invalid members or location`)
    if (!Number.isSafeInteger(organization.serviceCapacity) || organization.serviceCapacity < 1) fail('organizations', `state.organizations.${organization.id}.serviceCapacity`, 'capacity', `Organization ${organization.id} has invalid service capacity`)
  }
  for (const person of state.people) {
    if (!cellIds.has(person.locationCellId)) fail('population', `state.people.${person.id}.locationCellId`, 'missing-reference', `Person ${person.id} occupies a missing cell`)
    validateLocal('population', () => validatePersonVariableValues(person.variables, runtime.variables), `state.people.${person.id}.variables`)
    if (!person.knowledge || Object.keys(person.knowledge).sort().join('|') !== 'knowledge.foraging|knowledge.localTerrain') fail('population', `state.people.${person.id}.knowledge`, 'knowledge-records', `Person ${person.id} contains invalid knowledge records`)
    if (Object.values(person.knowledge).some((value) => !Number.isSafeInteger(value) || value < 0 || value > 1000)) fail('population', `state.people.${person.id}.knowledge`, 'knowledge-values', `Person ${person.id} contains invalid knowledge values`)
    if (typeof person.schoolLearningHours !== 'number' || !Number.isSafeInteger(person.schoolLearningHours) || person.schoolLearningHours < 0) fail('population', `state.people.${person.id}.schoolLearningHours`, 'school-learning-hours', `Person ${person.id} has invalid school learning hours`)
    if (person.schoolAttendance && (!organizationIds.has(person.schoolAttendance.schoolId) || !Number.isSafeInteger(person.schoolAttendance.returnTick) || person.schoolAttendance.returnTick <= state.tick)) fail('population', `state.people.${person.id}.schoolAttendance`, 'school-attendance', `Person ${person.id} has invalid school attendance state`)
    if (person.journey) {
      const destination = cellsById.get(person.journey.destinationCellId)
      if (!destination?.movementCost) fail('population', `state.people.${person.id}.journey.destinationCellId`, 'journey-destination', `Person ${person.id} is traveling to an invalid cell`)
      if (!Number.isInteger(person.journey.remainingCost) || person.journey.remainingCost <= 0 || person.journey.remainingCost > person.journey.totalCost) fail('population', `state.people.${person.id}.journey`, 'journey-progress', `Person ${person.id} has invalid journey progress`)
    }
    if (person.lastEncounter) {
      if (!personIds.has(person.lastEncounter.otherPersonId) || person.lastEncounter.otherPersonId === person.id || person.lastEncounter.tick > state.tick) fail('population', `state.people.${person.id}.lastEncounter`, 'encounter-reference', `Person ${person.id} has an invalid last encounter`)
      const location = locationsById.get(person.lastEncounter.activityLocationId)
      if (!location || location.cellId !== person.lastEncounter.cellId) fail('population', `state.people.${person.id}.lastEncounter.activityLocationId`, 'encounter-location', `Person ${person.id} has an invalid encounter activity location`)
    }
  }
  const governanceIds = new Set(state.governance.map((entry) => entry.id))
  if (governanceIds.size !== state.governance.length || state.governance.length !== state.communities.length || state.governance.some((entry, index) => entry.communityId !== state.communities[index]?.catchment.id)) fail('governance', 'state.governance', 'identity-or-ordering', 'Governance does not match canonical community registry order')
  for (const entry of state.governance) if (!communityIds.has(entry.communityId) || entry.id !== `governance.${entry.communityId}` || !Array.isArray(entry.representativeIds) || entry.representativeIds.some((id, index) => !personIds.has(id) || (index > 0 && entry.representativeIds[index - 1]! >= id)) || [entry.legitimacy, entry.serviceAccessPermille, entry.contributionFairnessPermille].some((value) => !Number.isSafeInteger(value) || value < 0 || value > 1000) || !Number.isSafeInteger(entry.lastUpdatedTick) || entry.lastUpdatedTick > state.tick) fail('governance', `state.governance.${entry.id}`, 'state-or-reference', `Governance ${entry.id} has invalid state or references`)
  const disputeIds = new Set(state.disputes.map((entry) => entry.id))
  if (disputeIds.size !== state.disputes.length || state.disputes.some((entry, index) => index > 0 && state.disputes[index - 1]!.id >= entry.id)) fail('disputes', 'state.disputes', 'identity-or-ordering', 'Disputes are not uniquely canonically ordered')
  for (const dispute of state.disputes) if (!personIds.has(dispute.personAId) || !personIds.has(dispute.personBId) || dispute.personAId >= dispute.personBId || dispute.id !== `dispute.${dispute.personAId}|${dispute.personBId}` || !communityIds.has(dispute.communityId) || !Number.isSafeInteger(dispute.grievance) || dispute.grievance < 0 || dispute.grievance > 1000 || !Number.isSafeInteger(dispute.incidents) || dispute.incidents < 1 || !Number.isSafeInteger(dispute.lastIncidentTick) || dispute.lastIncidentTick < 1 || dispute.lastIncidentTick > state.tick) fail('disputes', `state.disputes.${dispute.id}`, 'state-or-reference', `Dispute ${dispute.id} has invalid state or references`)

  if (new Set(state.relationships.map((relationship) => relationship.id)).size !== state.relationships.length) fail('relationships', 'state.relationships', 'duplicate-id', 'Relationships contain duplicate IDs')
  const orderedRelationshipIds = state.relationships.map((relationship) => relationship.id).sort()
  if (state.relationships.some((relationship, index) => relationship.id !== orderedRelationshipIds[index])) fail('relationships', 'state.relationships', 'ordering', 'Relationships are not in canonical order')
  for (const relationship of state.relationships) {
    if (relationship.personAId >= relationship.personBId || relationship.id !== relationshipId(relationship.personAId, relationship.personBId)) fail('relationships', `state.relationships.${relationship.id}`, 'identity', `Relationship ${relationship.id} is not canonical`)
    if (!personIds.has(relationship.personAId) || !personIds.has(relationship.personBId)) fail('relationships', `state.relationships.${relationship.id}`, 'missing-reference', `Relationship ${relationship.id} contains a missing person`)
    const bounded = [relationship.familiarity, relationship.interactionFrequency, ...Object.values(relationship.aToB), ...Object.values(relationship.bToA)]
    if (bounded.some((value) => !Number.isInteger(value) || value < 0 || value > 1000)) fail('relationships', `state.relationships.${relationship.id}`, 'dimensions', `Relationship ${relationship.id} has invalid dimensions`)
    if (!Number.isSafeInteger(relationship.interactionCount) || relationship.interactionCount < 1 || !Number.isSafeInteger(relationship.lastInteractionTick) || relationship.lastInteractionTick < 1 || relationship.lastInteractionTick > state.tick) fail('relationships', `state.relationships.${relationship.id}`, 'interaction-state', `Relationship ${relationship.id} has invalid interaction state`)
  }

  const social = state.dailySocialCounters
  if (Object.values(social).some((value) => !Number.isSafeInteger(value) || value < 0)) fail('counters', 'state.dailySocialCounters', 'negative-or-non-integer', 'Daily social counters are invalid')
  if (social.positiveEncounters + social.neutralEncounters + social.tenseEncounters !== social.encounters) fail('counters', 'state.dailySocialCounters', 'outcome-sum', 'Daily social outcome counters do not sum to encounters')
  if (social.relationshipsFormed > social.encounters) fail('counters', 'state.dailySocialCounters.relationshipsFormed', 'formation-count', 'Daily relationship formations exceed encounters')
  const spatial = state.dailySpatialCounters
  if (Object.values(spatial).some((value) => !Number.isSafeInteger(value) || value < 0)) fail('counters', 'state.dailySpatialCounters', 'negative-or-non-integer', 'Daily spatial counters are invalid')
  validateRandomStreams(state.randomStreams)
}

function validateRandomStreams(value: unknown): void {
  if (!Array.isArray(value)) fail('randomStreams', 'state.randomStreams', 'shape', 'Snapshot contains invalid random streams')
  const names: string[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') fail('randomStreams', 'state.randomStreams', 'entry', 'Snapshot contains an invalid random stream')
    const stream = entry as { name?: unknown; stateHex?: unknown; incrementHex?: unknown }
    if (typeof stream.name !== 'string' || !/^[0-9a-f]{16}$/i.test(String(stream.stateHex)) || !/^[0-9a-f]{16}$/i.test(String(stream.incrementHex))) fail('randomStreams', 'state.randomStreams', 'entry', 'Snapshot contains an invalid random stream')
    names.push(stream.name)
  }
  if (!names.every((name, index) => index === 0 || (names[index - 1] as string) < name)) fail('randomStreams', 'state.randomStreams', 'ordering', 'Snapshot random streams are not in canonical order')
  for (const required of Object.values(HOUSEHOLD_GENERATION_STREAM)) if (!names.includes(required)) fail('randomStreams', 'state.randomStreams', 'missing-required-stream', `Snapshot is missing random stream: ${required}`)
}

function validateLocal(subsystem: CanonicalValidationSubsystem, validate: () => void, path = 'state'): void {
  try { validate() } catch (error) {
    if (error instanceof CanonicalSimulationValidationError) throw error
    fail(subsystem, path, 'invariant', error instanceof Error ? error.message : 'Canonical state invariant failed')
  }
}

function fail(subsystem: CanonicalValidationSubsystem, path: string, code: string, message: string): never {
  throw new CanonicalSimulationValidationError({ subsystem, path, code, message })
}
