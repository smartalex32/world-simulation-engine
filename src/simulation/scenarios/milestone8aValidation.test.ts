import { describe, expect, it } from 'vitest'
import { generateValley } from '../spatial/worldGenerator'
import { SimulationEngine } from '../engine/engine'
import { createSnapshot, validateSnapshot } from '../serialization/snapshot'
import {
  WORLD_CREATION_LIMITS,
  defaultWorldCreationRequest,
  fixedWorldScale,
  normalizeWorldCreationRequest,
} from '../domain/worldCreation'
import type { WorldCreationDraft } from '../domain/types'

describe('Milestone 8A world creation validation', () => {
  it('normalizes authored requests without consuming randomness', () => {
    const seed = 'm8a-normalization'
    const first = generateValley(seed, 32, 24)
    const before = first.random.snapshot()
    const request = defaultWorldCreationRequest(seed, 32, 24)
    const normalized = normalizeWorldCreationRequest({
      ...request,
      name: '  My Valley  ',
      populationZones: [],
      settlements: [],
    }, first.world.grid.cells)

    expect(normalized).toMatchObject({ seed, name: 'My Valley', width: 32, height: 24, initialPopulationCount: 200 })
    expect(normalized.populationZones).toHaveLength(1)
    expect(normalized.populationZones[0]?.populationCount).toBe(200)
    expect(normalized.populationZones[0]?.cellIds).toEqual([...normalized.populationZones[0]!.cellIds].sort())
    expect(first.random.snapshot()).toEqual(before)
  })

  it('requires exact disjoint zone allocation and validates settlement anchors', () => {
    const generated = generateValley('m8a-zones', 32, 24)
    const cells = generated.world.grid.cells.filter((cell) => cell.movementCost > 0 && cell.habitability >= 500).slice(0, 3)
    expect(cells).toHaveLength(3)
    if (cells.length < 3) return
    const request = defaultWorldCreationRequest('m8a-zones', 32, 24)
    const zones = [
      { id: 'zone-b', name: 'B', cellIds: [cells[1]!.id], populationCount: 100, settlementId: 'town-b' },
      { id: 'zone-a', name: 'A', cellIds: [cells[0]!.id, cells[2]!.id], populationCount: 100, settlementId: 'town-a' },
    ]
    const settlements = [
      { id: 'town-b', name: 'Town B', anchorCellId: cells[1]!.id },
      { id: 'town-a', name: 'Town A', anchorCellId: cells[0]!.id },
    ]
    const normalized = normalizeWorldCreationRequest({ ...request, populationZones: zones, settlements }, generated.world.grid.cells)
    expect(normalized.populationZones.map(({ id }) => id)).toEqual(['zone-a', 'zone-b'])
    expect(normalized.settlements.map(({ id }) => id)).toEqual(['town-a', 'town-b'])
    expect(() => normalizeWorldCreationRequest({ ...request, populationZones: [{ ...zones[0]!, cellIds: [cells[1]!.id, cells[2]!.id] }, zones[1]!], settlements }, generated.world.grid.cells)).toThrow(/overlap/)
    expect(() => normalizeWorldCreationRequest({ ...request, populationZones: zones.map((zone) => ({ ...zone, populationCount: 99 })), settlements }, generated.world.grid.cells)).toThrow(/allocations/)
  })

  it('rejects dimensions and population outside the explicit 8A limits', () => {
    const generated = generateValley('m8a-limits', 32, 24)
    const base = defaultWorldCreationRequest('m8a-limits', 32, 24)
    expect(() => normalizeWorldCreationRequest({ ...base, width: WORLD_CREATION_LIMITS.minimumWidth - 1 }, generated.world.grid.cells)).toThrow()
    expect(() => normalizeWorldCreationRequest({ ...base, height: WORLD_CREATION_LIMITS.maximumHeight + 1 }, generated.world.grid.cells)).toThrow()
    expect(() => normalizeWorldCreationRequest({ ...base, initialPopulationCount: WORLD_CREATION_LIMITS.minimumPopulation - 1 }, generated.world.grid.cells)).toThrow()
    expect(() => SimulationEngine.create({ ...base, width: WORLD_CREATION_LIMITS.maximumWidth + 1 })).toThrow(/World width/)
    expect(() => SimulationEngine.create({ ...base, initialPopulationCount: WORLD_CREATION_LIMITS.maximumPopulation + 1 })).toThrow(/Initial population/)
    expect(fixedWorldScale()).toEqual({ layout: 'axial-pointy', hexRadiusMeters: 1_000 })
  })

  it('round-trips schema 10 and rejects the prior schema explicitly', async () => {
    const snapshot = await SimulationEngine.create('m8a-schema-round-trip').snapshot()
    expect(snapshot.schemaVersion).toBe(10)
    expect((await validateSnapshot(structuredClone(snapshot))).digest).toBe(snapshot.digest)
    const unsupported = structuredClone(snapshot)
    unsupported.schemaVersion = 8
    await expect(validateSnapshot(unsupported)).rejects.toThrow('Unsupported snapshot schema')
  })

  it('keeps distinct creation requests distinct while preserving same-request determinism', async () => {
    const first = await SimulationEngine.create('m8a-determinism', 32, 24).snapshot()
    const second = await SimulationEngine.create('m8a-determinism', 32, 24).snapshot()
    const changed = await SimulationEngine.create('m8a-determinism', 40, 24).snapshot()
    expect(second.digest).toBe(first.digest)
    expect(changed.digest).not.toBe(first.digest)
    expect(changed.state.config.worldCreation.width).toBe(40)
  })

  it('creates exact variable populations and preserves each authored zone allocation', async () => {
    for (const population of [1, 2, 10, 201, 500]) {
      const west = Math.floor(population / 2)
      const engine = SimulationEngine.create(twoSettlementDraft(`m8a-population-${population}`, population, west))
      const snapshot = await engine.snapshot()
      expect(snapshot.state.people).toHaveLength(population)
      expect(snapshot.state.config.worldCreation.initialPopulationCount).toBe(population)
      for (const zone of snapshot.state.config.worldCreation.populationZones) {
        const cellIds = new Set(zone.cellIds)
        expect(snapshot.state.people.filter((person) => cellIds.has(person.homeCellId))).toHaveLength(zone.populationCount)
      }
    }
  })

  it('apportions equal starting populations to equal family mixes', async () => {
    const snapshot = await SimulationEngine.create(twoSettlementDraft('m8a-family-apportionment', 200, 100)).snapshot()
    const familyHomes = snapshot.state.households.filter((household) => household.memberIds.length === 3).map((household) => household.homeCellId)
    expect(familyHomes).toHaveLength(50)
    expect(snapshot.state.config.worldCreation.populationZones.map((zone) => familyHomes.filter((cellId) => zone.cellIds.includes(cellId)).length)).toEqual([25, 25])
  })

  it('creates a bounded larger validation world without exceeding the 8A limits', async () => {
    const snapshot = await SimulationEngine.create('m8a-larger-world', 128, 128).snapshot()
    expect(snapshot.state.world.grid.cells).toHaveLength(16_384)
    expect(snapshot.state.people).toHaveLength(200)
    expect(snapshot.state.config.worldCreation.width).toBe(128)
    expect(snapshot.state.config.worldCreation.height).toBe(128)
  }, 30_000)
})

function twoSettlementDraft(seed: string, population: number, westPopulation: number): WorldCreationDraft {
  return {
    seed,
    name: 'Two Settlement Valley',
    width: 32,
    height: 24,
    initialPopulationCount: population,
    settlements: [
      { id: 'settlement-0001', name: 'Westhaven', preset: 'west' },
      { id: 'settlement-0002', name: 'Eastwatch', preset: 'east' },
    ],
    populationZones: [
      { id: 'population-zone-0001', name: 'Westhaven residents', populationCount: westPopulation, settlementId: 'settlement-0001', preset: 'west', radiusCells: 3 },
      { id: 'population-zone-0002', name: 'Eastwatch residents', populationCount: population - westPopulation, settlementId: 'settlement-0002', preset: 'east', radiusCells: 3 },
    ],
  }
}
