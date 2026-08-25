/**
 * Bounded authoring profiles for initial settlement geography. They describe
 * starting home dispersion and one explicit shared-market location; they do
 * not assign culture, class, government, or community membership.
 */
export type SettlementTemplateId = 'homestead' | 'hamlet' | 'village' | 'town' | 'city' | 'dispersed-homesteads'

export interface SettlementTemplateDefinition {
  id: SettlementTemplateId
  label: string
  defaultRadiusCells: number
  homeRadiusCells: number
  /** Authoring guidance only; it never caps the authoritative detailed population. */
  recommendedPopulationCapacity: number
  requiresSettlementMarker: boolean
}

export const SETTLEMENT_TEMPLATES: readonly SettlementTemplateDefinition[] = Object.freeze([
  { id: 'homestead', label: 'Homestead', defaultRadiusCells: 1, homeRadiusCells: 0, recommendedPopulationCapacity: 12, requiresSettlementMarker: true },
  { id: 'hamlet', label: 'Hamlet', defaultRadiusCells: 2, homeRadiusCells: 1, recommendedPopulationCapacity: 80, requiresSettlementMarker: true },
  { id: 'village', label: 'Village', defaultRadiusCells: 3, homeRadiusCells: 1, recommendedPopulationCapacity: 400, requiresSettlementMarker: true },
  { id: 'town', label: 'Town', defaultRadiusCells: 2, homeRadiusCells: 0, recommendedPopulationCapacity: 4_000, requiresSettlementMarker: true },
  { id: 'city', label: 'City', defaultRadiusCells: 8, homeRadiusCells: 4, recommendedPopulationCapacity: 50_000, requiresSettlementMarker: true },
  { id: 'dispersed-homesteads', label: 'Dispersed homesteads', defaultRadiusCells: 6, homeRadiusCells: 32, recommendedPopulationCapacity: 160, requiresSettlementMarker: false },
])

export function settlementTemplate(id: SettlementTemplateId): SettlementTemplateDefinition {
  const definition = SETTLEMENT_TEMPLATES.find((candidate) => candidate.id === id)
  if (!definition) throw new Error(`Unknown settlement template: ${id}`)
  return definition
}

export function isSettlementTemplateId(value: unknown): value is SettlementTemplateId {
  return value === 'homestead' || value === 'hamlet' || value === 'village' || value === 'town' || value === 'city' || value === 'dispersed-homesteads'
}
