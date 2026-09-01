import type { CommunityFeedbackEdgeDefinition, CommunitySimulationState, CommunityVariableDefinition } from '../community/types'
import type { PopulationCohortState, PopulationFidelityState } from '../cohorts/types'
import type { EconomyState, MarketState } from '../economy/types'
import type { HouseholdState, ParentChildLink, ActivityLocationState } from '../households/types'
import type { InfrastructureAssetState } from '../infrastructure/types'
import type { DisputeState, LocalGovernanceState, OrganizationState } from '../organizations/types'
import type { PersonState, RelationshipState } from '../people/types'
import type { PopulationPlacementZone, WorldState } from '../spatial/types'
import type { PersonVariableDefinition } from '../variables/types'
import type { OrganizationDefinition } from '../organizations/types'

export interface WorldProjection {
  runId: string
  tick: number
  seed: string
  engineVersion: string
  world: WorldState
  populationZones: PopulationPlacementZone[]
  people: PersonState[]
  cohorts: PopulationCohortState[]
  populationFidelity: PopulationFidelityState
  households: HouseholdState[]
  markets: MarketState[]
  economy: EconomyState
  organizations: OrganizationState[]
  infrastructure: InfrastructureAssetState[]
  governance: LocalGovernanceState[]
  disputes: DisputeState[]
  parentChildLinks: ParentChildLink[]
  activityLocations: ActivityLocationState[]
  communities: CommunitySimulationState[]
  relationships: RelationshipState[]
  variableDefinitions: readonly PersonVariableDefinition[]
  organizationDefinitions?: readonly OrganizationDefinition[]
  communityVariableDefinitions: readonly CommunityVariableDefinition[]
  communityFeedbackDefinitions: readonly CommunityFeedbackEdgeDefinition[]
  digest?: string
}

/** Noncanonical description of authoritative data that changed during a command. */
export type AuthoritativeChangeCategory = 'people' | 'locations' | 'relationships' | 'communities' | 'topology'
export interface AuthoritativeChangeSet { readonly categories: readonly AuthoritativeChangeCategory[]; readonly cellIds: readonly string[] }
