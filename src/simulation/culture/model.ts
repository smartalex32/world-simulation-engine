import type { CulturalState, PersonState, RelationshipState } from '../domain/types'

export function createCulturalState(): CulturalState { return { beliefs: { 'belief.exploration': 500, 'belief.cooperation': 500 }, exposureCount: 0 } }

/** Applies a tiny, bounded belief update only after a real positive encounter and directional trust. */
export function transmitCulture(recipient: PersonState, source: PersonState, relationship: RelationshipState, tick: number): boolean {
  if (!recipient.culture || !source.culture || relationship.familiarity < 100) return false
  const perspective = relationship.personAId === recipient.id ? relationship.aToB : relationship.bToA
  if (perspective.trust < 300) return false
  let changed = false
  for (const id of ['belief.exploration', 'belief.cooperation'] as const) {
    const current = recipient.culture.beliefs[id]
    const sourceValue = source.culture.beliefs[id]
    const delta = Math.trunc((sourceValue - current) * perspective.trust / 100_000)
    if (delta !== 0) { recipient.culture.beliefs[id] = Math.max(0, Math.min(1000, current + delta)); changed = true }
  }
  if (changed) { recipient.culture.exposureCount += 1; recipient.culture.lastSourcePersonId = source.id; recipient.culture.lastTransmissionTick = tick }
  return changed
}
