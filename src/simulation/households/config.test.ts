import { describe, expect, it } from 'vitest'
import { householdIdForOrdinal, personIdForOrdinal } from './config'

describe('hosted-scale household identifiers', () => {
  it('preserves four-digit identifiers and permits the tenth-thousand person', () => {
    expect(personIdForOrdinal(101)).toBe('person-0101')
    expect(personIdForOrdinal(10_000)).toBe('person-10000')
    expect(householdIdForOrdinal(5_000)).toBe('household-5000')
    expect(() => personIdForOrdinal(10_001)).toThrow(/10000/)
  })
})
