import type { CohortInfectionTrace, FictionalInfectionTrace, HealthExposureState, HealthStressTrace, PersonState, PopulationCohortState } from '../domain/types'
import type { FictionalPathogenDefinition } from '../../contentPacks/types'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { adjustPersonVariable, getPersonVariable } from '../variables/storage'
import { compareStableText } from '../../shared/stableOrder'

/** A fictional exposure/stress model, explicitly not a pathogen or medical model. */
export const HEALTH_STRESS = Object.freeze({
  dailyRecovery: 18,
  comfortableCrowding: 3,
  crowdingDivisor: 3,
  coPresenceDivisor: 8,
  waterComfortPermille: 700,
  waterDivisor: 16,
  hungerDivisor: 40,
  highStressThreshold: 600,
  mortalityRiskDivisor: 80,
} as const)
export const FICTIONAL_PATHOGEN_STREAM = 'health.fictional-pathogen' as const

export function progressFictionalInfections(people: readonly PersonState[], pathogens: readonly FictionalPathogenDefinition[], tick: number): FictionalInfectionTrace[] {
  const byId = new Map(pathogens.map((pathogen) => [pathogen.id, pathogen]))
  const traces: FictionalInfectionTrace[] = []
  for (const person of [...people].sort((a, b) => compareStableText(a.id, b.id))) {
    const infection = person.fictionalInfection
    if (!infection || tick < infection.phaseEndsTick) continue
    const pathogen = byId.get(infection.pathogenId)
    if (!pathogen) { person.fictionalInfection = undefined; continue }
    const previousPhase = infection.phase
    if (infection.phase === 'incubating') {
      person.fictionalInfection = { ...infection, phase: 'infectious', startedTick: tick, phaseEndsTick: tick + pathogen.infectiousHours }
      person.lastInfectionTrace = { tick, pathogenId: pathogen.id, kind: 'became-infectious', previousPhase, nextPhase: 'infectious' }
    } else if (infection.phase === 'infectious') {
      person.fictionalInfection = { ...infection, phase: 'immune', startedTick: tick, phaseEndsTick: tick + pathogen.immunityHours }
      person.lastInfectionTrace = { tick, pathogenId: pathogen.id, kind: 'recovered', previousPhase, nextPhase: 'immune' }
    } else {
      person.fictionalInfection = undefined
      person.lastInfectionTrace = { tick, pathogenId: pathogen.id, kind: 'immunity-expired', previousPhase }
    }
    traces.push(person.lastInfectionTrace)
  }
  return traces
}

/** Evaluates stable co-location pairs using only the named health RNG stream. */
export function transmitFictionalPathogens(input: { peopleById: ReadonlyMap<string, PersonState>; occupantsByActivity: ReadonlyMap<string, readonly string[]>; pathogens: readonly FictionalPathogenDefinition[]; tick: number; nextPermille: () => number }): FictionalInfectionTrace[] {
  const pathogens = new Map(input.pathogens.map((pathogen) => [pathogen.id, pathogen]))
  const traces: FictionalInfectionTrace[] = []
  for (const [, ids] of [...input.occupantsByActivity].sort(([a], [b]) => compareStableText(a, b))) {
    const sources = [...ids].map((id) => input.peopleById.get(id)).filter((person): person is PersonState => person?.fictionalInfection?.phase === 'infectious').sort((a, b) => compareStableText(a.id, b.id))
    for (const candidateId of [...ids].sort()) {
      const candidate = input.peopleById.get(candidateId)
      if (!candidate || candidate.fictionalInfection) continue
      const source = sources.find((person) => person.id !== candidate.id)
      const pathogen = source?.fictionalInfection ? pathogens.get(source.fictionalInfection.pathogenId) : undefined
      if (!source || !pathogen) continue
      const probabilityPermille = Math.min(1000, Math.floor(pathogen.transmissionPermille * Math.max(1, sources.length) * (source.lastHealthIntervention?.kind === 'self-isolation' ? 500 : 1000) / 1000))
      const randomRollPermille = input.nextPermille()
      if (randomRollPermille >= probabilityPermille) continue
      candidate.fictionalInfection = { version: 1, pathogenId: pathogen.id, phase: 'incubating', startedTick: input.tick, phaseEndsTick: input.tick + pathogen.incubationHours, sourcePersonId: source.id }
      candidate.lastInfectionTrace = { tick: input.tick, pathogenId: pathogen.id, kind: 'acquired', nextPhase: 'incubating', sourcePersonId: source.id, probabilityPermille, randomRollPermille }
      traces.push(candidate.lastInfectionTrace)
    }
  }
  return traces
}

