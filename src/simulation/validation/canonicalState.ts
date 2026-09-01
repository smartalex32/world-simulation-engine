import type { ContentPackRuntime } from '../../contentPacks/runtime'
import { validateDetailedPopulationState } from '../agents/invariants'
import { validateDisputeState } from '../conflict/invariants'
import type { SimulationState } from '../domain/types'
import { validateCommunitySimulationState } from '../community/invariants'
import { validateEconomyState, validateMarketState } from '../economy/invariants'
import { validateGovernanceState } from '../governance/invariants'
import { validateHouseholdActivityState } from '../households/invariants'
import { validateInfrastructureState } from '../infrastructure/invariants'
import { validateOrganizationState } from '../organizations/invariants'
import { validateRelationshipState } from '../relationships/invariants'
import { validateRandomStreams } from '../rng/invariants'
import { CanonicalSimulationValidationError, failCanonicalValidation as fail, type CanonicalValidationSubsystem } from './error'

export { CanonicalSimulationValidationError, type CanonicalValidationSubsystem } from './error'

/**
 * Validates authoritative state independently of snapshot envelopes, UI, I/O,
 * clocks, and randomness. This is the one validator for created, restored,
 * runtime-mutated, and persisted canonical state.
 */
export function validateCanonicalSimulationState(state: SimulationState, runtime: Pick<ContentPackRuntime, 'variables' | 'organizationDefinitionById'>): void {
  if (!state || typeof state !== 'object') fail('world', 'state', 'shape', 'Simulation state must be an object')
  if (!state.config || typeof state.config !== 'object') fail('world', 'state.config', 'shape', 'Simulation configuration is invalid')
  if (!state.world || typeof state.world !== 'object' || !state.world.grid || typeof state.world.grid !== 'object') fail('world', 'state.world.grid', 'shape', 'Simulation world grid is invalid')
  const { width, height, cells } = state.world.grid
  requireCollection(cells, 'world', 'state.world.grid.cells')
  requireCollection(state.world.settlements, 'world', 'state.world.settlements')
  if (state.world.roads !== undefined) requireCollection(state.world.roads, 'world', 'state.world.roads')
  requireCollection(state.people, 'population', 'state.people')
  requireCollection(state.cohorts, 'population', 'state.cohorts')
  requireCollection(state.households, 'households', 'state.households')
  requireCollection(state.markets, 'markets', 'state.markets')
  requireCollection(state.organizations, 'organizations', 'state.organizations')
  if (!state.organizationLifecycle || !Number.isSafeInteger(state.organizationLifecycle.nextOrganizationSequence) || state.organizationLifecycle.nextOrganizationSequence < 1) fail('organizations', 'state.organizationLifecycle', 'lifecycle', 'Organization lifecycle state is invalid'); requireCollection(state.organizationLifecycle.latestFormationTraces, 'organizations', 'state.organizationLifecycle.latestFormationTraces'); requireCollection(state.organizationLifecycle.latestMembershipTraces, 'organizations', 'state.organizationLifecycle.latestMembershipTraces')
  requireCollection(state.infrastructure, 'infrastructure', 'state.infrastructure')
  requireCollection(state.governance, 'governance', 'state.governance')
  requireCollection(state.disputes, 'disputes', 'state.disputes')
  requireCollection(state.parentChildLinks, 'households', 'state.parentChildLinks')
  requireCollection(state.activityLocations, 'households', 'state.activityLocations')
  requireCollection(state.communities, 'communities', 'state.communities')
  requireCollection(state.dailyCommunityCounters, 'communities', 'state.dailyCommunityCounters')
  requireCollection(state.relationships, 'relationships', 'state.relationships')
  requireCollection(state.randomStreams, 'randomStreams', 'state.randomStreams')
  if (!state.populationFidelity || typeof state.populationFidelity !== 'object') fail('population', 'state.populationFidelity', 'shape', 'Population fidelity state is invalid')
  requireCollection(state.populationFidelity.transitions, 'population', 'state.populationFidelity.transitions')
  if (!state.economy || typeof state.economy !== 'object') fail('economy', 'state.economy', 'shape', 'Economy state is invalid')
  requireCollection(state.economy.markets, 'economy', 'state.economy.markets')
  requireCollection(state.economy.tradeTraces, 'economy', 'state.economy.tradeTraces')
  requireCollection(state.economy.productionTraces, 'economy', 'state.economy.productionTraces')
  requireCollection(state.economy.wageTraces, 'economy', 'state.economy.wageTraces')
  for (const [path, counters] of [
    ['state.dailySpatialCounters', state.dailySpatialCounters],
    ['state.dailySocialCounters', state.dailySocialCounters],
    ['state.dailyActivityCounters', state.dailyActivityCounters],
    ['state.dailyDevelopmentCounters', state.dailyDevelopmentCounters],
    ['state.dailyLifeCycleCounters', state.dailyLifeCycleCounters],
    ['state.dailyEconomicCounters', state.dailyEconomicCounters],
    ['state.dailyEnvironmentalCounters', state.dailyEnvironmentalCounters],
  ] as const) if (!counters || typeof counters !== 'object' || Array.isArray(counters)) fail('counters', path, 'shape', `${path} is invalid`)

  if (typeof state.runId !== 'string' || state.runId.length === 0 || !Number.isSafeInteger(state.nextEventSequence) || state.nextEventSequence < 1) fail('world', 'state.runId', 'run-identity', 'Simulation run identity or next event sequence is invalid')
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) fail('world', 'state.world.grid', 'dimensions', 'World grid dimensions are invalid')
  if (cells.length !== width * height) fail('world', 'state.world.grid.cells', 'cell-count', 'World cell count does not match bounds')
  if (new Set(cells.map((cell) => cell.id)).size !== cells.length) fail('world', 'state.world.grid.cells', 'duplicate-id', 'World contains duplicate cell IDs')
  for (const cell of cells) if (!Number.isInteger(cell.foodAmount) || cell.foodAmount < 0 || cell.foodAmount > cell.resourceCapacity) fail('world', `state.world.grid.cells.${cell.id}`, 'food-stock', `Cell ${cell.id} has invalid food stock`)
  if (!Number.isSafeInteger(state.tick) || state.tick < 0) fail('world', 'state.tick', 'clock', 'Simulation tick is invalid')

  validateDetailedPopulationState(state, runtime)
  validateMarketState(state)
  validateOrganizationState(state, runtime.organizationDefinitionById)
  validateGovernanceState(state)
  validateDisputeState(state)
  validateRelationshipState(state)

  const social = state.dailySocialCounters
  if (Object.values(social).some((value) => !Number.isSafeInteger(value) || value < 0)) fail('counters', 'state.dailySocialCounters', 'negative-or-non-integer', 'Daily social counters are invalid')
  if (social.positiveEncounters + social.neutralEncounters + social.tenseEncounters !== social.encounters) fail('counters', 'state.dailySocialCounters', 'outcome-sum', 'Daily social outcome counters do not sum to encounters')
  if (social.relationshipsFormed > social.encounters) fail('counters', 'state.dailySocialCounters.relationshipsFormed', 'formation-count', 'Daily relationship formations exceed encounters')
  const spatial = state.dailySpatialCounters
  if (Object.values(spatial).some((value) => !Number.isSafeInteger(value) || value < 0)) fail('counters', 'state.dailySpatialCounters', 'negative-or-non-integer', 'Daily spatial counters are invalid')
  validateRandomStreams(state.randomStreams)
  validateLocal('households', () => validateHouseholdActivityState(state), 'state.households')
  validateLocal('infrastructure', () => validateInfrastructureState(state), 'state.infrastructure')
  validateLocal('economy', () => validateEconomyState(state), 'state.economy')
  validateLocal('communities', () => validateCommunitySimulationState(state), 'state.communities')
}

function validateLocal(subsystem: CanonicalValidationSubsystem, validate: () => void, path = 'state'): void {
  try { validate() } catch (error) {
    if (error instanceof CanonicalSimulationValidationError) throw error
    fail(subsystem, path, 'invariant', error instanceof Error ? error.message : 'Canonical state invariant failed')
  }
}

function requireCollection(value: unknown, subsystem: CanonicalValidationSubsystem, path: string): asserts value is readonly unknown[] {
  if (!Array.isArray(value)) fail(subsystem, path, 'shape', `${path} must be an array`)
}
