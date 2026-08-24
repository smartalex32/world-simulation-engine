/**
 * Bounded authoring profiles for initial settlement geography. They describe
 * starting home dispersion and one explicit shared-market location; they do
 * not assign culture, class, government, or community membership.
 */
export type SettlementTemplateId = 'town' | 'village' | 'dispersed-homesteads'

export interface SettlementTemplateDefinition {
  id: SettlementTemplateId
  label: string
  defaultRadiusCells: number
  homeRadiusCells: number
  requiresSettlementMarker: boolean
}

export const SETTLEMENT_TEMPLATES: readonly SettlementTemplateDefinition[] = Object.freeze([
  { id: 'town', label: 'Town', defaultRadiusCells: 2, homeRadiusCells: 0, requiresSettlementMarker: true },
  { id: 'village', label: 'Village', defaultRadiusCells: 3, homeRadiusCells: 1, requiresSettlementMarker: true },
  { id: 'dispersed-homesteads', label: 'Dispersed homesteads', defaultRadiusCells: 6, homeRadiusCells: 32, requiresSettlementMarker: false },
])

export function settlementTemplate(id: SettlementTemplateId): SettlementTemplateDefinition {
  const definition = SETTLEMENT_TEMPLATES.find((candidate) => candidate.id === id)
  if (!definition) throw new Error(`Unknown settlement template: ${id}`)
  return definition
}

export function isSettlementTemplateId(value: unknown): value is SettlementTemplateId {
  return value === 'town' || value === 'village' || value === 'dispersed-homesteads'
}
