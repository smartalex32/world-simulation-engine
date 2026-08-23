import type { BroaderDevelopmentChannelId, BroaderDevelopmentEdgeId, BroaderDevelopmentExposureAccumulator, BroaderDevelopmentExperienceType, PersonState } from '../domain/types'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import type { PersonVariableId } from '../variables/types'
import { symmetricRoundDivision } from './apply'
import { getDevelopmentPlasticity } from './model'

export const BROADER_DEVELOPMENT_WINDOW_TICKS = 720

export const BROADER_DEVELOPMENT_DEFINITIONS = Object.freeze([
  { channelId: 'exposure.peer.relationship-modeling', targetId: PERSON_VARIABLE_ID.trustPropensity, type: 'experience.peer.relationship-modeling', edgeId: 'development.peer-to-trust', plasticityPermille: 12 },
  { channelId: 'exposure.peer.relationship-modeling', targetId: PERSON_VARIABLE_ID.sociability, type: 'experience.peer.relationship-modeling', edgeId: 'development.peer-to-sociability', plasticityPermille: 10 },
  { channelId: 'exposure.peer.relationship-modeling', targetId: PERSON_VARIABLE_ID.conformity, type: 'experience.peer.relationship-modeling', edgeId: 'development.peer-to-conformity', plasticityPermille: 10 },
  { channelId: 'exposure.activity.exploration-practice', targetId: PERSON_VARIABLE_ID.persistence, type: 'experience.activity.exploration-practice', edgeId: 'development.activity-exploration-to-persistence', plasticityPermille: 8 },
  { channelId: 'exposure.community.catchment', targetId: PERSON_VARIABLE_ID.trustPropensity, type: 'experience.community.catchment', edgeId: 'development.community-social-trust-to-trust', plasticityPermille: 5 },
  { channelId: 'exposure.community.catchment', targetId: PERSON_VARIABLE_ID.conformity, type: 'experience.community.catchment', edgeId: 'development.community-cohesion-to-conformity', plasticityPermille: 5 },
  { channelId: 'exposure.community.catchment', targetId: PERSON_VARIABLE_ID.curiosity, type: 'experience.community.catchment', edgeId: 'development.community-innovation-to-curiosity', plasticityPermille: 4 },
] as const satisfies readonly { channelId: BroaderDevelopmentChannelId; targetId: PersonVariableId; type: BroaderDevelopmentExperienceType; edgeId: BroaderDevelopmentEdgeId; plasticityPermille: number }[])

export function createBroaderDevelopmentState(windowStartTick: number): NonNullable<PersonState['development']['broader']> {
  return {
    exposures: BROADER_DEVELOPMENT_DEFINITIONS.map(({ channelId, targetId }) => ({ channelId, targetId, windowStartTick, sourcePersonIds: [], recipientHours: 0, sourceHours: 0, weightedSourceValueHours: 0 })),
  }
}

export function broaderExposure(person: PersonState, channelId: BroaderDevelopmentChannelId, targetId: PersonVariableId): BroaderDevelopmentExposureAccumulator {
  const broader = person.development.broader ?? (person.development.broader = createBroaderDevelopmentState(nextWindowStart(person.development.exposures[0]?.windowStartTick ?? 1)))
  const exposure = broader.exposures.find((candidate) => candidate.channelId === channelId && candidate.targetId === targetId)
  if (!exposure) throw new Error(`Missing broader development exposure ${channelId} -> ${targetId} for ${person.id}`)
  return exposure
}

export function accumulateBroaderExposure(input: {
  accumulator: BroaderDevelopmentExposureAccumulator
  tick: number
  sourceValuePermille: number
  sourceWeightPermille?: number
  sourcePersonId?: string
  sourceContextId?: string
}): BroaderDevelopmentExposureAccumulator {
  const { accumulator, tick, sourceValuePermille, sourceWeightPermille = 1000, sourcePersonId, sourceContextId } = input
  if (accumulator.lastExposureTick !== undefined && tick <= accumulator.lastExposureTick) throw new Error(`Broader exposure tick ${tick} must increase`)
  if (!Number.isSafeInteger(sourceValuePermille) || sourceValuePermille < 0 || sourceValuePermille > 1000) throw new Error('Broader source value must be permille')
  if (!Number.isSafeInteger(sourceWeightPermille) || sourceWeightPermille < 1 || sourceWeightPermille > 1000) throw new Error('Broader source weight must be positive permille')
  return {
    ...accumulator,
    recipientHours: accumulator.recipientHours + 1,
    sourceHours: accumulator.sourceHours + 1,
    weightedSourceValueHours: accumulator.weightedSourceValueHours + sourceValuePermille,
    sourcePersonIds: sourcePersonId ? [...new Set([...accumulator.sourcePersonIds, sourcePersonId])].sort() : accumulator.sourcePersonIds,
    sourceContextId: sourceContextId ?? accumulator.sourceContextId,
    lastExposureTick: tick,
  }
}

export function completeBroaderExposure(accumulator: BroaderDevelopmentExposureAccumulator, nextWindowStartTick: number): { experience?: { sourceMeanPermille: number; exposureStrengthPermille: number }; accumulator: BroaderDevelopmentExposureAccumulator } {
  if (nextWindowStartTick - accumulator.windowStartTick !== BROADER_DEVELOPMENT_WINDOW_TICKS) throw new Error('Broader development window must span 720 ticks')
  const reset = { ...accumulator, windowStartTick: nextWindowStartTick, sourcePersonIds: [], recipientHours: 0, sourceHours: 0, weightedSourceValueHours: 0, lastExposureTick: undefined, sourceContextId: undefined }
  if (accumulator.sourceHours === 0) return { accumulator: reset }
  return {
    experience: {
      sourceMeanPermille: symmetricRoundDivision(accumulator.weightedSourceValueHours, accumulator.sourceHours),
      exposureStrengthPermille: Math.min(1000, Math.floor(accumulator.sourceHours * 1000 / BROADER_DEVELOPMENT_WINDOW_TICKS)),
    },
    accumulator: reset,
  }
}

export function applyBroaderDevelopment(input: { currentValuePermille: number; ageYears: number; sourceValuePermille: number; exposureStrengthPermille: number; edgeId: BroaderDevelopmentEdgeId; basePlasticityPermille: number }): { currentValuePermille: number; gapPermille: number; requestedDeltaPermille: number; appliedDeltaPermille: number; ageBand: ReturnType<typeof getDevelopmentPlasticity>['ageBand']; plasticityPermille: number } {
  const age = getDevelopmentPlasticity(input.ageYears)
  const plasticityPermille = Math.max(1, Math.floor(input.basePlasticityPermille * age.curiosityPlasticityPermillePerMonth / 30))
  const gapPermille = input.sourceValuePermille - input.currentValuePermille
  const requestedDeltaPermille = symmetricRoundDivision(gapPermille * input.exposureStrengthPermille * plasticityPermille, 1_000_000)
  const currentValuePermille = Math.max(0, Math.min(1000, input.currentValuePermille + requestedDeltaPermille))
  return { currentValuePermille, gapPermille, requestedDeltaPermille, appliedDeltaPermille: currentValuePermille - input.currentValuePermille, ageBand: age.ageBand, plasticityPermille }
}

function nextWindowStart(windowStartTick: number): number { return Math.max(1, windowStartTick) }
