export interface InfrastructureAssetState {
  version: 1
  id: string
  kind: 'road' | 'waterway' | 'port' | 'storage' | 'service'
  cellIds: string[]
  ownerSettlementId?: string
  capacity: number
  conditionPermille: number
  disruptionPermille: number
  maintenanceUnits: number
  lastTrace?: InfrastructureLifecycleTrace
}

export interface InfrastructureLifecycleTrace {
  tick: number
  kind: 'constructed' | 'maintained' | 'degraded' | 'disrupted' | 'repaired'
  previousConditionPermille: number
  conditionDeltaPermille: number
  capacity: number
  reason: string
}

/** Structured regional rationale retained with an accepted household move. */
