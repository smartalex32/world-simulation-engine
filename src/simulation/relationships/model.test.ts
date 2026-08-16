import { describe, expect, it } from 'vitest'
import { applyEncounter, createRelationship, decayInteractionFrequency, otherPersonId, perspectiveFrom, relationshipId } from './model'

describe('relationship model', () => {
  it('uses one canonical pair record with directional perspectives', () => {
    expect(relationshipId('person-0002', 'person-0001')).toBe('person-0001|person-0002')
    const relationship = createRelationship('person-0002', 'person-0001')
    expect(relationship).toMatchObject({
      id: 'person-0001|person-0002',
      personAId: 'person-0001',
      personBId: 'person-0002',
      familiarity: 0,
      interactionFrequency: 0,
      interactionCount: 0,
      aToB: { affection: 500, trust: 500, respect: 500, fear: 0 },
      bToA: { affection: 500, trust: 500, respect: 500, fear: 0 },
    })
    expect(otherPersonId(relationship, 'person-0001')).toBe('person-0002')
    expect(perspectiveFrom(relationship, 'person-0002')).toBe(relationship.bToA)
  })

  it('updates independent bounded dimensions and decays only recent frequency', () => {
    let relationship = createRelationship('a', 'b')
    relationship = applyEncounter(relationship, 'positive', 4)
    expect(relationship).toMatchObject({
      familiarity: 70,
      interactionFrequency: 120,
      interactionCount: 1,
      lastInteractionTick: 4,
      aToB: { affection: 545, trust: 530, respect: 515, fear: 0 },
    })
    for (let tick = 5; tick < 100; tick += 1) relationship = applyEncounter(relationship, 'tense', tick)
    expect(Object.values(relationship.aToB).every((value) => value >= 0 && value <= 1000)).toBe(true)
    expect(Object.values(relationship.bToA).every((value) => value >= 0 && value <= 1000)).toBe(true)
    expect(relationship.familiarity).toBe(1000)
    expect(relationship.interactionFrequency).toBe(1000)
    const decayed = decayInteractionFrequency(relationship)
    expect(decayed.interactionFrequency).toBe(850)
    expect(decayed.familiarity).toBe(relationship.familiarity)
    expect(decayed.aToB).toEqual(relationship.aToB)
  })

  it('rejects self-relationships', () => {
    expect(() => relationshipId('same', 'same')).toThrow('themselves')
  })
})
