import { describe, expect, it } from 'vitest'
import { decodePayload, encodePayload } from './postgres'

describe('PostgreSQL hosted payload codec', () => {
  it('round-trips compressed canonical JSON and rejects corruption', () => {
    const encoded = encodePayload({ runId: 'run-a', state: { tick: 24, values: [1, 2, 3] } })
    expect(encoded.compressed.byteLength).toBeGreaterThan(0)
    expect(decodePayload(encoded.compressed, encoded.sha256)).toEqual({ runId: 'run-a', state: { tick: 24, values: [1, 2, 3] } })
    expect(() => decodePayload(encoded.compressed, '0'.repeat(64))).toThrow('checksum')
  })

  it('encodes equivalent object key order identically', () => {
    expect(encodePayload({ b: 2, a: 1 }).sha256).toBe(encodePayload({ a: 1, b: 2 }).sha256)
  })
})
