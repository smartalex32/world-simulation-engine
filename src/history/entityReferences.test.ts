import { describe, expect, it } from 'vitest'
import type { SimulationEvent } from '../simulation/domain/types'
import { eventEntityRefs } from './entityReferences'
import { eventInvolvesEntity } from './history'

const event = (payload: SimulationEvent['payload']): SimulationEvent => ({ id: 'event.1', runId: 'run.1', tick: 24, sequence: 1, version: 1, type: 'ORGANIZATION_FORMED', payload })

describe('shared history participation', () => {
  it('finds both sides of structural transitions and uses exact deduplicated typed IDs', () => {
    const transition = event({ organizationId: 'group.1', sourceOrganizationIds: 'group.1, group.2', resultOrganizationIds: 'group.3', parentOrganizationIds: 'group.1', memberPersonIds: 'person.1,person.2', reason: 'person.3' })
    expect(eventEntityRefs(transition)).toEqual([
      { kind: 'organization', id: 'group.1' }, { kind: 'organization', id: 'group.2' }, { kind: 'organization', id: 'group.3' },
      { kind: 'person', id: 'person.1' }, { kind: 'person', id: 'person.2' },
    ])
    expect(eventInvolvesEntity(transition, 'group.2', 'organization')).toBe(true)
    expect(eventInvolvesEntity(transition, 'group.2', 'person')).toBe(false)
    expect(eventInvolvesEntity(transition, 'person.3')).toBe(false)
    expect(eventInvolvesEntity(transition, 'group')).toBe(false)
  })

  it('recognizes direct settlement events and typed reputation observers', () => {
    expect(eventInvolvesEntity(event({ settlementId: 'settlement.1' }), 'settlement.1', 'settlement')).toBe(true)
    expect(eventEntityRefs(event({ organizationId: 'group.1', observerKind: 'person', observerId: 'person.1' }))).toEqual([
      { kind: 'organization', id: 'group.1' }, { kind: 'person', id: 'person.1' },
    ])
    expect(eventEntityRefs(event({ observerKind: 'unrecognized', observerId: 'person.1' }))).toEqual([])
  })

  it('preserves coordinate IDs containing commas as single cells', () => {
    const moved = { ...event({ sourceCellId: '0,0', destinationCellId: '1,2' }), cellId: '0,0' }
    expect(eventEntityRefs(moved)).toEqual([{ kind: 'cell', id: '0,0' }, { kind: 'cell', id: '1,2' }])
  })
})