/** Exact aggregate analogue of daily phase progression and exposure pressure. */
export function advanceCohortFictionalInfections(cohorts: readonly PopulationCohortState[], pathogens: readonly FictionalPathogenDefinition[], tick: number): CohortInfectionTrace[] {
  const pathogen = [...pathogens].sort((a, b) => compareStableText(a.id, b.id))[0]
  if (!pathogen) return []
  const traces: CohortInfectionTrace[] = []
  for (const cohort of [...cohorts].sort((a, b) => compareStableText(a.id, b.id))) {
    const state = cohort.fictionalInfection ?? { version: 1 as const, pathogenId: pathogen.id, incubatingCount: cohort.populationCount > 0 ? 1 : 0, infectiousCount: 0, immuneCount: 0, lastUpdatedTick: tick }
    const susceptibleCount = Math.max(0, cohort.populationCount - state.incubatingCount - state.infectiousCount - state.immuneCount)
    const newIncubatingCount = state.infectiousCount === 0 ? 0 : Math.min(susceptibleCount, Math.floor(susceptibleCount * state.infectiousCount * pathogen.transmissionPermille / Math.max(1, cohort.populationCount * 1000)))
    const becameInfectiousCount = Math.min(state.incubatingCount, Math.max(1, Math.floor(state.incubatingCount * 24 / pathogen.incubationHours)))
    const recoveredCount = Math.min(state.infectiousCount, Math.max(1, Math.floor(state.infectiousCount * 24 / pathogen.infectiousHours)))
    const immunityExpiredCount = Math.min(state.immuneCount, Math.max(1, Math.floor(state.immuneCount * 24 / pathogen.immunityHours)))
    const careCapacityCount = Math.max(0, cohort.householdCount - Math.ceil(state.infectiousCount / 3))
    const trace: CohortInfectionTrace = { tick, pathogenId: pathogen.id, susceptibleCount, newIncubatingCount, becameInfectiousCount, recoveredCount, immunityExpiredCount, careCapacityCount, mortalityCount: 0 }
    cohort.fictionalInfection = { version: 1, pathogenId: pathogen.id, incubatingCount: state.incubatingCount + newIncubatingCount - becameInfectiousCount, infectiousCount: state.infectiousCount + becameInfectiousCount - recoveredCount, immuneCount: state.immuneCount + recoveredCount - immunityExpiredCount, lastUpdatedTick: tick, lastTrace: trace }
    traces.push(trace)
  }
  return traces
}

