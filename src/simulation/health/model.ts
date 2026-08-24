import type { HealthExposureState, HealthStressTrace, PersonState } from '../domain/types'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { adjustPersonVariable, getPersonVariable } from '../variables/storage'

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

export function emptyHealthExposure(): HealthExposureState {
  return { observedHours: 0, crowdingPersonHours: 0, coPresenceHours: 0, waterAvailabilityPermilleHours: 0 }
}

export function resolveDailyHealthStress(person: PersonState, tick: number): HealthStressTrace {
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
  const requestedDelta = recoveryDelta + crowdingDelta + coPresenceDelta + waterDelta + hungerDelta
  const currentValue = adjustPersonVariable(person.variables, PERSON_VARIABLE_ID.healthStress, requestedDelta)
  const trace: HealthStressTrace = {
    tick, previousValue, recoveryDelta, crowdingDelta, coPresenceDelta, waterDelta, hungerDelta,
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
