import {
  WORLD_CELL_RADIUS_METERS,
  type GeographicCell,
  type ElevationOverride,
  type PopulationPlacementZone,
  type SettlementState,
  type WorldCreationDraft,
  type WorldCreationRequest,
  type WorldPlacementPreset,
  type Terrain,
  type TerrainTypeOverride,
} from './types'

export const WORLD_CREATION_LIMITS = Object.freeze({
  minimumWidth: 8,
  maximumWidth: 128,
  minimumHeight: 8,
  maximumHeight: 128,
  maximumCellCount: 16_384,
  minimumPopulation: 1,
  maximumPopulation: 500,
})

const IDENTIFIER = /^[a-z][a-z0-9-]*$/

export function defaultWorldCreationRequest(seed: string, width = 32, height = 24): WorldCreationDraft {
  return {
    seed: seed.trim() || 'valley-001',
    name: 'Seeded Valley',
    width,
    height,
    initialPopulationCount: 200,
    // Empty zones intentionally request the canonical all-habitable default once terrain exists.
    populationZones: [],
    settlements: [],
    terrainOverrides: [],
    elevationOverrides: [],
  }
}

/** Rejects unsafe creator inputs before dense terrain allocation begins. */
export function validateWorldCreationDraftLimits(value: WorldCreationDraft): void {
  if (!value || typeof value !== 'object') throw new Error('World creation request is invalid')
  normalizedSeed(value.seed)
  requiredText(value.name, 'World name', 80)
  const width = boundedInteger(value.width, WORLD_CREATION_LIMITS.minimumWidth, WORLD_CREATION_LIMITS.maximumWidth, 'World width')
  const height = boundedInteger(value.height, WORLD_CREATION_LIMITS.minimumHeight, WORLD_CREATION_LIMITS.maximumHeight, 'World height')
  if (width * height > WORLD_CREATION_LIMITS.maximumCellCount) throw new RangeError('World cell count exceeds the 8A creation limit')
  boundedInteger(value.initialPopulationCount, WORLD_CREATION_LIMITS.minimumPopulation, WORLD_CREATION_LIMITS.maximumPopulation, 'Initial population')
  if (!Array.isArray(value.populationZones) || !Array.isArray(value.settlements) || (value.terrainOverrides !== undefined && !Array.isArray(value.terrainOverrides)) || (value.elevationOverrides !== undefined && !Array.isArray(value.elevationOverrides))) throw new Error('World creation collections are invalid')
}

/** Normalizes authored creation data after terrain is generated, without consuming randomness. */
export function normalizeWorldCreationRequest(value: WorldCreationDraft | WorldCreationRequest, cells: readonly GeographicCell[], options: { enforceCreatorLimits?: boolean } = {}): WorldCreationRequest {
  const enforceCreatorLimits = options.enforceCreatorLimits ?? true
  const seed = normalizedSeed(value.seed)
  const name = requiredText(value.name, 'World name', 80)
  const width = boundedInteger(value.width, enforceCreatorLimits ? WORLD_CREATION_LIMITS.minimumWidth : 1, enforceCreatorLimits ? WORLD_CREATION_LIMITS.maximumWidth : Number.MAX_SAFE_INTEGER, 'World width')
  const height = boundedInteger(value.height, enforceCreatorLimits ? WORLD_CREATION_LIMITS.minimumHeight : 1, enforceCreatorLimits ? WORLD_CREATION_LIMITS.maximumHeight : Number.MAX_SAFE_INTEGER, 'World height')
  if (enforceCreatorLimits && width * height > WORLD_CREATION_LIMITS.maximumCellCount) throw new RangeError('World cell count exceeds the 8A creation limit')
  if (cells.length !== width * height) throw new Error('Generated world dimensions do not match creation request')
  const initialPopulationCount = boundedInteger(value.initialPopulationCount, WORLD_CREATION_LIMITS.minimumPopulation, enforceCreatorLimits ? WORLD_CREATION_LIMITS.maximumPopulation : Number.MAX_SAFE_INTEGER, 'Initial population')
  const elevationOverrides = normalizeElevationOverrides(value.elevationOverrides, cells)
  const terrainOverrides = normalizeTerrainOverrides(value.terrainOverrides, cells)
  const editedCells = applyTerrainOverrides(applyElevationOverrides(cells, elevationOverrides), terrainOverrides)
  const defaultCells = editedCells.filter((cell) => cell.habitability >= 500 && cell.movementCost > 0).map((cell) => cell.id).sort(compareText)
  const submittedZones = value.populationZones.length > 0 ? value.populationZones : [{
    id: 'population-zone-0001', name: 'Initial population', cellIds: defaultCells, populationCount: initialPopulationCount,
  }]
  const settlements = normalizeSettlements(value.settlements, editedCells, width, height)
  const settlementIds = new Set(settlements.map((settlement) => settlement.id))
  const cellsById = new Map(editedCells.map((cell) => [cell.id, cell]))
  const assignedCells = new Set<string>()
  const zoneIds = new Set<string>()
  const zones = submittedZones.map((zone): PopulationPlacementZone => {
    validIdentifier(zone.id, 'Population zone ID')
    if (zoneIds.has(zone.id)) throw new Error(`Duplicate population zone ID: ${zone.id}`)
    zoneIds.add(zone.id)
    const zoneName = requiredText(zone.name, `Population zone ${zone.id} name`, 80)
    const populationCount = boundedInteger(zone.populationCount, 0, initialPopulationCount, `Population zone ${zone.id} count`)
    const cellIds = resolveZoneCellIds(zone, editedCells, width, height)
    if ((cellIds.length === 0 && populationCount > 0) || new Set(cellIds).size !== cellIds.length) throw new Error(`Population zone ${zone.id} has invalid cells`)
    for (const cellId of cellIds) {
      const cell = cellsById.get(cellId)
      if (!cell?.movementCost || (enforceCreatorLimits && cell.habitability < 500)) throw new Error(`Population zone ${zone.id} contains an invalid home cell`)
      if (assignedCells.has(cellId)) throw new Error(`Population zones overlap at ${cellId}`)
      assignedCells.add(cellId)
    }
    if (zone.settlementId !== undefined && !settlementIds.has(zone.settlementId)) throw new Error(`Population zone ${zone.id} references an unknown settlement`)
    if (zone.settlementId !== undefined && !cellIds.includes(settlements.find((settlement) => settlement.id === zone.settlementId)?.anchorCellId ?? '')) {
      throw new Error(`Population zone ${zone.id} does not contain its settlement anchor`)
    }
    return zone.settlementId === undefined
      ? { id: zone.id, name: zoneName, cellIds, populationCount }
      : { id: zone.id, name: zoneName, cellIds, populationCount, settlementId: zone.settlementId }
  }).sort((a, b) => compareText(a.id, b.id))
  if (zones.reduce((sum, zone) => sum + zone.populationCount, 0) !== initialPopulationCount) throw new Error('Population zone allocations must equal the initial population')
  return { seed, name, width, height, initialPopulationCount, populationZones: zones, settlements, terrainOverrides, elevationOverrides }
}

