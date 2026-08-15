import { describe, expect, it } from 'vitest'
import type { PersonState } from '../domain/types'
import { Pcg32, hashSeed } from '../rng/pcg32'
import { encounterOutcomeWeights, resolveEncounters, type EncounterContext } from './encounters'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { createDefaultPersonVariableValues } from '../variables/storage'

function person(id: string, sociability = 500, cellId = 'cell-a'): PersonState {
  return {
    id,
    ageYears: 30,
    ageHoursIntoYear: 0,
    locationCellId: cellId,
    homeCellId: cellId,
    householdId: `household-${id}`,
    activityScheduleId: 'activity.schedule.adult.v1',
    currentActivity: { kind: 'commons', locationId: cellId, sinceTick: 0 },
    originTraces: [],
    variables: createDefaultPersonVariableValues({
      [PERSON_VARIABLE_ID.sociability]: sociability,
      [PERSON_VARIABLE_ID.hunger]: 100,
    }),
    knownCellIds: [cellId],
  }
}

function context(people: PersonState[], pools: ReadonlyMap<string, readonly string[]>, socializers: string[]): EncounterContext {
  return {
    peopleById: new Map(people.map((entry) => [entry.id, entry])),
    occupantsByActivityLocation: pools,
    activityLocationsById: new Map([...pools.keys()].map((id) => [id, { id, kind: 'commons' as const, cellId: id }])),
    socializerIds: new Set(socializers),
    relationshipsById: new Map(),
  }
}

