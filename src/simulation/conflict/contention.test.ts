import { describe, expect, it } from 'vitest'
import { resolveCommunityContentions } from './model'
describe('community contention', () => { it('uses legitimacy for non-lethal mediation and reduces grievances', () => { const dispute = { id: 'd', personAId: 'a', personBId: 'b', grievance: 400, incidents: 2, lastIncidentTick: 1, communityId: 'c' }; expect(resolveCommunityContentions([dispute], new Map([['c', 700]]))).toEqual([{ communityId: 'c', disputeCount: 1, grievance: 400, outcome: 'mediation' }]); expect(dispute.grievance).toBe(220) }) })
