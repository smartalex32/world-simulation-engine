import { beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_PREINDUSTRIAL_PACK } from '../../contentPacks/defaultPreindustrial'
import { createContentPackRuntime } from '../../contentPacks/runtime'
import type { SimulationState } from '../domain/types'
import { SimulationEngine } from '../engine/engine'
import { createSnapshot, validateSnapshot } from '../serialization/snapshot'
import { CanonicalSimulationValidationError, type CanonicalValidationSubsystem, validateCanonicalSimulationState } from './canonicalState'

const runtime = createContentPackRuntime(DEFAULT_PREINDUSTRIAL_PACK)

const collectionCorruptions: readonly {
  name: string
  path: readonly string[]
  subsystem: CanonicalValidationSubsystem
  expectedPath: string
}[] = [
  { name: 'world cells', path: ['world', 'grid', 'cells'], subsystem: 'world', expectedPath: 'state.world.grid.cells' },
  { name: 'settlements', path: ['world', 'settlements'], subsystem: 'world', expectedPath: 'state.world.settlements' },
  { name: 'roads', path: ['world', 'roads'], subsystem: 'world', expectedPath: 'state.world.roads' },
  { name: 'people', path: ['people'], subsystem: 'population', expectedPath: 'state.people' },
  { name: 'cohorts', path: ['cohorts'], subsystem: 'population', expectedPath: 'state.cohorts' },
  { name: 'fidelity transitions', path: ['populationFidelity', 'transitions'], subsystem: 'population', expectedPath: 'state.populationFidelity.transitions' },
  { name: 'households', path: ['households'], subsystem: 'households', expectedPath: 'state.households' },
  { name: 'markets', path: ['markets'], subsystem: 'markets', expectedPath: 'state.markets' },
  { name: 'economy markets', path: ['economy', 'markets'], subsystem: 'economy', expectedPath: 'state.economy.markets' },
  { name: 'economy trades', path: ['economy', 'tradeTraces'], subsystem: 'economy', expectedPath: 'state.economy.tradeTraces' },
  { name: 'economy production', path: ['economy', 'productionTraces'], subsystem: 'economy', expectedPath: 'state.economy.productionTraces' },
  { name: 'economy wages', path: ['economy', 'wageTraces'], subsystem: 'economy', expectedPath: 'state.economy.wageTraces' },
  { name: 'organizations', path: ['organizations'], subsystem: 'organizations', expectedPath: 'state.organizations' },
  { name: 'infrastructure', path: ['infrastructure'], subsystem: 'infrastructure', expectedPath: 'state.infrastructure' },
  { name: 'governance', path: ['governance'], subsystem: 'governance', expectedPath: 'state.governance' },
  { name: 'disputes', path: ['disputes'], subsystem: 'disputes', expectedPath: 'state.disputes' },
  { name: 'parent-child links', path: ['parentChildLinks'], subsystem: 'households', expectedPath: 'state.parentChildLinks' },
  { name: 'activity locations', path: ['activityLocations'], subsystem: 'households', expectedPath: 'state.activityLocations' },
  { name: 'communities', path: ['communities'], subsystem: 'communities', expectedPath: 'state.communities' },
  { name: 'community counters', path: ['dailyCommunityCounters'], subsystem: 'communities', expectedPath: 'state.dailyCommunityCounters' },
  { name: 'relationships', path: ['relationships'], subsystem: 'relationships', expectedPath: 'state.relationships' },
  { name: 'random streams', path: ['randomStreams'], subsystem: 'randomStreams', expectedPath: 'state.randomStreams' },
]