/** Applies exact aggregate mortality without sampling represented people. */
export function applyAnnualCohortInfectionMortality(cohorts: readonly PopulationCohortState[], pathogens: readonly FictionalPathogenDefinition[], tick: number): CohortInfectionTrace[] {
  const byId = new Map(pathogens.map((pathogen) => [pathogen.id, pathogen]))
  const traces: CohortInfectionTrace[] = []
  for (const cohort of [...cohorts].sort((a, b) => compareStableText(a.id, b.id))) {
    const state = cohort.fictionalInfection; const pathogen = state && byId.get(state.pathogenId)
    if (!state || !pathogen || state.infectiousCount === 0) continue
    const mortalityCount = Math.min(cohort.populationCount, Math.floor(state.infectiousCount * pathogen.annualMortalityPermille / 1000))
    if (mortalityCount === 0) continue
    let remaining = mortalityCount
    const allocations = cohort.cellAllocations.map((allocation) => { const removed = Math.min(allocation.populationCount, remaining); remaining -= removed; return { ...allocation, populationCount: allocation.populationCount - removed } }).filter((allocation) => allocation.populationCount > 0)
    let bands = { ...cohort.ageBands }; for (const key of ['elders', 'adults', 'children'] as const) { const removed = Math.min(bands[key], mortalityCount - (cohort.ageBands.children + cohort.ageBands.adults + cohort.ageBands.elders - bands.children - bands.adults - bands.elders)); bands[key] -= removed }
    cohort.populationCount -= mortalityCount; cohort.householdCount = Math.ceil(cohort.populationCount / 3); cohort.cellAllocations = allocations; cohort.ageBands = bands; cohort.eventTotals.deaths += mortalityCount
    state.infectiousCount -= Math.min(state.infectiousCount, mortalityCount)
    const trace: CohortInfectionTrace = { tick, pathogenId: pathogen.id, susceptibleCount: cohort.populationCount - state.incubatingCount - state.infectiousCount - state.immuneCount, newIncubatingCount: 0, becameInfectiousCount: 0, recoveredCount: 0, immunityExpiredCount: 0, careCapacityCount: 0, mortalityCount }
    state.lastTrace = trace; traces.push(trace)
  }
  return traces
}

export function emptyHealthExposure(): HealthExposureState {
  return { observedHours: 0, crowdingPersonHours: 0, coPresenceHours: 0, waterAvailabilityPermilleHours: 0 }
}

export function resolveDailyHealthStress(person: PersonState, tick: number, infectionDelta = 0): HealthStressTrace {
  const exposure = person.healthExposure ?? emptyHealthExposure()
  const hours = Math.max(1, exposure.observedHours)
  const averageCrowding = Math.floor(exposure.crowdingPersonHours / hours)
  const averageWater = Math.floor(exposure.waterAvailabilityPermilleHours / hours)
  const previousValue = getPersonVariable(person.variables, PERSON_VARIABLE_ID.healthStress)
  const recoveryDelta = -HEALTH_STRESS.dailyRecovery
  const crowdingDelta = Math.max(0, averageCrowding - HEALTH_STRESS.comfortableCrowding) * HEALTH_STRESS.crowdingDivisor
  const coPresenceDelta = Math.floor(exposure.coPresenceHours / HEALTH_STRESS.coPresenceDivisor)
  const waterDelta = Math.floor(Math.max(0, HEALTH_STRESS.waterComfortPermille - averageWater) / HEALTH_STRESS.waterDivisor)
  const hungerDelta = Math.floor(getPersonVariable(person.variables, PERSON_VARIABLE_ID.hunger) / HEALTH_STRESS.hungerDivisor)
  const requestedDelta = recoveryDelta + crowdingDelta + coPresenceDelta + waterDelta + hungerDelta + infectionDelta
  const currentValue = adjustPersonVariable(person.variables, PERSON_VARIABLE_ID.healthStress, requestedDelta)
  const trace: HealthStressTrace = {
    tick, previousValue, recoveryDelta, crowdingDelta, coPresenceDelta, waterDelta, hungerDelta, infectionDelta,
    requestedDelta, appliedDelta: currentValue - previousValue, currentValue,
    annualMortalityRiskPermille: healthStressMortalityRiskPermille(currentValue),
  }
  person.lastHealthStressTrace = trace
  person.healthExposure = emptyHealthExposure()
  return trace
}

export function healthStressMortalityRiskPermille(healthStress: number): number {
  return healthStress < HEALTH_STRESS.highStressThreshold ? 0 : Math.floor((healthStress - HEALTH_STRESS.highStressThreshold) / HEALTH_STRESS.mortalityRiskDivisor) + 1
}
