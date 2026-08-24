import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../engine/engine'
import { defaultWorldCreationRequest } from '../domain/worldCreation'

describe('Milestone 28 school service integration', () => {
  it('records a place-based daily attendance decision for every live enrolled learner', () => {
    const engine = SimulationEngine.create({
      ...defaultWorldCreationRequest('milestone-28-school-service', 16, 12),
      settlements: [{ id: 'school-place', name: 'School Place', preset: 'central' }],
    })
    const enrolledIds = new Set(engine.project().organizations.flatMap((school) => school.members.map((member) => member.personId)))
    expect(enrolledIds.size).toBeGreaterThan(0)

    const result = engine.advance(8)
    const evaluated = engine.project().people.filter((person) => enrolledIds.has(person.id) && person.lifeStatus !== 'dead')

    expect(evaluated.every((person) => person.lastSchoolAttendance?.tick === 8)).toBe(true)
    expect(result.events.filter((event) => event.type === 'PERSON_ATTENDED_SCHOOL' || event.type === 'PERSON_MISSED_SCHOOL')).toHaveLength(evaluated.length)
    expect(evaluated.some((person) => person.lastSchoolAttendance?.attended)).toBe(true)
    expect(evaluated.filter((person) => person.lastSchoolAttendance?.attended).every((person) => (person.schoolLearningHours ?? 0) === 8)).toBe(true)
  })
})
