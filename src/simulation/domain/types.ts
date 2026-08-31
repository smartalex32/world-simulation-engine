/**
 * Temporary compatibility façade. New code imports contracts from the owning
 * subsystem; this module remains only while existing callers migrate.
 */
export * from '../kernel/versionManifest'
export * from '../kernel/types'
export * from '../spatial/types'
export * from '../organizations/types'
export * from '../economy/types'
export * from '../households/types'
export * from '../infrastructure/types'
export * from '../health/types'
export * from '../people/types'
export * from '../cohorts/types'
export * from '../events/types'
export type { EventRetentionClass, SimulationEventPayload, SimulationEventPayloadMap, SimulationEventType } from '../events/catalog'
export * from '../serialization/types'
export * from '../projection/types'
