import { describe, expect, it } from 'vitest'
import { SharedWorldClient } from './sdk'

describe('shared-world SDK', () => {
  it('uses versioned routes, bearer sessions, and typed revision requests', async () => {
    const requests: { url: string; init?: RequestInit }[] = []
    const client = new SharedWorldClient('https://example.test', { fetcher: async (url, init) => { requests.push({ url: String(url), init }); return new Response(JSON.stringify({ token: 'token', expiresAt: '2026-01-02T00:00:00.000Z' }), { status: 201, headers: { 'content-type': 'application/json' } }) } })
    await client.signIn('owner@example.test', 'correct-horse-battery')
    await client.saveRevision('world a', 'lease', 1, 'change', { terrain: 'hills' })
    expect(requests.map((request) => request.url)).toEqual(['https://example.test/api/v1/sessions', 'https://example.test/api/v1/worlds/world%20a/revisions'])
    expect(requests[1]?.init?.headers).toMatchObject({ authorization: 'Bearer token' })
  })
})
