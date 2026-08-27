import { describe, expect, it } from 'vitest'
import type { PersonState } from '../domain/types'
import { createDefaultPersonVariableValues } from '../variables/storage'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { advanceCohortFictionalInfections, healthStressMortalityRiskPermille, progressFictionalInfections, resolveDailyHealthStress, transmitFictionalPathogens } from './model'

const pathogen = { id: 'pathogen.fictional.test', incubationHours: 24, infectiousHours: 48, immunityHours: 72, transmissionPermille: 1000, dailyHealthStressPermille: 50, annualMortalityPermille: 10 }

function person(): PersonState {
  return { id: 'person-1', ageYears: 30, ageHoursIntoYear: 0, locationCellId: '0,0', homeCellId: '0,0', householdId: 'household-1', activityScheduleId: 'activity.schedule.adult.v1', currentActivity: { kind: 'home', locationId: 'activity.home.household-1', sinceTick: 0 }, originTraces: [], development: { exposures: [] }, variables: createDefaultPersonVariableValues({ [PERSON_VARIABLE_ID.hunger]: 200 }), knownCellIds: ['0,0'] }
}

describe('fictional health stress', () => {
  it('assigns greater stress to the same person under dense, water-poor exposure', () => {
    const low = person(); low.healthExposure = { observedHours: 24, crowdingPersonHours: 24, coPresenceHours: 0, waterAvailabilityPermilleHours: 24_000 }
    const high = person(); high.healthExposure = { observedHours: 24, crowdingPersonHours: 240, coPresenceHours: 216, waterAvailabilityPermilleHours: 4_800 }
    expect(resolveDailyHealthStress(high, 24).currentValue).toBeGreaterThan(resolveDailyHealthStress(low, 24).currentValue)
  })

  it('keeps mortality pressure bounded and only applies at high stress', () => {
    expect(healthStressMortalityRiskPermille(599)).toBe(0)
    expect(healthStressMortalityRiskPermille(1000)).toBeGreaterThan(0)
  })

  it('progresses fictional infection through incubation, infectiousness, recovery, and expiry', () => {
    const value = person(); value.fictionalInfection = { version: 1, pathogenId: pathogen.id, phase: 'incubating', startedTick: 0, phaseEndsTick: 24 }
    expect(progressFictionalInfections([value], [pathogen], 24)[0]).toMatchObject({ kind: 'became-infectious' })
    expect(progressFictionalInfections([value], [pathogen], 72)[0]).toMatchObject({ kind: 'recovered' })
    expect(progressFictionalInfections([value], [pathogen], 144)[0]).toMatchObject({ kind: 'immunity-expired' })
    expect(value.fictionalInfection).toBeUndefined()
  })

  it('uses co-presence and a supplied named-stream draw for inspectable transmission', () => {
    const source = person(); source.id = 'source'; source.fictionalInfection = { version: 1, pathogenId: pathogen.id, phase: 'infectious', startedTick: 0, phaseEndsTick: 48 }
    const target = person(); target.id = 'target'
    const traces = transmitFictionalPathogens({ peopleById: new Map([[source.id, source], [target.id, target]]), occupantsByActivity: new Map([['commons', [source.id, target.id]]]), pathogens: [pathogen], tick: 1, nextPermille: () => 0 })
    expect(traces).toMatchObject([{ kind: 'acquired', sourcePersonId: 'source', probabilityPermille: 1000, randomRollPermille: 0 }])
    expect(target.fictionalInfection).toMatchObject({ phase: 'incubating', pathogenId: pathogen.id })
  })

  it('keeps cohort phase totals exact while applying deterministic aggregate progression', () => {
    const cohort = { version: 3 as const, id: 'cohort:west', sourceZoneId: 'west', populationCount: 100, householdCount: 34, foodUnits: 10, cellAllocations: [{ cellId: '0,0', populationCount: 100 }], ageBands: { children: 20, adults: 70, elders: 10 }, economicProductivityPermille: 500, culturalCohesionPermille: 500, developmentIndexPermille: 500, fictionalInfection: { version: 1 as const, pathogenId: pathogen.id, incubatingCount: 10, infectiousCount: 10, immuneCount: 0, lastUpdatedTick: 0 }, eventTotals: { births: 0, deaths: 0, migrationIn: 0, migrationOut: 0 } }
    const traces = advanceCohortFictionalInfections([cohort], [pathogen], 24)
    const state = cohort.fictionalInfection!
    expect(state.incubatingCount + state.infectiousCount + state.immuneCount).toBeLessThanOrEqual(cohort.populationCount)
    expect(traces[0]?.becameInfectiousCount).toBeGreaterThan(0)
  })
})
