import type { KnowledgeId, KnowledgeTrace, PersonKnowledge, PersonState } from '../domain/types'

export const KNOWLEDGE = Object.freeze({
  maximumPermille: 1000,
  explorationBaseGainPermille: 12,
  explorationCuriosityDivisor: 100,
  minimumTransmissionGapPermille: 50,
  transmissionDivisor: 10_000,
} as const)

export const KNOWLEDGE_IDS = ['knowledge.foraging', 'knowledge.localTerrain'] as const satisfies readonly KnowledgeId[]

/** Initial knowledge is a deterministic starting condition, not an inherited trait. */
export function initialKnowledge(ageYears: number, occupation?: PersonState['occupation']): PersonKnowledge {
  return {
    'knowledge.foraging': occupation === 'forager' ? 180 : ageYears >= 16 ? 80 : 0,
    'knowledge.localTerrain': ageYears >= 8 ? 60 : 0,
  }
}

export function discoverLocalTerrain(person: PersonState, curiosityPermille: number, tick: number): KnowledgeTrace {
  return applyKnowledge(person, 'knowledge.localTerrain', KNOWLEDGE.explorationBaseGainPermille + Math.floor(curiosityPermille / KNOWLEDGE.explorationCuriosityDivisor), 'exploration', tick)
}

/**
 * Positive co-present communication can transfer a bounded portion of a real knowledge gap.
 * The relationship trust is evidence of receptiveness; membership alone has no effect.
 */
export function transmitKnowledge(source: PersonState, recipient: PersonState, knowledgeId: KnowledgeId, relationshipTrust: number, tick: number): KnowledgeTrace | undefined {
  const sourceValue = knowledgeFor(source)[knowledgeId]
  const recipientValue = knowledgeFor(recipient)[knowledgeId]
  const gap = sourceValue - recipientValue
  if (gap < KNOWLEDGE.minimumTransmissionGapPermille || relationshipTrust <= 0) return undefined
  const gain = Math.max(1, Math.floor(gap * relationshipTrust / KNOWLEDGE.transmissionDivisor))
  return applyKnowledge(recipient, knowledgeId, gain, 'peer-transmission', tick, sourceValue, relationshipTrust)
}

export function harvestEfficiencyPermille(knowledge: PersonKnowledge): number {
  // 0–1000 foraging knowledge adds up to 50% yield; this is intentionally a small,
  // inspectable application rather than a general technology tree.
  return 1000 + Math.floor(knowledge['knowledge.foraging'] / 2)
}

function applyKnowledge(person: PersonState, knowledgeId: KnowledgeId, requestedGain: number, source: KnowledgeTrace['source'], tick: number, sourceValue?: number, relationshipTrust?: number): KnowledgeTrace {
  const knowledge = knowledgeFor(person)
  const previousValue = knowledge[knowledgeId]
  const currentValue = Math.min(KNOWLEDGE.maximumPermille, previousValue + Math.max(0, requestedGain))
  const trace: KnowledgeTrace = { knowledgeId, source, tick, previousValue, sourceValue, relationshipTrust, gain: currentValue - previousValue, currentValue }
  knowledge[knowledgeId] = currentValue
  person.lastKnowledgeTrace = trace
  return trace
}

function knowledgeFor(person: PersonState): PersonKnowledge {
  return person.knowledge ?? (person.knowledge = initialKnowledge(person.ageYears, person.occupation))
}