describe('encounter resolution', () => {
  it('uses sociability and familiarity in an inspectable outcome distribution', () => {
    const low = encounterOutcomeWeights(person('a', 0), person('b', 0), 0)
    const high = encounterOutcomeWeights(person('a', 1000), person('b', 1000), 1000)
    expect(high.positive).toBeGreaterThan(low.positive)
    expect(high.tense).toBeLessThan(low.tense)
    expect(high.neutral).toBe(low.neutral)
  })

  it('requires co-location and at least one socializer', () => {
    const people = [person('a'), person('b'), person('c', 500, 'cell-b')]
    const pools = new Map<string, readonly string[]>([['cell-a', ['a', 'b']], ['cell-b', ['c']]])
    expect(resolveEncounters(context(people, pools, []), new Pcg32(hashSeed('none')))).toEqual([])
    const result = resolveEncounters(context(people, pools, ['a']), new Pcg32(hashSeed('one')))
    expect(result).toHaveLength(1)
    expect(new Set([result[0]?.initiatorId, result[0]?.participantId])).toEqual(new Set(['a', 'b']))
    expect(result[0]?.cellId).toBe('cell-a')
  })

  it('separates different household homes within one cell but permits a shared commons pool', () => {
    const first = person('a', 500, 'shared-cell')
    const second = person('b', 500, 'shared-cell')
    first.currentActivity = { kind: 'home', locationId: 'activity.home.household-a', sinceTick: 0 }
    second.currentActivity = { kind: 'home', locationId: 'activity.home.household-b', sinceTick: 0 }
    const homeContext: EncounterContext = {
      peopleById: new Map([['a', first], ['b', second]]),
      occupantsByActivityLocation: new Map([
        ['activity.home.household-a', ['a']],
        ['activity.home.household-b', ['b']],
      ]),
      activityLocationsById: new Map([
        ['activity.home.household-a', { id: 'activity.home.household-a', kind: 'home', cellId: 'shared-cell', householdId: 'household-a' }],
        ['activity.home.household-b', { id: 'activity.home.household-b', kind: 'home', cellId: 'shared-cell', householdId: 'household-b' }],
      ]),
      socializerIds: new Set(['a']),
      relationshipsById: new Map(),
    }
    expect(resolveEncounters(homeContext, new Pcg32(hashSeed('separate-homes')))).toEqual([])

    first.currentActivity = { kind: 'commons', locationId: 'activity.commons.shared-cell', sinceTick: 1 }
    second.currentActivity = { kind: 'commons', locationId: 'activity.commons.shared-cell', sinceTick: 1 }
    const commonsContext: EncounterContext = {
      ...homeContext,
      occupantsByActivityLocation: new Map([['activity.commons.shared-cell', ['a', 'b']]]),
      activityLocationsById: new Map([['activity.commons.shared-cell', { id: 'activity.commons.shared-cell', kind: 'commons', cellId: 'shared-cell' }]]),
    }
    expect(resolveEncounters(commonsContext, new Pcg32(hashSeed('shared-commons')))).toHaveLength(1)
  })

  it('excludes travelers even if a stale activity pool contains their ID', () => {
    const traveler = person('a')
    traveler.journey = { kind: 'move', destinationCellId: 'cell-b', totalCost: 1800, remainingCost: 800 }
    traveler.currentActivity = { kind: 'travel', locationId: null, sinceTick: 1 }
    const companion = person('b')
    const pools = new Map<string, readonly string[]>([['cell-a', ['a', 'b']]])
    expect(resolveEncounters(context([traveler, companion], pools, ['a']), new Pcg32(hashSeed('traveler')))).toEqual([])
  })

  it('pairs a dense pool without self-interaction or duplicate participation', () => {
    const people = Array.from({ length: 9 }, (_, index) => person(`person-${index}`))
    const ids = people.map((entry) => entry.id)
    const result = resolveEncounters(
      context(people, new Map([['cell-a', ids]]), ids.slice(0, 6)),
      new Pcg32(hashSeed('dense')),
    )
    expect(result).toHaveLength(4)
    const participants = result.flatMap((entry) => [entry.initiatorId, entry.participantId])
    expect(new Set(participants).size).toBe(participants.length)
    expect(result.every((entry) => entry.initiatorId !== entry.participantId)).toBe(true)
  })

  it('is reproducible for the same ordered inputs and seed', () => {
    const people = Array.from({ length: 8 }, (_, index) => person(`person-${index}`, index * 100))
    const ids = people.map((entry) => entry.id)
    const input = context(people, new Map([['cell-a', [...ids].reverse()]]), ids.slice(0, 5))
    const first = resolveEncounters(input, new Pcg32(hashSeed('repeatable')))
    const second = resolveEncounters(input, new Pcg32(hashSeed('repeatable')))
    expect(first).toEqual(second)
    expect(first.every((entry) => entry.probabilityPermille > 0 && entry.probabilityPermille <= 1000)).toBe(true)
  })

  it('produces more positive outcomes for high-sociability pairs across many seeds', () => {
    let lowPositive = 0
    let highPositive = 0
    for (let seed = 0; seed < 500; seed += 1) {
      const pools = new Map<string, readonly string[]>([['cell-a', ['a', 'b']]])
      const low = resolveEncounters(context([person('a', 0), person('b', 0)], pools, ['a']), new Pcg32(hashSeed(`social-${seed}`)))
      const high = resolveEncounters(context([person('a', 1000), person('b', 1000)], pools, ['a']), new Pcg32(hashSeed(`social-${seed}`)))
      if (low[0]?.outcome === 'positive') lowPositive += 1
      if (high[0]?.outcome === 'positive') highPositive += 1
    }
    expect(highPositive).toBeGreaterThan(lowPositive * 1.8)
  })

  it('turns equivalent dense and dispersed populations into different encounter rates across seeds', () => {
    const ids = Array.from({ length: 20 }, (_, index) => `person-${index.toString().padStart(2, '0')}`)
    const densePeople = ids.map((id) => person(id, 500, 'dense'))
    const socializers = ids.slice(0, 10)
    const densePools = new Map<string, readonly string[]>([['dense', ids]])
    const dispersedPools = new Map(ids.map((id, index) => [`dispersed-${index}`, [id] as readonly string[]]))
    const dispersedPeople = ids.map((id, index) => person(id, 500, `dispersed-${index}`))
    let denseEncounters = 0
    let dispersedEncounters = 0
    for (let seed = 0; seed < 50; seed += 1) {
      denseEncounters += resolveEncounters(context(densePeople, densePools, socializers), new Pcg32(hashSeed(`geography-${seed}`))).length
      dispersedEncounters += resolveEncounters(context(dispersedPeople, dispersedPools, socializers), new Pcg32(hashSeed(`geography-${seed}`))).length
    }
    expect(denseEncounters).toBeGreaterThan(0)
    expect(dispersedEncounters).toBe(0)
  })
})
