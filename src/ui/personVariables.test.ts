import { describe, expect, it } from 'vitest'
import { contributionGroups, normalizeVariable, variableGroups, type VariableDefinitionView } from './personVariables'

const definitions: VariableDefinitionView[] = [
  { id: 'person.trait.sociability', label: 'Sociability', layer: 'trait', category: 'social', unit: 'permille', order: 30, minimum: 0, maximum: 1000, enabled: true },
  { id: 'person.trait.curiosity', label: 'Curiosity', layer: 'trait', category: 'cognitive', unit: 'permille', order: 10, minimum: 0, maximum: 1000, enabled: true },
  { id: 'person.state.hunger', label: 'Hunger', layer: 'state', category: 'physical', unit: 'permille', order: 70, minimum: 0, maximum: 1000, enabled: true },
  { id: 'person.state.fatigue', label: 'Fatigue', layer: 'state', category: 'physical', unit: 'permille', order: 80, minimum: 0, maximum: 1000, enabled: true },
  { id: 'person.need.socialConnection', label: 'Social need', layer: 'need', category: 'social', unit: 'permille', order: 90, minimum: 0, maximum: 1000, enabled: true },
]

describe('person variable UI helpers', () => {
  it('groups enabled variables by layer and metadata order', () => {
    const groups = variableGroups(definitions, { 'person.trait.sociability': 420, 'person.trait.curiosity': 740, 'person.state.hunger': 850, 'person.need.socialConnection': 120 }, 'trait')
    expect(groups.map((group) => group.category)).toEqual(['cognitive', 'social'])
    expect(groups.flatMap((group) => group.rows.map((row) => row.definition.id))).toEqual(['person.trait.curiosity', 'person.trait.sociability'])
  })

  it('normalizes bounded values and safely clamps invalid ranges', () => {
    expect(normalizeVariable(1200, definitions[0]!)).toBe(1)
    expect(normalizeVariable(-50, definitions[0]!)).toBe(0)
    expect(normalizeVariable(500, definitions[0]!)).toBe(0.5)
    expect(normalizeVariable(20, { minimum: 10, maximum: 10 })).toBe(0)
  })

  it('orders short-term state rows by descending urgency', () => {
    const groups = variableGroups(definitions, { 'person.state.hunger': 240, 'person.state.fatigue': 810 }, 'state')
    expect(groups[0]?.rows.map((row) => row.definition.id)).toEqual(['person.state.fatigue', 'person.state.hunger'])
  })

  it('groups contributions exclusively by explicit kind and source layer', () => {
    const groups = contributionGroups([
      { sourceId: 'base.explore', kind: 'baseline', value: 100 },
      { sourceId: 'person.trait.curiosity', sourceLayer: 'trait', kind: 'influence', value: 250 },
      { sourceId: 'person.state.hunger', sourceLayer: 'state', kind: 'influence', value: -120 },
      { sourceId: 'person.need.socialConnection', sourceLayer: 'need', kind: 'influence', value: 80 },
      { sourceId: 'environment.food', sourceLayer: 'environment', kind: 'opportunity', value: 60 },
      { sourceId: 'mystery', value: 1 },
    ])
    expect(groups.map((group) => group.label)).toEqual(['Baseline', 'Dispositions', 'Current state', 'Needs', 'Environment / opportunity', 'Other sources'])
  })
})
