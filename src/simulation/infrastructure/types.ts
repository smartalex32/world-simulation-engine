export interface InfrastructureAssetState {
  version: 1
  id: string
  kind: 'road' | 'waterway' | 'port' | 'storage' | 'service'
  cellIds: string[]
  ownerSettlementId?: string
  /** Explicit service operator after an organizational transition. Legacy
   * service IDs remain valid when this is omitted. */
  operatorOrganizationId?: string
  /** Retired services retain their physical record but provide no capacity. */
  decommissionedTick?: number
  capacity: number
  conditionPermille: number
  disruptionPermille: number
  maintenanceUnits: number
  lastTrace?: InfrastructureLifecycleTrace
}

export interface InfrastructureLifecycleTrace {
  tick: number
  kind: 'constructed' | 'maintained' | 'degraded' | 'disrupted' | 'repaired' | 'transferred' | 'partitioned' | 'decommissioned'
  previousConditionPermille: number
  conditionDeltaPermille: number
  capacity: number
  reason: string
}

/** Structured regional rationale retained with an accepted household move. */
