import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../engine/engine'
import { defaultWorldCreationRequest } from './worldCreation'
import { createWorldDraftRecord, paintWorldDraftTerrain, previewWorldDraft, projectWorldDraftViewport, resetWorldDraftRecord, updateWorldDraftRecord, updateWorldDraftZoneCells, validateWorldDraftRecord } from './worldDraft'

describe('world draft lifecycle domain contract', () => {
  it('produces a stable bounded preview without changing the draft', () => {
    const record = createWorldDraftRecord('draft-valley', {
      ...defaultWorldCreationRequest('preview-seed'),
      name: 'Preview Valley',
      initialPopulationCount: 24,
      populationZones: [{ id: 'population-zone-0001', name: 'Initial population', preset: 'center', populationCount: 24 }],
    })

    const first = previewWorldDraft(record)
    const second = previewWorldDraft(record)

    expect(second).toEqual(first)
    expect(first.creation.name).toBe('Preview Valley')
    expect(first.cellCount).toBe(32 * 24)
    expect(first.passableCellCount).toBeGreaterThan(0)
    expect(Object.values(first.terrainCounts).reduce((sum, count) => sum + count, 0)).toBe(first.cellCount)
    expect(record.revision).toBe(0)
  })

  it('uses revision checks and detaches authored collections', () => {
    const source = defaultWorldCreationRequest('revision-seed')
    const created = createWorldDraftRecord('draft-revision', source)
    source.settlements.push({ id: 'mutated', name: 'Mutated', preset: 'west' })
    expect(created.draft.settlements).toHaveLength(0)

    const updated = updateWorldDraftRecord(created, { ...created.draft, name: 'Updated Valley' }, 0)
    expect(updated.revision).toBe(1)
    expect(updated.draft.name).toBe('Updated Valley')
    expect(() => updateWorldDraftRecord(updated, updated.draft, 0)).toThrow(/revision conflict/)
    const reset = resetWorldDraftRecord(updated, 1)
    expect(reset.revision).toBe(2)
    expect(reset.draft).toEqual(created.initialDraft)
    expect(() => resetWorldDraftRecord(updated, 0)).toThrow(/revision conflict/)
  })

  it('committable draft input creates exactly the normal engine state', async () => {
    const record = createWorldDraftRecord('draft-commit', {
      ...defaultWorldCreationRequest('commit-seed'),
      initialPopulationCount: 40,
      populationZones: [{ id: 'population-zone-0001', name: 'Initial population', preset: 'center', populationCount: 40 }],
    })

    const [fromDraft, direct] = await Promise.all([
      SimulationEngine.create(record.draft).snapshot(),
      SimulationEngine.create(record.draft).snapshot(),
    ])

    expect(fromDraft.digest).toBe(direct.digest)
    expect(fromDraft.state.config.worldCreation).toEqual(previewWorldDraft(record).creation)
    expect(validateWorldDraftRecord(JSON.parse(JSON.stringify(record)))).toEqual(record)
    expect(() => validateWorldDraftRecord({ ...record, version: 1 })).toThrow(/Unsupported world draft record version/)
  })

  it('hydrates an exact persisted record and cannot alter a live engine before commit', async () => {
    const initial = defaultWorldCreationRequest('live-run-seed')
    const live = SimulationEngine.create(initial)
    const before = await live.snapshot()
    const persisted = JSON.parse(JSON.stringify(createWorldDraftRecord('draft-hydrated', {
      ...defaultWorldCreationRequest('hydrated-seed'), initialPopulationCount: 18,
      populationZones: [{ id: 'population-zone-0001', name: 'Initial', preset: 'center', populationCount: 18 }],
    })))

    const hydrated = validateWorldDraftRecord(persisted)

    expect(hydrated).toEqual(persisted)
    expect((await live.snapshot()).digest).toBe(before.digest)
  })

  it('rejects a preview-invalid update without advancing the active draft revision', () => {
    const active = createWorldDraftRecord('draft-atomic', {
      ...defaultWorldCreationRequest('atomic-seed'), initialPopulationCount: 10,
      populationZones: [{ id: 'population-zone-0001', name: 'Initial', preset: 'center', populationCount: 10 }],
    })
    // This passes basic creator bounds, but terrain normalization rejects the
    // overlapping resolved cells. Worker activation previews before assignment.
    const candidate = updateWorldDraftRecord(active, {
      ...active.draft,
      populationZones: [
        { id: 'population-zone-0001', name: 'One', preset: 'center', populationCount: 5 },
        { id: 'population-zone-0002', name: 'Two', preset: 'center', populationCount: 5 },
      ],
    }, active.revision)

    expect(candidate.revision).toBe(active.revision + 1)
    expect(() => previewWorldDraft(candidate)).toThrow(/overlap/)
    expect(active.revision).toBe(0)
    expect(active.draft.populationZones).toHaveLength(1)
  })

  it('atomically patches independent zone cells in canonical order after generated-terrain validation', () => {
    const active = createWorldDraftRecord('draft-zone-cells', {
      ...defaultWorldCreationRequest('zone-cell-seed'), initialPopulationCount: 10,
      populationZones: [{ id: 'population-zone-0001', name: 'Initial', preset: 'center', populationCount: 10 }],
    })
    const acceptedCellIds = previewWorldDraft(active).creation.populationZones[0]!.cellIds
    const patched = updateWorldDraftZoneCells(active, 'population-zone-0001', [...acceptedCellIds].reverse(), active.revision)

    expect(patched.revision).toBe(1)
    expect(patched.draft.populationZones[0]!.cellIds).toEqual([...acceptedCellIds].sort())
    expect(active.draft.populationZones[0]!.cellIds).toBeUndefined()
    expect(() => updateWorldDraftZoneCells(active, 'population-zone-0001', [acceptedCellIds[0]!, acceptedCellIds[0]!])).toThrow(/invalid cells/)
    expect(() => updateWorldDraftZoneCells(active, 'population-zone-0001', ['unknown-cell'])).toThrow(/invalid home cell/)
  })

  it('rejects settlement-linked zone cell edits without changing settlement anchors', () => {
    const active = createWorldDraftRecord('draft-linked-zone', {
      ...defaultWorldCreationRequest('linked-zone-seed'), initialPopulationCount: 10,
      settlements: [{ id: 'settlement-0001', name: 'Anchor', preset: 'center' }],
      populationZones: [{ id: 'population-zone-0001', name: 'Initial', preset: 'center', radiusCells: 3, populationCount: 10, settlementId: 'settlement-0001' }],
    })
    const cellId = previewWorldDraft(active).creation.populationZones[0]!.cellIds[0]!
    expect(() => updateWorldDraftZoneCells(active, 'population-zone-0001', [cellId])).toThrow(/settlement-linked/)
    expect(active.revision).toBe(0)
  })

  it('returns a deterministic bounded read-only terrain viewport tied to the draft revision', () => {
    const record = createWorldDraftRecord('draft-viewport', {
      ...defaultWorldCreationRequest('viewport-seed'), initialPopulationCount: 12,
      populationZones: [{ id: 'population-zone-0001', name: 'Initial', preset: 'center', populationCount: 12 }],
    })
    const request = { revision: 7, bounds: { minQ: 0, maxQ: 31, minR: 0, maxR: 23 }, selectedZoneId: 'population-zone-0001' }
    const first = projectWorldDraftViewport(record, request)
    const second = projectWorldDraftViewport(record, request)

    expect(second).toEqual(first)
    expect(first.draftId).toBe(record.draftId)
    expect(first.draftRevision).toBe(record.revision)
    expect(first.cells).toHaveLength(32 * 24)
    expect(first.cells.some((cell) => cell.selected)).toBe(true)
    expect(() => projectWorldDraftViewport(record, { ...request, bounds: { minQ: 0, maxQ: 127, minR: 0, maxR: 127 } })).toThrow(/at most 4096/)
  })

  it('paints a bounded canonical terrain override that preview and commit both use', async () => {
    const active = createWorldDraftRecord('draft-terrain', {
      ...defaultWorldCreationRequest('terrain-paint-seed'), initialPopulationCount: 10,
      populationZones: [{ id: 'population-zone-0001', name: 'Initial', preset: 'center', populationCount: 10 }],
    })
    const target = projectWorldDraftViewport(active, { revision: 1, bounds: { minQ: 0, maxQ: 31, minR: 0, maxR: 23 } }).cells.find((cell) => cell.terrain === 'plain')!
    const painted = paintWorldDraftTerrain(active, [target.id], 'water', active.revision)

    expect(painted.revision).toBe(1)
    expect(painted.draft.terrainOverrides).toEqual([{ cellId: target.id, terrain: 'water' }])
    expect(projectWorldDraftViewport(painted, { revision: 2, bounds: { minQ: target.q, maxQ: target.q, minR: target.r, maxR: target.r } }).cells[0]).toMatchObject({ terrain: 'water', movementCost: 0 })
    const snapshot = await SimulationEngine.create(painted.draft).snapshot()
    expect(snapshot.state.world.grid.cells.find((cell) => cell.id === target.id)).toMatchObject({ terrain: 'water', movementCost: 0 })
    expect(snapshot.state.config.worldCreation.terrainOverrides).toEqual(painted.draft.terrainOverrides)
    expect(() => paintWorldDraftTerrain(active, Array(513).fill(target.id), 'hill')).toThrow(/1 through 512/)
  })
})
