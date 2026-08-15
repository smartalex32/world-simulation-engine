import { describe, expect, it } from 'vitest'
import type { PersonState, RelationshipState } from '../domain/types'
import { Pcg32, hashSeed } from '../rng/pcg32'
import { resolveEncounters, type EncounterContext } from './encounters'
import { relationshipId } from './model'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { createDefaultPersonVariableValues } from '../variables/storage'
import { createParentCuriosityExposureAccumulator } from '../exposure/model'

function person(id: string, sociability: number, locationCellId: string): PersonState {
  return {
    id,
    ageYears: 30,
    ageHoursIntoYear: 0,
    locationCellId,
    homeCellId: locationCellId,
    householdId: `household-${id}`,
    activityScheduleId: 'activity.schedule.adult.v1',
    currentActivity: { kind: 'commons', locationId: locationCellId, sinceTick: 0 },
    originTraces: [],
    development: { exposures: [{ ...createParentCuriosityExposureAccumulator(1), sourcePersonIds: [] }] },
    variables: createDefaultPersonVariableValues({
      [PERSON_VARIABLE_ID.sociability]: sociability,
      [PERSON_VARIABLE_ID.hunger]: 100,
    }),
    knownCellIds: [locationCellId],
  }
}

function encounterContext(people: PersonState[], occupantsByActivityLocation: ReadonlyMap<string, readonly string[]>): EncounterContext {
  return {
    peopleById: new Map(people.map((entry) => [entry.id, entry])),
    occupantsByActivityLocation,
    activityLocationsById: new Map([...occupantsByActivityLocation.keys()].map((id) => [id, { id, kind: 'commons' as const, cellId: id }])),
    socializerIds: new Set(people.map((entry) => entry.id)),
    relationshipsById: new Map<string, RelationshipState>(),
  }
}

function runGeographyScenario(seed: string, context: EncounterContext, hours: number): { encounters: number; relationships: number } {
  const rng = new Pcg32(hashSeed(seed))
  const relationshipIds = new Set<string>()
  let encounters = 0
  for (let hour = 0; hour < hours; hour += 1) {
    const resolved = resolveEncounters(context, rng)
    encounters += resolved.length
    for (const encounter of resolved) relationshipIds.add(relationshipId(encounter.initiatorId, encounter.participantId))
  }
  return { encounters, relationships: relationshipIds.size }
}

describe('controlled social geography scenarios', () => {
  it('produces materially more encounters and relationships in dense shared-cell geography', () => {
    const ids = Array.from({ length: 24 }, (_, index) => `person-${index.toString().padStart(2, '0')}`)
    const densePeople = ids.map((id) => person(id, 500, 'dense-center'))
    const densePools = new Map<string, readonly string[]>([['dense-center', ids]])

    const dispersedPoolEntries: Array<[string, readonly string[]]> = [
      ['dispersed-00', ids.slice(0, 2)],
      ['dispersed-01', ids.slice(2, 4)],
      ['dispersed-02', ids.slice(4, 6)],
      ...ids.slice(6).map((id, index) => [`dispersed-${(index + 3).toString().padStart(2, '0')}`, [id]] as [string, readonly string[]]),
    ]
    const dispersedCellByPerson = new Map(dispersedPoolEntries.flatMap(([cellId, occupants]) => occupants.map((id) => [id, cellId] as const)))
    const dispersedPeople = ids.map((id) => person(id, 500, dispersedCellByPerson.get(id) ?? 'missing'))
    const dispersedPools = new Map<string, readonly string[]>(dispersedPoolEntries)

    let denseEncounters = 0
    let denseRelationships = 0
    let dispersedEncounters = 0
    let dispersedRelationships = 0
    for (let seed = 0; seed < 32; seed += 1) {
      const dense = runGeographyScenario(`geography-${seed}`, encounterContext(densePeople, densePools), 6)
      const dispersed = runGeographyScenario(`geography-${seed}`, encounterContext(dispersedPeople, dispersedPools), 6)
      denseEncounters += dense.encounters
      denseRelationships += dense.relationships
      dispersedEncounters += dispersed.encounters
      dispersedRelationships += dispersed.relationships
    }

    expect(denseEncounters).toBeGreaterThan(dispersedEncounters * 3)
    expect(denseRelationships).toBeGreaterThan(dispersedRelationships * 5)
  })

  it('produces a higher positive-outcome rate for high-sociability pairs across encounter seeds', () => {
    const pools = new Map<string, readonly string[]>([['shared', ['a', 'b']]])
    const lowContext = encounterContext([person('a', 0, 'shared'), person('b', 0, 'shared')], pools)
    const highContext = encounterContext([person('a', 1000, 'shared'), person('b', 1000, 'shared')], pools)
    let lowPositive = 0
    let highPositive = 0
    const trials = 750

    for (let seed = 0; seed < trials; seed += 1) {
      if (resolveEncounters(lowContext, new Pcg32(hashSeed(`outcome-${seed}`)))[0]?.outcome === 'positive') lowPositive += 1
      if (resolveEncounters(highContext, new Pcg32(hashSeed(`outcome-${seed}`)))[0]?.outcome === 'positive') highPositive += 1
    }

    expect(highPositive / trials).toBeGreaterThan(lowPositive / trials + 0.15)
    expect(highPositive).toBeGreaterThan(lowPositive * 1.5)
  })
})
