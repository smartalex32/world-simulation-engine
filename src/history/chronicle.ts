import { historicalHighlights, type HistoricalHighlight } from './history'
import type { SimulationEvent } from '../simulation/domain/types'

/**
 * A deliberately small, deterministic presentation layer. It maps recorded
 * evidence to templates and never creates state, causes, or events.
 */
export interface ChronicleEntry {
  id: string
  tick: number
  category: HistoricalHighlight['reason']
  text: string
  evidenceEventId: string
}

export function buildChronicle(events: readonly SimulationEvent[], limit = 12): ChronicleEntry[] {
  return historicalHighlights(events, limit).map(({ event, reason }) => ({
    id: `chronicle:${event.id}`,
    tick: event.tick,
    category: reason,
    text: chronicleText(event),
    evidenceEventId: event.id,
  }))
}

function chronicleText(event: SimulationEvent): string {
  const person = text(event, 'personId')
  if (event.type === 'PERSON_BORN' && person) return `${person} was born into recorded household ${text(event, 'householdId') ?? 'an unknown household'}.`
  if (event.type === 'PERSON_DIED' && person) return `${person} died at recorded age ${number(event, 'ageYears') ?? 'unknown'}.`
  if (event.type === 'PARTNERSHIP_FORMED') return `${text(event, 'firstPersonId') ?? 'A person'} and ${text(event, 'secondPersonId') ?? 'another person'} formed a partnership.`
  if (event.type === 'HOUSEHOLD_RELOCATED') return `${text(event, 'householdId') ?? 'A household'} relocated from ${text(event, 'sourceCellId') ?? 'an unknown home'} to ${text(event, 'destinationCellId') ?? 'a new home'}.`
  if (event.type === 'HOUSEHOLDS_EXCHANGED_TOOLS') return `${text(event, 'donorHouseholdId') ?? 'A household'} exchanged tools with ${text(event, 'recipientHouseholdId') ?? 'another household'} at ${text(event, 'marketId') ?? 'a market'}.`
  if (event.type === 'PERSON_KNOWLEDGE_DISCOVERED' && person) return `${person} recorded a discovery of ${text(event, 'knowledgeId') ?? 'knowledge'}.`
  if (event.type === 'COMMUNITY_MEASURES_UPDATED') return `${text(event, 'communityName') ?? text(event, 'communityId') ?? 'A community'} recorded updated community measures.`
  if (event.type === 'ERROR') return `The simulation recorded an error: ${text(event, 'message') ?? 'unspecified error'}.`
  return `${event.type.replaceAll('_', ' ').toLowerCase()} was recorded.`
}

function text(event: SimulationEvent, key: string): string | undefined {
  const value = event.payload[key]
  return typeof value === 'string' ? value : undefined
}

function number(event: SimulationEvent, key: string): number | undefined {
  const value = event.payload[key]
  return typeof value === 'number' ? value : undefined
}
