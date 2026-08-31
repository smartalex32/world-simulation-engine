export interface HealthExposureState {
  observedHours: number
  crowdingPersonHours: number
  coPresenceHours: number
  waterAvailabilityPermilleHours: number
}

export interface HealthStressTrace {
  tick: number
  previousValue: number
  recoveryDelta: number
  crowdingDelta: number
  coPresenceDelta: number
  waterDelta: number
  hungerDelta: number
  infectionDelta: number
  requestedDelta: number
  appliedDelta: number
  currentValue: number
  annualMortalityRiskPermille: number
}

/** Fictional, non-clinical pathogen progression retained on the affected person. */
export interface FictionalInfectionState {
  version: 1
  pathogenId: string
  phase: 'incubating' | 'infectious' | 'immune'
  startedTick: number
  phaseEndsTick: number
  sourcePersonId?: string
}

export interface FictionalInfectionTrace {
  tick: number
  pathogenId: string
  kind: 'acquired' | 'became-infectious' | 'recovered' | 'immunity-expired'
  previousPhase?: FictionalInfectionState['phase']
  nextPhase?: FictionalInfectionState['phase']
  sourcePersonId?: string
  probabilityPermille?: number
  randomRollPermille?: number
}

/** Household care is a bounded co-resident support action, not a clinical service. */
export interface HealthInterventionTrace {
  tick: number
  kind: 'household-care' | 'self-isolation'
  careCapacityCount: number
  stressReductionPermille: number
  displacementPressurePermille: number
}
