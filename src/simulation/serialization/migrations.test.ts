import { describe, expect, it } from 'vitest'
import { migrateSnapshotSchema } from './migrations'
import { ENGINE_VERSION } from '../domain/types'

describe('snapshot migration registry', () => {
  it('migrates each supported schema one boundary at a time', () => {
    const legacy = { schemaVersion: 30, engineVersion: '0.1.0', state: { tick: 0 }, digest: 'digest' }
    expect(migrateSnapshotSchema(legacy, 32)).toMatchObject({ schemaVersion: 32, digest: 'digest' })
  })

  it('preserves a legacy settlement marker while moving to the retained-scale schema', () => {
    const legacy = { schemaVersion: 33, engineVersion: '0.34.0', state: { world: { settlements: [{ id: 's', name: 'S', anchorCellId: '0,0' }] } }, digest: 'digest' }
    expect(migrateSnapshotSchema(legacy, 36)).toMatchObject({ schemaVersion: 36, engineVersion: ENGINE_VERSION, state: { world: { settlements: [{ id: 's' }] }, config: { contentPackId: 'setting.preindustrial.default', contentPackVersion: '1.0.0', contentPackModelVersion: 2 } } })
  })

  it('adds an empty wage ledger without reinterpreting existing economy evidence', () => {
    const legacy = { schemaVersion: 42, engineVersion: '0.43.0', state: { economy: { version: 1, markets: [], tradeTraces: [], productionTraces: [], totalTaxCollectedUnits: 2 } }, digest: 'digest' }
    expect(migrateSnapshotSchema(legacy, 43)).toMatchObject({ schemaVersion: 43, engineVersion: ENGINE_VERSION, state: { economy: { totalTaxCollectedUnits: 2, wageTraces: [] } } })
  })

  it('rejects old-engine ordering semantics before any intermediate migration can relabel them', () => {
    const state = { economy: { version: 1, markets: [], tradeTraces: [], productionTraces: [], wageTraces: [], totalTaxCollectedUnits: 0 } }
    expect(() => migrateSnapshotSchema({ schemaVersion: 42, engineVersion: '0.43.0', state, digest: 'digest' }, 45)).toThrow('ordering semantics')
    expect(() => migrateSnapshotSchema({ schemaVersion: 43, engineVersion: '0.44.0', state, digest: 'digest' }, 45)).toThrow('ordering semantics')
  })

  it('advances a schema-43 fixture created with stable ordering', () => {
    const state = { economy: { version: 1, markets: [], tradeTraces: [], productionTraces: [], wageTraces: [], totalTaxCollectedUnits: 0 } }
    expect(migrateSnapshotSchema({ schemaVersion: 43, engineVersion: '0.45.0', state, digest: 'digest' }, 44)).toMatchObject({ schemaVersion: 44, engineVersion: '0.45.0' })
  })

  it('removes derived runtime settlement fields from the retained creation request', () => {
    const authored = { id: 'settlement-1', name: 'One', anchorCellId: '0,0' }
    const runtime = { ...authored, scale: 'hamlet', regional: { version: 1, status: 'active' } }
    const state = { config: { worldCreation: { settlements: [runtime] } }, world: { settlements: [runtime] } }
    const migrated = migrateSnapshotSchema({ schemaVersion: 44, engineVersion: '0.45.0', state, digest: 'digest' }, 45)
    expect(migrated).toMatchObject({ schemaVersion: 45, engineVersion: ENGINE_VERSION, state: { config: { worldCreation: { settlements: [authored] } }, world: { settlements: [runtime] } } })
  })

  it('rejects schemas outside the explicit rolling window', () => {
    expect(() => migrateSnapshotSchema({ schemaVersion: 29 }, 32)).toThrow('Unsupported snapshot schema')
  })
})