/** Applies sparse terrain edits without randomness; derived cell values remain coherent. */
export function applyTerrainOverrides(cells: readonly GeographicCell[], overrides: readonly TerrainTypeOverride[]): GeographicCell[] {
  const terrainByCellId = new Map(overrides.map((override) => [override.cellId, override.terrain]))
  return cells.map((cell) => {
    const terrain = terrainByCellId.get(cell.id)
    return terrain ? withTerrainAndElevation(cell, terrain, cell.elevation) : { ...cell }
  })
}

/** Applies absolute elevation edits, recalculating the current terrain's derived geography. */
export function applyElevationOverrides(cells: readonly GeographicCell[], overrides: readonly ElevationOverride[]): GeographicCell[] {
  const elevationByCellId = new Map(overrides.map((override) => [override.cellId, override.elevation]))
  return cells.map((cell) => {
    const elevation = elevationByCellId.get(cell.id)
    return elevation === undefined ? { ...cell } : withTerrainAndElevation(cell, cell.terrain, elevation)
  })
}

function normalizeTerrainOverrides(value: readonly TerrainTypeOverride[] | undefined, cells: readonly GeographicCell[]): TerrainTypeOverride[] {
  if (value === undefined) return []
  if (value.length > cells.length) throw new Error('Terrain override count exceeds world cell count')
  const validCellIds = new Set(cells.map((cell) => cell.id))
  const ids = new Set<string>()
  return value.map((override) => {
    if (!override || typeof override !== 'object' || typeof override.cellId !== 'string' || !validCellIds.has(override.cellId)) throw new Error('Terrain override has an unknown cell')
    if (override.terrain !== 'water' && override.terrain !== 'plain' && override.terrain !== 'hill') throw new Error('Terrain override type is invalid')
    if (ids.has(override.cellId)) throw new Error(`Duplicate terrain override for ${override.cellId}`)
    ids.add(override.cellId)
    return { cellId: override.cellId, terrain: override.terrain }
  }).sort((first, second) => compareText(first.cellId, second.cellId))
}

function normalizeElevationOverrides(value: readonly ElevationOverride[] | undefined, cells: readonly GeographicCell[]): ElevationOverride[] {
  if (value === undefined) return []
  if (value.length > cells.length) throw new Error('Elevation override count exceeds world cell count')
  const validCellIds = new Set(cells.map((cell) => cell.id))
  const ids = new Set<string>()
  return value.map((override) => {
    if (!override || typeof override !== 'object' || typeof override.cellId !== 'string' || !validCellIds.has(override.cellId)) throw new Error('Elevation override has an unknown cell')
    if (!Number.isSafeInteger(override.elevation) || override.elevation < 0 || override.elevation > 1000) throw new Error('Elevation override value is invalid')
    if (ids.has(override.cellId)) throw new Error(`Duplicate elevation override for ${override.cellId}`)
    ids.add(override.cellId)
    return { cellId: override.cellId, elevation: override.elevation }
  }).sort((first, second) => compareText(first.cellId, second.cellId))
}

