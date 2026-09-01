import type { InfluenceEdgeDefinition } from '../simulation/influences/types'
import type { PersonVariableDefinition } from '../simulation/variables/types'
import type { OrganizationDefinition } from '../simulation/organizations/types'

/** Stable content IDs are portable references, never display labels. */
export type ContentPackId = string

export interface ContentPackManifest {
  format: 'world-simulation-content-pack'
  schemaVersion: 1
  id: ContentPackId
  version: string
  name: string
  dependencies: readonly { id: ContentPackId; version: string }[]
}

/** A fictional simulation pathogen. These values are simulation coefficients,
 * not clinical claims or a model of a real disease. */
export interface FictionalPathogenDefinition {
  id: string
  incubationHours: number
  infectiousHours: number
  immunityHours: number
  transmissionPermille: number
  dailyHealthStressPermille: number
  annualMortalityPermille: number
}

/** A conserved, pack-defined preindustrial good. Base value is expressed in
 * integer currency units and is only an initial price anchor. */
export interface EconomyGoodDefinition {
  id: string
  name: string
  category: 'food' | 'material' | 'tool'
  basePriceUnits: number
  decayPermillePerDay: number
}

/** A deterministic recipe. Inputs are removed before outputs are created. */
export interface EconomyRecipeDefinition {
  id: string
  inputs: Readonly<Record<string, number>>
  outputs: Readonly<Record<string, number>>
  laborHours: number
}

/** Declarative formulas are intentionally data, not source code. */
export type DeterministicExpression =
  | { kind: 'constant'; value: number }
  | { kind: 'variable'; id: string }
  | { kind: 'add' | 'multiply' | 'minimum' | 'maximum'; operands: readonly DeterministicExpression[] }
  | { kind: 'subtract' | 'divide'; left: DeterministicExpression; right: DeterministicExpression }
  | { kind: 'negate'; operand: DeterministicExpression }
  | { kind: 'if'; condition: DeterministicCondition; whenTrue: DeterministicExpression; whenFalse: DeterministicExpression }
  | { kind: 'randomChance'; stream: string; probabilityPermille: DeterministicExpression; whenTrue: DeterministicExpression; whenFalse: DeterministicExpression }

export type DeterministicCondition =
  | { kind: 'greaterThan' | 'greaterThanOrEqual'; left: DeterministicExpression; right: DeterministicExpression }
  | { kind: 'equals'; left: DeterministicExpression; right: DeterministicExpression }
  | { kind: 'all' | 'any'; conditions: readonly DeterministicCondition[] }
  | { kind: 'not'; condition: DeterministicCondition }

export interface ContentPack {
  manifest: ContentPackManifest
  personVariables: readonly PersonVariableDefinition[]
  influences: readonly InfluenceEdgeDefinition[]
  pathogens: readonly FictionalPathogenDefinition[]
  economy: { goods: readonly EconomyGoodDefinition[]; recipes: readonly EconomyRecipeDefinition[] }
  organizationDefinitions: readonly OrganizationDefinition[]
  formulas?: Readonly<Record<string, DeterministicExpression>>
}

export interface ContentPackDiagnostic { path: string; message: string }
export interface ValidatedContentPack { pack: ContentPack; diagnostics: readonly ContentPackDiagnostic[]; canonicalJson: string }
