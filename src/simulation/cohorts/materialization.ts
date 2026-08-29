import { generatePopulation, type GeneratedPopulation } from '../agents/population'
import type { GeographicCell, PopulationPlacementZone } from '../domain/types'
import { RandomProvider } from '../rng/pcg32'
import { compareStableText } from '../../shared/stableOrder'

/**
 * Generates a self-contained detailed population from an already-apportioned
 * cohort allocation. The temporary generator's legacy IDs are rewritten before
 * state is exposed, so this cannot collide with authored detailed people.
 */
export function materializeCohortPeople(input: {
  cohortId: string
  transitionSequence: number
  seed: string
  cells: GeographicCell[]
  sourceZone: PopulationPlacementZone
  populationCount: number
}): GeneratedPopulation {
  const stream = materializationStreamName(input.cohortId, input.transitionSequence)
  const random = new RandomProvider(input.seed)
  // Register the named stream even though generation uses its own stable
  // substreams. Its name is retained in the conversion evidence.
  random.stream(stream)
  const generated = generatePopulation(input.cells, [{ ...input.sourceZone, populationCount: input.populationCount, cohortPopulationCount: undefined }], random, false)
  const personId = new Map(generated.people.map((person, index) => [person.id, `cohort-person:${input.cohortId}:${String(input.transitionSequence).padStart(8, '0')}:${String(index + 1).padStart(8, '0')}`]))
  const householdId = new Map(generated.households.map((household, index) => [household.id, `cohort-household:${input.cohortId}:${String(input.transitionSequence).padStart(8, '0')}:${String(index + 1).padStart(8, '0')}`]))
  const remappedPeople = generated.people.map((person) => {
    const household = required(householdId, person.householdId)
    return { ...person, id: required(personId, person.id), householdId: household, currentActivity: { ...person.currentActivity, locationId: person.currentActivity.locationId === null ? null : `activity.home.${household}` }, originTraces: person.originTraces.map((trace) => ({ ...trace, parentIds: trace.parentIds.map((id) => required(personId, id)).sort() })) }
  })
  const remappedHouseholds = generated.households.map((household) => {
    const id = required(householdId, household.id)
    return { ...household, id, homeActivityLocationId: `activity.home.${id}`, memberIds: household.memberIds.map((person) => required(personId, person)).sort() }
  })
  const remappedLinks = generated.parentChildLinks.map((link) => {
    const parentId = required(personId, link.parentId)
    const childId = required(personId, link.childId)
    return { ...link, id: `${parentId}|${childId}`, householdId: required(householdId, link.householdId), parentId, childId }
  })
  return {
    people: remappedPeople.sort((first, second) => compareStableText(first.id, second.id)),
    households: remappedHouseholds.sort((first, second) => compareStableText(first.id, second.id)),
    parentChildLinks: remappedLinks.sort((first, second) => compareStableText(first.id, second.id)),
    // Commons already exist; conversion contributes only new home locations.
    activityLocations: remappedHouseholds.map((household) => ({ id: household.homeActivityLocationId, kind: 'home' as const, cellId: household.homeCellId, householdId: household.id })).sort((first, second) => compareStableText(first.id, second.id)),
  }
}

export function materializationStreamName(cohortId: string, sequence: number): string {
  return `cohort.materialization.${cohortId}.${String(sequence).padStart(8, '0')}`
}

function required(map: ReadonlyMap<string, string>, id: string): string {
  const value = map.get(id)
  if (!value) throw new Error(`Materialization reference is missing: ${id}`)
  return value
}
