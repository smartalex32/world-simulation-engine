export type VariableLayer = 'trait' | 'state' | 'need'

export interface VariableDefinitionView {
  id: string
  label: string
  layer: VariableLayer
  category: string
  unit: 'permille'
  order: number
  minimum: number
  maximum: number
  enabled: boolean
}

export interface VariableRow {
  definition: VariableDefinitionView
  value: number
  normalized: number
}

export interface VariableCategoryGroup {
  category: string
  rows: VariableRow[]
}

export interface ContributionView {
  value: number
  sourceId?: string
  sourceLayer?: string
  kind?: string
  label?: string
  edgeId?: string
  targetId?: string
  sourceValue?: number
  centeredSourceValue?: number
  weightPermille?: number
  communityId?: string
}

export interface ContributionGroup<T extends ContributionView = ContributionView> {
  id: 'baseline' | 'dispositions' | 'current-state' | 'needs' | 'community-exposure' | 'environment-opportunity' | 'other'
  label: string
  contributions: T[]
}

const CONTRIBUTION_GROUPS: ReadonlyArray<Pick<ContributionGroup, 'id' | 'label'>> = [
  { id: 'baseline', label: 'Baseline' },
  { id: 'dispositions', label: 'Dispositions' },
  { id: 'current-state', label: 'Current state' },
  { id: 'needs', label: 'Needs' },
  { id: 'community-exposure', label: 'Community exposure' },
  { id: 'environment-opportunity', label: 'Environment / opportunity' },
  { id: 'other', label: 'Other sources' },
]

export function variableGroups(definitions: readonly VariableDefinitionView[], values: Readonly<Record<string, number>>, layer: VariableLayer): VariableCategoryGroup[] {
  const grouped = new Map<string, VariableRow[]>()
  for (const definition of [...definitions].sort((first, second) => first.order - second.order || compare(first.id, second.id))) {
    if (!definition.enabled || definition.layer !== layer) continue
    const value = values[definition.id]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const rows = grouped.get(definition.category) ?? []
    rows.push({ definition, value, normalized: normalizeVariable(value, definition) })
    grouped.set(definition.category, rows)
  }
  return [...grouped.entries()]
    .map(([category, rows]) => ({
      category,
      rows: layer === 'trait'
        ? rows
        : [...rows].sort((first, second) => second.normalized - first.normalized || first.definition.order - second.definition.order || compare(first.definition.id, second.definition.id)),
    }))
    .sort((first, second) => minimumOrder(first.rows) - minimumOrder(second.rows) || compare(first.category, second.category))
}

export function normalizeVariable(value: number, definition: Pick<VariableDefinitionView, 'minimum' | 'maximum'>): number {
  if (!Number.isFinite(value) || definition.maximum <= definition.minimum) return 0
  return Math.max(0, Math.min(1, (value - definition.minimum) / (definition.maximum - definition.minimum)))
}

export function contributionGroups<T extends ContributionView>(contributions: readonly T[]): ContributionGroup<T>[] {
  const grouped = new Map<ContributionGroup<T>['id'], T[]>()
  for (const contribution of contributions) {
    const id = contributionGroupId(contribution)
    const rows = grouped.get(id) ?? []
    rows.push(contribution)
    grouped.set(id, rows)
  }
  return CONTRIBUTION_GROUPS.flatMap(({ id, label }) => {
    const rows = grouped.get(id)
    return rows?.length ? [{ id, label, contributions: rows }] : []
  })
}

function contributionGroupId(contribution: ContributionView): ContributionGroup['id'] {
  if (contribution.kind === 'baseline' || contribution.kind === 'base') return 'baseline'
  if (contribution.kind === 'communityInfluence') return 'community-exposure'
  if (contribution.sourceLayer === 'trait') return 'dispositions'
  if (contribution.sourceLayer === 'state') return 'current-state'
  if (contribution.sourceLayer === 'need') return 'needs'
  if (contribution.kind === 'opportunity' || contribution.kind === 'context' || contribution.kind === 'interaction' || contribution.sourceLayer === 'environment') return 'environment-opportunity'
  return 'other'
}

function compare(first: string, second: string): number { return first < second ? -1 : first > second ? 1 : 0 }

function minimumOrder(rows: readonly VariableRow[]): number { return Math.min(...rows.map((row) => row.definition.order)) }
