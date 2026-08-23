import type { LanguageState, PersonState } from '../domain/types'

export function initialLanguage(q: number): LanguageState {
  return q < 32 ? { fluency: { 'language.valley': 1000, 'language.ridge': 150 }, acquisitionCount: 0 } : { fluency: { 'language.valley': 150, 'language.ridge': 1000 }, acquisitionCount: 0 }
}
export function communicationFluency(first: PersonState, second: PersonState): number {
  if (!first.language || !second.language) return 1000
  return Math.max(...(['language.valley', 'language.ridge'] as const).map((id) => Math.min(first.language!.fluency[id], second.language!.fluency[id])))
}
/** Children gradually acquire language only from real positive encounters. */
export function acquireLanguage(recipient: PersonState, source: PersonState, tick: number): boolean {
  if (!recipient.language || !source.language || recipient.ageYears >= 18) return false
  let changed = false
  for (const id of ['language.valley', 'language.ridge'] as const) {
    const delta = Math.max(0, Math.floor((source.language.fluency[id] - recipient.language.fluency[id]) / 100))
    if (delta > 0) { recipient.language.fluency[id] = Math.min(1000, recipient.language.fluency[id] + delta); changed = true }
  }
  if (changed) { recipient.language.acquisitionCount += 1; recipient.language.lastSourcePersonId = source.id; recipient.language.lastAcquisitionTick = tick }
  return changed
}