describe('canonical simulation state validation', () => {
  let canonical: SimulationState

  beforeAll(async () => {
    canonical = structuredClone((await SimulationEngine.create('canonical-validator').snapshot()).state)
  })

  it('reports deterministic structured details for a cross-reference failure', async () => {
    const state = structuredClone(canonical)
    state.people[0]!.locationCellId = 'missing-cell'
    await expectCorruptSnapshot(state, { subsystem: 'population', path: `state.people.${state.people[0]!.id}.locationCellId`, code: 'missing-reference' })
  })

  it('reports the canonical collection path for an ordering failure', async () => {
    const state = structuredClone(canonical)
    state.people.reverse()
    await expectCorruptSnapshot(state, { subsystem: 'population', path: 'state.people', code: 'identity-or-ordering' })
  })

  it.each(collectionCorruptions)('rejects a digest-correct snapshot with a corrupt $name collection', async ({ path, subsystem, expectedPath }) => {
    const state = structuredClone(canonical)
    setPath(state, path, null)
    await expectCorruptSnapshot(state, { subsystem, path: expectedPath, code: 'shape' })
  })

  it('identifies important references across subsystem boundaries', async () => {
    const cases: readonly {
      name: string
      subsystem: CanonicalValidationSubsystem
      path: string
      corrupt(state: SimulationState): void
    }[] = [
      { name: 'market activity location', subsystem: 'markets', path: `state.markets.${canonical.markets[0]!.id}`, corrupt: (state) => { state.markets[0]!.activityLocationId = 'activity.missing' } },
      {
        name: 'organization member', subsystem: 'organizations', path: 'state.organizations.organization.school.validation',
        corrupt: (state) => {
          const market = state.markets[0]!
          state.organizations = [{ id: 'organization.school.validation', name: 'Validation school', kind: 'school', locationCellId: market.cellId, activityLocationId: market.activityLocationId, members: [{ personId: 'person-missing', role: 'learner' }], serviceCapacity: 1, sharedRuleIds: [] }]
        },
      },
      { name: 'governance representative', subsystem: 'governance', path: `state.governance.${canonical.governance[0]!.id}`, corrupt: (state) => { state.governance[0]!.representativeIds = ['person-missing'] } },
      { name: 'dispute participant', subsystem: 'disputes', path: 'state.disputes.dispute.person-0001|person-missing', corrupt: (state) => { state.disputes = [{ id: 'dispute.person-0001|person-missing', personAId: 'person-0001', personBId: 'person-missing', grievance: 1, incidents: 1, lastIncidentTick: 0, communityId: state.communities[0]!.catchment.id }] } },
      { name: 'relationship participant', subsystem: 'relationships', path: 'state.relationships.person-0001|person-missing', corrupt: (state) => { state.relationships = [{ id: 'person-0001|person-missing', personAId: 'person-0001', personBId: 'person-missing', familiarity: 1, interactionFrequency: 1, interactionCount: 1, lastInteractionTick: 1, aToB: { affection: 1, trust: 1, respect: 1, fear: 1 }, bToA: { affection: 1, trust: 1, respect: 1, fear: 1 } }] } },
      { name: 'household member', subsystem: 'households', path: 'state.households', corrupt: (state) => { state.households[0]!.memberIds = ['person-missing'] } },
      { name: 'infrastructure cell', subsystem: 'infrastructure', path: 'state.infrastructure', corrupt: (state) => { state.infrastructure[0]!.cellIds = ['missing-cell'] } },
      { name: 'economy wage household', subsystem: 'economy', path: 'state.economy', corrupt: (state) => { state.economy.wageTraces = [{ tick: 0, marketId: state.markets[0]!.id, householdId: 'household-missing', wageUnits: 1, workerCount: 1 }] } },
    ]

    for (const entry of cases) {
      const state = structuredClone(canonical)
      entry.corrupt(state)
      await expectCorruptSnapshot(state, { subsystem: entry.subsystem, path: entry.path }, entry.name)
    }
  })

  it('accepts an imported canonical snapshot that can restore and advance', async () => {
    const imported = await validateSnapshot(await createSnapshot(structuredClone(canonical)))
    const restored = await SimulationEngine.restore(imported)
    expect(() => restored.advance(1)).not.toThrow()
  })

  it('has no ambient dependency and returns the same error detail repeatedly', () => {
    const state = structuredClone(canonical)
    state.randomStreams = []
    const details = Array.from({ length: 2 }, () => {
      try {
        validateCanonicalSimulationState(state, runtime)
        throw new Error('Expected canonical validation to reject the corrupted random streams')
      } catch (error) {
        expect(error).toBeInstanceOf(CanonicalSimulationValidationError)
        return (error as CanonicalSimulationValidationError).detail
      }
    })
    expect(details[1]).toEqual(details[0])
  })
})

async function expectCorruptSnapshot(state: SimulationState, expected: Partial<CanonicalSimulationValidationError['detail']>, label?: string): Promise<void> {
  try {
    await validateSnapshot(await createSnapshot(state))
    throw new Error(`Expected canonical validation to reject ${label ?? expected.path ?? 'corrupted state'}`)
  } catch (error) {
    expect(error, label).toBeInstanceOf(CanonicalSimulationValidationError)
    expect((error as CanonicalSimulationValidationError).detail, label).toMatchObject(expected)
  }
}

function setPath(state: SimulationState, path: readonly string[], value: unknown): void {
  let target: Record<string, unknown> = state as unknown as Record<string, unknown>
  for (const segment of path.slice(0, -1)) target = target[segment] as Record<string, unknown>
  target[path[path.length - 1]!] = value
}
