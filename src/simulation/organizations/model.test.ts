import { describe, expect, it } from 'vitest'
import { createInitialSchools } from './model'

describe('organizations', () => {
  it('creates persistent schools with explicit learner memberships only', () => {
    const people = [{ id: 'child', ageYears: 10, homeCellId: '1,1' }, { id: 'adult', ageYears: 30, homeCellId: '1,1' }]
    const result = createInitialSchools(people as never, ['1,1'])
    expect(result[0]).toMatchObject({ kind: 'school', locationCellId: '1,1', members: [{ personId: 'child', role: 'learner' }] })
  })
})
