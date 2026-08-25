import { describe, expect, it } from 'vitest'
import { migrateSnapshotSchema } from './migrations'

describe('snapshot migration registry', () => {
  it('migrates each of the three supported schemas one boundary at a time', () => {
    const legacy = { schemaVersion: 30, engineVersion: '0.1.0', state: { tick: 0 }, digest: 'digest' }
    expect(migrateSnapshotSchema(legacy, 32)).toMatchObject({ schemaVersion: 32, digest: 'digest' })
  })

  it('rejects schemas outside the explicit rolling window', () => {
    expect(() => migrateSnapshotSchema({ schemaVersion: 29 }, 32)).toThrow('Unsupported snapshot schema')
  })
})
