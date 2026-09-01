// Stable text tie-breaks replace locale-dependent ordering. Snapshots from
// earlier engines are rejected rather than resumed under changed semantics.
export const ENGINE_VERSION = '0.48.0'
export const SNAPSHOT_SCHEMA_VERSION = 47
/** Versioned content-pack selection is authoritative configuration, not UI state. */
export const CONTENT_PACK_MODEL_VERSION = 3
export const BASE_TICK_HOURS = 1
export const VARIABLE_REGISTRY_VERSION = 2
export const INFLUENCE_REGISTRY_VERSION = 1
export const HOUSEHOLD_MODEL_VERSION = 4
export const ACTIVITY_REGISTRY_VERSION = 1
export const DEVELOPMENT_REGISTRY_VERSION = 2
export const COMMUNITY_REGISTRY_VERSION = 1
export const WORLD_GENERATOR_VERSION = 1
/** Versioned deterministic calendar/exposure rules used by Milestone 9. */
export const ENVIRONMENT_MODEL_VERSION = 3
export const LIFE_CYCLE_MODEL_VERSION = 1
/** Versioned, non-monetary household food production and sharing rules. */
export const ECONOMY_MODEL_VERSION = 3
export const ORGANIZATION_MODEL_VERSION = 4
export const CULTURE_MODEL_VERSION = 1
export const LANGUAGE_MODEL_VERSION = 1
export const GOVERNANCE_MODEL_VERSION = 2
export const CONFLICT_MODEL_VERSION = 2
/** Fictional health-stress exposure and risk rules; not a disease model. */
export const HEALTH_MODEL_VERSION = 2
/** Versioned, person-owned knowledge acquisition and application rules. */
export const KNOWLEDGE_MODEL_VERSION = 1
export const INNOVATION_MODEL_VERSION = 1
/** Authoritative network condition, capacity, and repair rules. */
export const INFRASTRUCTURE_MODEL_VERSION = 1
export const WORLD_CELL_RADIUS_METERS = 1_000

/** One inspectable source for the model versions written into current state. */
export const CURRENT_MODEL_VERSIONS = Object.freeze({
  engine: ENGINE_VERSION,
  snapshotSchema: SNAPSHOT_SCHEMA_VERSION,
  contentPack: CONTENT_PACK_MODEL_VERSION,
  variableRegistry: VARIABLE_REGISTRY_VERSION,
  influenceRegistry: INFLUENCE_REGISTRY_VERSION,
  household: HOUSEHOLD_MODEL_VERSION,
  activityRegistry: ACTIVITY_REGISTRY_VERSION,
  developmentRegistry: DEVELOPMENT_REGISTRY_VERSION,
  communityRegistry: COMMUNITY_REGISTRY_VERSION,
  worldGenerator: WORLD_GENERATOR_VERSION,
  environment: ENVIRONMENT_MODEL_VERSION,
  lifeCycle: LIFE_CYCLE_MODEL_VERSION,
  economy: ECONOMY_MODEL_VERSION,
  organization: ORGANIZATION_MODEL_VERSION,
  culture: CULTURE_MODEL_VERSION,
  language: LANGUAGE_MODEL_VERSION,
  governance: GOVERNANCE_MODEL_VERSION,
  conflict: CONFLICT_MODEL_VERSION,
  health: HEALTH_MODEL_VERSION,
  knowledge: KNOWLEDGE_MODEL_VERSION,
  innovation: INNOVATION_MODEL_VERSION,
  infrastructure: INFRASTRUCTURE_MODEL_VERSION,
} as const)
