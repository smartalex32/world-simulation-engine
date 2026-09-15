import type { SimulationEvent } from '../simulation/domain/types'
import { compareStableText } from '../shared/stableOrder'

export type HistoricalEntityKind = 'person' | 'organization' | 'settlement' | 'community' | 'cell'
export interface HistoricalEntityReference { kind: HistoricalEntityKind; id: string }

/** One read-only participation contract for stored queries and timeline links. */
export function eventEntityRefs(event: SimulationEvent): HistoricalEntityReference[] {
  const refs: HistoricalEntityReference[] = []
  const add = (kind: HistoricalEntityKind, id: string) => { if (id) refs.push({ kind, id }) }
  const addList = (kind: HistoricalEntityKind, value: string) => value.split(',').forEach((id) => add(kind, id.trim()))
  if (event.cellId) add('cell', event.cellId)
  for (const [key, value] of Object.entries(event.payload)) {
    if (typeof value !== 'string' || !value) continue
    if (key.endsWith('PersonId') || key === 'personId') add('person', value)
    else if (['parentIds', 'sourcePersonIds', 'founderPersonIds', 'participantIds', 'memberPersonIds'].includes(key)) addList('person', value)
    else if (key === 'organizationId' || key.endsWith('OrganizationId')) add('organization', value)
    else if (['sourceOrganizationIds', 'resultOrganizationIds', 'parentOrganizationIds'].includes(key)) addList('organization', value)
    else if (key === 'settlementId' || key.endsWith('SettlementId')) add('settlement', value)
    else if (key === 'communityId') add('community', value)
    else if (key === 'cellId' || key.endsWith('CellId')) add('cell', value)
  }
  if ((event.payload.observerKind === 'person' || event.payload.observerKind === 'organization') && typeof event.payload.observerId === 'string') add(event.payload.observerKind, event.payload.observerId)
  return [...new Map(refs.map((ref) => [`${ref.kind}:${ref.id}`, ref])).values()]
    .sort((a, b) => compareStableText(`${a.kind}:${a.id}`, `${b.kind}:${b.id}`))
}
