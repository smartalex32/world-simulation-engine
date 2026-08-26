import { describe, expect, it } from 'vitest'
import { migrateSnapshotSchema } from './migrations'

describe('snapshot migration registry', () => {
  it('migrates each supported schema one boundary at a time', () => {
    const legacy = { schemaVersion: 30, engineVersion: '0.1.0', state: { tick: 0 }, digest: 'digest' }
    expect(migrateSnapshotSchema(legacy, 32)).toMatchObject({ schemaVersion: 32, digest: 'digest' })
  })

  it('preserves a legacy settlement marker while moving to the retained-scale schema', () => {
    const legacy = { schemaVersion: 33, engineVersion: '0.34.0', state: { world: { settlements: [{ id: 's', name: 'S', anchorCellId: '0,0' }] } }, digest: 'digest' }
    expect(migrateSnapshotSchema(legacy, 35)).toMatchObject({ schemaVersion: 35, engineVersion: '0.36.0', state: { world: { settlements: [{ id: 's' }] }, config: { contentPackId: 'setting.preindustrial.default', contentPackVersion: '1.0.0', contentPackModelVersion: 1 } } })
  })

  it('rejects schemas outside the explicit rolling window', () => {
    expect(() => migrateSnapshotSchema({ schemaVersion: 29 }, 32)).toThrow('Unsupported snapshot schema')
  })
})
