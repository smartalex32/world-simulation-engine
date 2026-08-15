export const ENGINE_VERSION = '0.2.0'
export const SNAPSHOT_SCHEMA_VERSION = 2
export const BASE_TICK_HOURS = 1

export type Terrain = 'water' | 'plain' | 'hill'

export interface HexCoord {
  q: number
  r: number
}

export interface GeographicCell extends HexCoord {
  id: string
  terrain: Terrain
  elevation: number
  habitability: number
  movementCost: number
  resourceCapacity: number
}

export interface HexGrid {
  width: number
  height: number
  cells: GeographicCell[]
}

export interface WorldState {
  id: string
  name: string
  grid: HexGrid
}

export interface PersonTraits {
  curiosity: number
  riskTolerance: number
  sociability: number
}

export type ActionName = 'eat' | 'move' | 'explore' | 'rest' | 'socialize'

export interface UtilityContribution {
  factor: string
  value: number
}

export interface ActionAlternative {
  action: ActionName
  weight: number
}

export interface ActionDecision {
  tick: number
  action: ActionName
  targetCellId?: string
  weight: number
  totalWeight: number
  probabilityPermille: number
  contributions: UtilityContribution[]
  alternatives: ActionAlternative[]
}

export interface PersonState {
  id: string
  ageYears: number
  locationCellId: string
  homeCellId: string
  traits: PersonTraits
  hunger: number
  knownCellIds: string[]
  lastDecision?: ActionDecision
}

export interface RunConfiguration {
  seed: string
  worldWidth: number
  worldHeight: number
  baseTickHours: number
}

export interface RandomStreamSnapshot {
  name: string
  stateHex: string
  incrementHex: string
}

export interface SimulationState {
  runId: string
  tick: number
  nextEventSequence: number
  config: RunConfiguration
  world: WorldState
  people: PersonState[]
  randomStreams: RandomStreamSnapshot[]
}

export interface SimulationEvent {
  id: string
  runId: string
  tick: number
  type: 'RUN_CREATED' | 'RUN_STARTED' | 'RUN_PAUSED' | 'CLOCK_ADVANCED' | 'SNAPSHOT_SAVED' | 'RUN_LOADED' | 'PERSON_MOVED' | 'PERSON_ATE' | 'PERSON_EXPLORED' | 'PERSON_RESTED' | 'PERSON_SOCIALIZED' | 'ERROR'
  version: 1
  cellId?: string
  payload: Record<string, string | number | boolean | null>
}

export interface StatisticSample {
  runId: string
  tick: number
  metricId: 'world.cellCount' | 'world.habitableCells' | 'engine.simulatedDays' | 'population.count' | 'population.averageHunger'
  metricVersion: 1
  scope: 'world'
  value: number
}

export interface SnapshotEnvelope {
  schemaVersion: number
  engineVersion: string
  state: SimulationState
  digest: string
}

export interface WorldProjection {
  runId: string
  tick: number
  seed: string
  engineVersion: string
  world: WorldState
  people: PersonState[]
  digest?: string
}
