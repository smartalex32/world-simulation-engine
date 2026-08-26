import type { InfluenceEdgeDefinition } from '../simulation/influences/types'
import type { PersonVariableDefinition } from '../simulation/variables/types'

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
  formulas?: Readonly<Record<string, DeterministicExpression>>
}

export interface ContentPackDiagnostic { path: string; message: string }
export interface ValidatedContentPack { pack: ContentPack; diagnostics: readonly ContentPackDiagnostic[]; canonicalJson: string }
