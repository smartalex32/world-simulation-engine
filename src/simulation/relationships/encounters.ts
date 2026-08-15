import type { EncounterOutcome, PersonState, RelationshipState } from '../domain/types'
import type { Pcg32 } from '../rng/pcg32'
import { PERSON_VARIABLE_ID } from '../variables/registry'
import { getPersonVariable } from '../variables/storage'
import { relationshipId } from './model'

export interface EncounterOutcomeWeights {
  positive: number
  neutral: number
  tense: number
}

export interface ResolvedEncounter {
  initiatorId: string
  participantId: string
  cellId: string
  outcome: EncounterOutcome
  outcomeWeight: number
  totalOutcomeWeight: number
  probabilityPermille: number
  familiarityBefore: number
}

export interface EncounterContext {
  peopleById: ReadonlyMap<string, PersonState>
  occupantsByCell: ReadonlyMap<string, readonly string[]>
  socializerIds: ReadonlySet<string>
  relationshipsById: ReadonlyMap<string, RelationshipState>
}

export function resolveEncounters(context: EncounterContext, rng: Pcg32): ResolvedEncounter[] {
  const encounters: ResolvedEncounter[] = []
  const cells = [...context.occupantsByCell.entries()]
    .sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0)

  for (const [cellId, occupantIds] of cells) {
    const eligible = [...occupantIds]
      .filter((personId) => context.peopleById.has(personId))
      .sort(compareIds)
    const socializerPool = eligible.filter((personId) => context.socializerIds.has(personId))
    if (socializerPool.length === 0) continue
    const socializers = shuffle(socializerPool, rng)
    const participants = shuffle(eligible.filter((personId) => !context.socializerIds.has(personId)), rng)

    let socializerIndex = 0
    let participantIndex = 0
    while (socializerIndex < socializers.length && participantIndex < participants.length) {
      const initiatorId = socializers[socializerIndex]
      const participantId = participants[participantIndex]
      if (initiatorId && participantId) encounters.push(resolvePair(initiatorId, participantId, cellId, context, rng))
      socializerIndex += 1
      participantIndex += 1
    }
    while (socializerIndex + 1 < socializers.length) {
      const initiatorId = socializers[socializerIndex]
      const participantId = socializers[socializerIndex + 1]
      if (initiatorId && participantId) encounters.push(resolvePair(initiatorId, participantId, cellId, context, rng))
      socializerIndex += 2
    }
  }
  return encounters
}

export function encounterOutcomeWeights(first: PersonState, second: PersonState, familiarity: number): EncounterOutcomeWeights {
  const sociability = Math.floor((
    getPersonVariable(first.variables, PERSON_VARIABLE_ID.sociability)
    + getPersonVariable(second.variables, PERSON_VARIABLE_ID.sociability)
  ) / 2)
  return {
    positive: 200 + Math.floor(sociability * 3 / 5) + Math.floor(familiarity / 5),
    neutral: 500,
    tense: 100 + Math.floor((1000 - sociability) / 4) + Math.floor((1000 - familiarity) / 10),
  }
}

function resolvePair(initiatorId: string, participantId: string, cellId: string, context: EncounterContext, rng: Pcg32): ResolvedEncounter {
  const initiator = context.peopleById.get(initiatorId)
  const participant = context.peopleById.get(participantId)
  if (!initiator || !participant) throw new Error('Encounter contains a missing person')
  const familiarityBefore = context.relationshipsById.get(relationshipId(initiatorId, participantId))?.familiarity ?? 0
  const weights = encounterOutcomeWeights(initiator, participant, familiarityBefore)
  const totalOutcomeWeight = weights.positive + weights.neutral + weights.tense
  let draw = rng.nextInt(totalOutcomeWeight)
  let outcome: EncounterOutcome = 'tense'
  if (draw < weights.positive) outcome = 'positive'
  else {
    draw -= weights.positive
    if (draw < weights.neutral) outcome = 'neutral'
  }
  const outcomeWeight = weights[outcome]
  return {
    initiatorId,
    participantId,
    cellId,
    outcome,
    outcomeWeight,
    totalOutcomeWeight,
    probabilityPermille: Math.round(outcomeWeight * 1000 / totalOutcomeWeight),
    familiarityBefore,
  }
}

function shuffle(values: string[], rng: Pcg32): string[] {
  const shuffled = [...values]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const otherIndex = rng.nextInt(index + 1)
    const current = shuffled[index]
    shuffled[index] = shuffled[otherIndex] as string
    shuffled[otherIndex] = current as string
  }
  return shuffled
}

function compareIds(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0
}
