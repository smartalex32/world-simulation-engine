import type { OrganizationState, ParentChildLink, PersonState, RelationshipPerspective, RelationshipState } from '../../simulation/domain/types'
import { compareStableText } from '../../shared/stableOrder'
import { buildGraphViewModel, type GraphEdgeStyle, type GraphViewModel } from '../visualization'

export type RelationshipDimension = keyof RelationshipPerspective

export interface RelationshipNetworkFilters {
  minimumFamiliarity: number
  dimension: RelationshipDimension | 'all'
  familyOnly: boolean
  showOrganizations: boolean
  showCommunities: boolean
}

export interface RelationshipEdgeEvidence {
  relationship: RelationshipState
  sourceLabel: string
  targetLabel: string
  sourceToTarget: RelationshipPerspective
  targetToSource: RelationshipPerspective
  family: boolean
}

export interface RelationshipNetworkViewModel {
  graph: GraphViewModel
  edgeEvidence: ReadonlyMap<string, RelationshipEdgeEvidence>
  focusPersonId: string
  organizationContexts: readonly { id: string; name: string; memberIds: readonly string[] }[]
  communityContexts: readonly { id: string; memberIds: readonly string[] }[]
  factionStatus: 'not-yet-modeled'
}

export function buildRelationshipNetworkViewModel(input: {
  focusPersonId: string
  people: readonly PersonState[]
  relationships: readonly RelationshipState[]
  parentChildLinks: readonly ParentChildLink[]
  organizations: readonly OrganizationState[]
  personCommunityIds: Readonly<Record<string, string>>
  filters: RelationshipNetworkFilters
  relationshipsTruncated: boolean
}): RelationshipNetworkViewModel {
  const personById = new Map(input.people.map((person) => [person.id, person]))
  const familyPairs = new Set(input.parentChildLinks.flatMap((link) => [`${link.parentId}:${link.childId}`, `${link.childId}:${link.parentId}`]))
  const relationships = input.relationships.filter((relationship) => {
    if (relationship.personAId !== input.focusPersonId && relationship.personBId !== input.focusPersonId) return false
    const family = familyPairs.has(`${relationship.personAId}:${relationship.personBId}`)
    if (input.filters.familyOnly && !family) return false
    if (relationship.familiarity < input.filters.minimumFamiliarity) return false
    if (input.filters.dimension === 'all') return true
    const perspective = relationship.personAId === input.focusPersonId ? relationship.aToB : relationship.bToA
    return perspective[input.filters.dimension] !== 0
  }).sort((a, b) => b.familiarity - a.familiarity || compareStableText(a.id, b.id))
  const nodeIds = new Set([input.focusPersonId, ...relationships.flatMap((relationship) => [relationship.personAId, relationship.personBId])])
  const nodes = [...nodeIds].map((id) => ({
    id,
    label: id,
    category: id === input.focusPersonId ? 'Focus person' : 'Related person',
    description: personById.has(id) ? `${personById.get(id)!.lifeStatus ?? 'alive'}; ${personById.get(id)!.locationCellId}` : 'Endpoint details unavailable in bounded projection',
  }))
  const edgeEvidence = new Map<string, RelationshipEdgeEvidence>()
  const edges = relationships.map((relationship) => {
    const family = familyPairs.has(`${relationship.personAId}:${relationship.personBId}`)
    const evidence = {
      relationship,
      sourceLabel: relationship.personAId,
      targetLabel: relationship.personBId,
      sourceToTarget: relationship.aToB,
      targetToSource: relationship.bToA,
      family,
    }
    edgeEvidence.set(relationship.id, evidence)
    return {
      id: relationship.id,
      sourceId: relationship.personAId,
      targetId: relationship.personBId,
      label: `${relationship.personAId} ↔ ${relationship.personBId}`,
      style: relationshipStyle(relationship, family),
      directed: true,
      description: `Familiarity ${relationship.familiarity}; frequency ${relationship.interactionFrequency}; last interaction tick ${relationship.lastInteractionTick}`,
    }
  })
  const graph = buildGraphViewModel({ nodes, edges, provenance: { source: 'bounded hooked-person relationship projection' } })
  return {
    graph: { ...graph, edgesTruncated: graph.edgesTruncated || input.relationshipsTruncated },
    edgeEvidence,
    focusPersonId: input.focusPersonId,
    organizationContexts: input.filters.showOrganizations ? input.organizations.filter((organization) => organization.members.some((member) => nodeIds.has(member.personId))).map((organization) => ({ id: organization.id, name: organization.name, memberIds: organization.members.map((member) => member.personId).filter((id) => nodeIds.has(id)).sort(compareStableText) })).sort((a, b) => compareStableText(a.id, b.id)) : [],
    communityContexts: input.filters.showCommunities ? [...new Set([...nodeIds].map((id) => input.personCommunityIds[id]).filter((id): id is string => id !== undefined))].sort(compareStableText).map((id) => ({ id, memberIds: [...nodeIds].filter((personId) => input.personCommunityIds[personId] === id).sort(compareStableText) })) : [],
    factionStatus: 'not-yet-modeled',
  }
}

function relationshipStyle(relationship: RelationshipState, family: boolean): GraphEdgeStyle {
  if (family) return 'family'
  const values = [relationship.aToB.affection, relationship.aToB.trust, relationship.aToB.respect, relationship.bToA.affection, relationship.bToA.trust, relationship.bToA.respect]
  const fear = Math.max(relationship.aToB.fear, relationship.bToA.fear)
  if (fear > 250 || Math.min(...values) < -250) return 'negative'
  if (Math.max(...values) > 250) return 'positive'
  return 'neutral'
}

export const DEFAULT_RELATIONSHIP_FILTERS: RelationshipNetworkFilters = {
  minimumFamiliarity: 0,
  dimension: 'all',
  familyOnly: false,
  showOrganizations: false,
  showCommunities: false,
}