function withTerrainAndElevation(cell: GeographicCell, terrain: Terrain, elevation: number): GeographicCell {
  const habitability = terrain === 'water' ? 0 : terrain === 'hill' ? Math.max(150, 780 - elevation) : Math.max(450, 900 - Math.abs(elevation - 300))
  const resourceCapacity = terrain === 'water' ? 0 : cell.resourceCapacity
  return { ...cell, terrain, elevation, habitability, movementCost: terrain === 'water' ? 0 : terrain === 'hill' ? 1800 : 1000, resourceCapacity, foodAmount: terrain === 'water' ? 0 : Math.min(cell.foodAmount, resourceCapacity), foodRegenerationPerDay: terrain === 'water' || resourceCapacity === 0 ? 0 : Math.max(1, Math.floor(resourceCapacity / 12)) }
}

export function fixedWorldScale() {
  return { layout: 'axial-pointy' as const, hexRadiusMeters: WORLD_CELL_RADIUS_METERS }
}

function normalizeSettlements(value: readonly { id: string; name: string; anchorCellId?: string; preset?: WorldPlacementPreset }[], cells: readonly GeographicCell[], width: number, height: number): SettlementState[] {
  const cellsById = new Map(cells.map((cell) => [cell.id, cell]))
  const ids = new Set<string>()
  return value.map((settlement) => {
    validIdentifier(settlement.id, 'Settlement ID')
    if (ids.has(settlement.id)) throw new Error(`Duplicate settlement ID: ${settlement.id}`)
    ids.add(settlement.id)
    const anchorCellId = settlement.anchorCellId ?? nearestPassableCell(cells, presetTarget(settlement.preset ?? 'center', width, height)).id
    const anchor = cellsById.get(anchorCellId)
    if (!anchor?.movementCost) throw new Error(`Settlement ${settlement.id} has an invalid anchor cell`)
    return { id: settlement.id, name: requiredText(settlement.name, `Settlement ${settlement.id} name`, 80), anchorCellId }
  }).sort((a, b) => compareText(a.id, b.id))
}

function resolveZoneCellIds(zone: { cellIds?: string[]; preset?: WorldPlacementPreset; radiusCells?: number }, cells: readonly GeographicCell[], width: number, height: number): string[] {
  if (zone.cellIds !== undefined) return [...zone.cellIds].sort(compareText)
  const target = presetTarget(zone.preset ?? 'center', width, height)
  const radius = boundedInteger(zone.radiusCells ?? 3, 0, 32, 'Population zone radius')
  const result = cells.filter((cell) => cell.movementCost > 0 && cell.habitability >= 500 && axialDistance(cell.q, cell.r, target.q, target.r) <= radius)
  if (result.length > 0) return result.map((cell) => cell.id).sort(compareText)
  return [nearestPassableCell(cells, target).id]
}

function presetTarget(preset: WorldPlacementPreset, width: number, height: number): { q: number; r: number } {
  const q = preset === 'west' ? Math.floor(width / 4) : preset === 'east' ? Math.floor(width * 3 / 4) : Math.floor(width / 2)
  return { q, r: Math.floor(height / 2) }
}

function nearestPassableCell(cells: readonly GeographicCell[], target: { q: number; r: number }): GeographicCell {
  const candidate = cells.filter((cell) => cell.movementCost > 0 && cell.habitability >= 500)
    .sort((a, b) => axialDistance(a.q, a.r, target.q, target.r) - axialDistance(b.q, b.r, target.q, target.r) || a.id.localeCompare(b.id))[0]
  if (!candidate) throw new Error('World has no habitable cells for population placement')
  return candidate
}

function axialDistance(q: number, r: number, targetQ: number, targetR: number): number {
  const dq = q - targetQ
  const dr = r - targetR
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr))
}

function boundedInteger(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}`)
  return value
}

function requiredText(value: string, label: string, maximum: number): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized || normalized.length > maximum) throw new Error(`${label} must contain from 1 through ${maximum} characters`)
  return normalized
}

function normalizedSeed(value: string): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (normalized.length > 160) throw new Error('World seed must contain at most 160 characters')
  return normalized || 'valley-001'
}

function validIdentifier(value: string, label: string): void {
  if (!IDENTIFIER.test(value)) throw new Error(`${label} is invalid`)
}

function compareText(first: string, second: string): number {
  return first < second ? -1 : first > second ? 1 : 0
}
