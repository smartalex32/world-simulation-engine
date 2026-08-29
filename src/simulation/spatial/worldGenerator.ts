import { applyElevationOverrides, applyResourceCapacityOverrides, applyTerrainOverrides, WORLD_CREATION_LIMITS, fixedWorldScale } from '../domain/worldCreation'
import type { ElevationOverride, GeographicCell, ResourceCapacityOverride, RoadState, SettlementState, TerrainTypeOverride, WorldState, WorldTerrainBase } from '../domain/types'
import { RandomProvider } from '../rng/pcg32'
import { cellId } from './hex'

export function generateValley(seed: string, width = 32, height = 24, options: { name?: string; hexRadiusMeters?: number; settlements?: readonly SettlementState[]; roads?: readonly RoadState[]; terrainOverrides?: readonly TerrainTypeOverride[]; elevationOverrides?: readonly ElevationOverride[]; resourceCapacityOverrides?: readonly ResourceCapacityOverride[]; terrainBase?: WorldTerrainBase; idSuffix?: string } = {}): { world: WorldState; random: RandomProvider } {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width * height > WORLD_CREATION_LIMITS.maximumCellCount) {
    throw new RangeError(`Valley dimensions must be positive safe integers totaling at most ${WORLD_CREATION_LIMITS.maximumCellCount} cells`)
  }
  const random = new RandomProvider(seed)
  const rng = random.stream('worldgen')
  const cells: GeographicCell[] = []
  const centerQ = Math.floor(width / 2)
  const centerR = Math.floor(height / 2)
  const terrainBase = options.terrainBase ?? 'seeded-valley'

  for (let r = 0; r < height; r += 1) {
    for (let q = 0; q < width; q += 1) {
      const edgeDistance = Math.min(q, r, width - 1 - q, height - 1 - r)
      const centerDistance = Math.abs(q - centerQ) + Math.abs(r - centerR)
      const seeded = terrainBase === 'seeded-valley'
      const noise = seeded ? rng.nextInt(81) - 40 : 0
      const ridge = seeded ? Math.max(0, 8 - edgeDistance) * 72 : 0
      const elevation = seeded ? Math.max(0, Math.min(1000, 180 + ridge + centerDistance * 4 + noise)) : 300
      const water = seeded && (edgeDistance === 0 || (r > height - 5 && q < 5))
      const hill = seeded && !water && elevation >= 620
      const terrain = water ? 'water' : hill ? 'hill' : 'plain'
      const habitability = water ? 0 : hill ? Math.max(150, 780 - elevation) : Math.max(450, 900 - Math.abs(elevation - 300))
      const resourceCapacity = water ? 0 : seeded ? Math.max(0, Math.floor(habitability / 5) + rng.nextInt(41)) : Math.floor(habitability / 5)
      cells.push({
        id: cellId({ q, r }),
        q,
        r,
        terrain,
        elevation,
        habitability,
        movementCost: water ? 0 : hill ? 1800 : 1000,
        resourceCapacity,
        foodAmount: resourceCapacity,
        foodRegenerationPerDay: resourceCapacity === 0 ? 0 : Math.max(1, Math.floor(resourceCapacity / 12)),
      })
    }
  }

  return {
    world: {
      id: `world-${hashShort(`${seed}\u001f${options.idSuffix ?? `${width}x${height}`}`)}`,
      name: options.name ?? 'Seeded Valley',
      scale: fixedWorldScale(options.hexRadiusMeters),
      grid: { width, height, cells: applyResourceCapacityOverrides(applyTerrainOverrides(applyElevationOverrides(cells, options.elevationOverrides ?? []), options.terrainOverrides ?? []), options.resourceCapacityOverrides ?? []) },
      // The generated world owns mutable runtime settlement state. Keep it
      // disjoint from the immutable authoring request retained in config.
      settlements: (options.settlements ?? []).map((settlement) => structuredClone(settlement)),
      ...(options.roads?.length ? { roads: options.roads.map((road) => ({ id: road.id, cellIds: [...road.cellIds] })) } : {}),
    },
    random,
  }
}

function hashShort(value: string): string {
  let result = 2166136261
  for (const byte of new TextEncoder().encode(value)) {
    result ^= byte
    result = Math.imul(result, 16777619)
  }
  return (result >>> 0).toString(16).padStart(8, '0')
}
