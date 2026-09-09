import { getActivitySchedule } from '../../simulation/activities/config'
import type { ParentChildLink, PersonState, RelationshipState } from '../../simulation/domain/types'
import { compareStableText } from '../../shared/stableOrder'

export interface PersonSchedulePeriodView {
  id: string
  label: string
  startHour: number
  endHourExclusive: number
  current: boolean
  upcoming: boolean
}

export interface PersonRelationshipView {
  id: string
  otherPersonId: string
  familiarity: number
  interactionFrequency: number
  lastInteractionTick: number
}

export interface PersonWorkspaceViewModel {
  initials: string
  lifeStatus: PersonState['lifeStatus'] | 'alive'
  schedule: readonly PersonSchedulePeriodView[]
  relationships: readonly PersonRelationshipView[]
  parentIds: readonly string[]
  childIds: readonly string[]
  relationshipTruncated: boolean
  knownCellsTruncated: boolean
}

export function buildPersonWorkspaceViewModel(person: PersonState, tick: number, relationships: readonly RelationshipState[], parentChildLinks: readonly ParentChildLink[], limits = { relationships: 24, knownCells: 64 }): PersonWorkspaceViewModel {
  const hour = ((tick % 24) + 24) % 24
  const periods = getActivitySchedule(person.activityScheduleId).periods
  const nextIndex = periods.findIndex((period) => period.startHour > hour)
  const schedule = periods.map((period, index) => ({
    id: `${person.activityScheduleId}:${period.startHour}`,
    label: period.kind,
    startHour: period.startHour,
    endHourExclusive: period.endHourExclusive,
    current: hour >= period.startHour && hour < period.endHourExclusive,
    upcoming: index === (nextIndex < 0 ? 0 : nextIndex),
  }))
  const direct = relationships
    .filter((relationship) => relationship.personAId === person.id || relationship.personBId === person.id)
    .map((relationship) => ({
      id: relationship.id,
      otherPersonId: relationship.personAId === person.id ? relationship.personBId : relationship.personAId,
      familiarity: relationship.familiarity,
      interactionFrequency: relationship.interactionFrequency,
      lastInteractionTick: relationship.lastInteractionTick,
    }))
    .sort((a, b) => b.familiarity - a.familiarity || compareStableText(a.id, b.id))
  const parentIds = parentChildLinks.filter((link) => link.childId === person.id).map((link) => link.parentId).sort(compareStableText)
  const childIds = parentChildLinks.filter((link) => link.parentId === person.id).map((link) => link.childId).sort(compareStableText)
  return {
    initials: deterministicInitials(person.id),
    lifeStatus: person.lifeStatus ?? 'alive',
    schedule,
    relationships: direct.slice(0, limits.relationships),
    parentIds,
    childIds,
    relationshipTruncated: direct.length > limits.relationships,
    knownCellsTruncated: person.knownCellIds.length > limits.knownCells,
  }
}

export function deterministicInitials(id: string): string {
  const parts = id.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  const initials = parts.slice(-2).map((part) => part[0]!.toUpperCase()).join('')
  return initials || 'P'
}
