import { describe, expect, it } from 'vitest'
import { buildChronicle } from './chronicle'
import type { SimulationEvent } from '../simulation/domain/types'

function event(type: SimulationEvent['type'], payload: SimulationEvent['payload']): SimulationEvent {
  return { id: `event-${type}`, runId: 'run-chronicle', tick: 24, type, version: 1, payload }
}

describe('deterministic chronicle presentation', () => {
  it('renders only curated authoritative evidence through fixed templates', () => {
    const entries = buildChronicle([
      event('PERSON_ENCOUNTERED', { personId: 'person-a' }),
      event('PERSON_BORN', { personId: 'person-child', householdId: 'household-1', parentIds: 'person-a,person-b' }),
      event('PERSON_KNOWLEDGE_DISCOVERED', { personId: 'person-a', knowledgeId: 'knowledge.foraging' }),
    ])
    expect(entries).toEqual([
      expect.objectContaining({ category: 'knowledge', text: 'person-a recorded a discovery of knowledge.foraging.' }),
      expect.objectContaining({ category: 'life-cycle', text: 'person-child was born into recorded household household-1.' }),
    ])
  })
})
