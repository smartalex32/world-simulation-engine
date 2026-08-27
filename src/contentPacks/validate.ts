import { canonicalStringify } from '../simulation/serialization/snapshot'
import { PERSON_VARIABLE_IDS } from '../simulation/variables/types'
import type { ContentPack, ContentPackDiagnostic, DeterministicCondition, DeterministicExpression, FictionalPathogenDefinition, ValidatedContentPack } from './types'

export const CONTENT_PACK_SCHEMA_VERSION = 1

/** Parse, validate, and canonicalize imported pack data before it becomes selectable. */
export function validateContentPack(value: unknown): ValidatedContentPack {
  const diagnostics: ContentPackDiagnostic[] = []
  const pack = migrateContentPack(value)
  const manifest = pack.manifest
  if (manifest.format !== 'world-simulation-content-pack' || manifest.schemaVersion !== CONTENT_PACK_SCHEMA_VERSION) diagnostics.push({ path: 'manifest', message: 'Unsupported content-pack format or schema version' })
  if (!stableId(manifest.id)) diagnostics.push({ path: 'manifest.id', message: 'ID must be a stable dotted identifier' })
  if (!version(manifest.version)) diagnostics.push({ path: 'manifest.version', message: 'Version must be semver-like' })
  if (typeof manifest.name !== 'string' || manifest.name.trim().length === 0) diagnostics.push({ path: 'manifest.name', message: 'Name is required' })
  if (!Array.isArray(manifest.dependencies)) diagnostics.push({ path: 'manifest.dependencies', message: 'Dependencies must be an array' })
  else for (const [index, dependency] of manifest.dependencies.entries()) if (!isRecord(dependency) || !stableId(dependency.id) || !version(dependency.version)) diagnostics.push({ path: `manifest.dependencies[${index}]`, message: 'Dependency needs a stable ID and version' })
  validateUnique(pack.personVariables, 'personVariables', (item) => item.id, diagnostics)
  validateUnique(pack.influences, 'influences', (item) => item.id, diagnostics)
  validateUnique(pack.pathogens, 'pathogens', (item) => item.id, diagnostics)
  for (const [index, pathogen] of (pack.pathogens ?? []).entries()) validatePathogen(pathogen, `pathogens[${index}]`, diagnostics)
  for (const [index, definition] of (pack.personVariables ?? []).entries()) {
    if (!stableId(definition.id) || !Number.isSafeInteger(definition.minimum) || !Number.isSafeInteger(definition.maximum) || definition.minimum > definition.maximum || !Number.isSafeInteger(definition.defaultValue) || definition.defaultValue < definition.minimum || definition.defaultValue > definition.maximum) diagnostics.push({ path: `personVariables[${index}]`, message: 'Variable bounds/default are invalid' })
  }
  const variableIds = new Set((pack.personVariables ?? []).map((item) => item.id))
  for (const requiredId of PERSON_VARIABLE_IDS) {
    if (!variableIds.has(requiredId)) diagnostics.push({ path: 'personVariables', message: `Pack is missing required engine variable: ${requiredId}` })
  }
  for (const [index, influence] of (pack.influences ?? []).entries()) {
    if (!stableId(influence.id) || !variableIds.has(influence.sourceId) || !Number.isSafeInteger(influence.weightPermille)) diagnostics.push({ path: `influences[${index}]`, message: 'Influence must reference a pack variable and use integer permille weight' })
  }
  for (const [id, expression] of Object.entries(pack.formulas ?? {})) {
    if (!stableId(id)) diagnostics.push({ path: `formulas.${id}`, message: 'Formula ID must be stable' })
    validateExpression(expression, `formulas.${id}`, diagnostics)
  }
  if (diagnostics.length) throw Object.assign(new Error(`Invalid content pack: ${diagnostics[0]!.message}`), { diagnostics: Object.freeze(diagnostics) })
  return Object.freeze({ pack: structuredClone(pack), diagnostics: Object.freeze([]), canonicalJson: canonicalStringify(pack) })
}

/** The first published format had optional dependencies.  Imports are upgraded
 * once, before validation/canonicalization, instead of relying on callers to
 * reinterpret old data. */
export function migrateContentPack(value: unknown): ContentPack {
  if (!isRecord(value) || !isRecord(value.manifest)) throw invalid('pack', 'Content pack and manifest must be objects')
  const migrated = structuredClone(value) as Record<string, unknown>
  const manifest = migrated.manifest as Record<string, unknown>
  if (manifest.schemaVersion === 0) {
    manifest.schemaVersion = CONTENT_PACK_SCHEMA_VERSION
    manifest.dependencies ??= []
  }
  migrated.pathogens ??= []
  return migrated as unknown as ContentPack
}

function validatePathogen(pathogen: FictionalPathogenDefinition, path: string, diagnostics: ContentPackDiagnostic[]): void {
  if (!pathogen || !stableId(pathogen.id)
    || !positiveInteger(pathogen.incubationHours)
    || !positiveInteger(pathogen.infectiousHours)
    || !positiveInteger(pathogen.immunityHours)
    || !permille(pathogen.transmissionPermille)
    || !permille(pathogen.dailyHealthStressPermille)
    || !permille(pathogen.annualMortalityPermille)) diagnostics.push({ path, message: 'Pathogen needs a stable ID, positive durations, and integer permille coefficients' })
}

function validateExpression(expression: DeterministicExpression, path: string, diagnostics: ContentPackDiagnostic[]): void {
  if (!isRecord(expression) || typeof expression.kind !== 'string') { diagnostics.push({ path, message: 'Formula expression is invalid' }); return }
  switch (expression.kind) {
    case 'constant': if (!Number.isFinite(expression.value)) diagnostics.push({ path, message: 'Constant must be finite' }); return
    case 'variable': if (!stableId(expression.id)) diagnostics.push({ path, message: 'Variable reference must be stable' }); return
    case 'negate': validateExpression(expression.operand, `${path}.operand`, diagnostics); return
    case 'add': case 'multiply': case 'minimum': case 'maximum':
      if (!Array.isArray(expression.operands) || expression.operands.length < 1) diagnostics.push({ path, message: `${expression.kind} needs one or more operands` })
      else expression.operands.forEach((child, index) => validateExpression(child, `${path}.operands[${index}]`, diagnostics))
      return
    case 'subtract': case 'divide':
      validateExpression(expression.left, `${path}.left`, diagnostics); validateExpression(expression.right, `${path}.right`, diagnostics); return
    case 'if':
      validateCondition(expression.condition, `${path}.condition`, diagnostics); validateExpression(expression.whenTrue, `${path}.whenTrue`, diagnostics); validateExpression(expression.whenFalse, `${path}.whenFalse`, diagnostics); return
    case 'randomChance':
      if (!stableId(expression.stream)) diagnostics.push({ path, message: 'Random choice needs a named RNG stream' })
      validateExpression(expression.probabilityPermille, `${path}.probabilityPermille`, diagnostics); validateExpression(expression.whenTrue, `${path}.whenTrue`, diagnostics); validateExpression(expression.whenFalse, `${path}.whenFalse`, diagnostics); return
    default: diagnostics.push({ path, message: 'Unknown formula expression kind' })
  }
}
function validateCondition(condition: DeterministicCondition, path: string, diagnostics: ContentPackDiagnostic[]): void {
  if (!isRecord(condition) || typeof condition.kind !== 'string') { diagnostics.push({ path, message: 'Condition is invalid' }); return }
  switch (condition.kind) {
    case 'greaterThan': case 'greaterThanOrEqual': case 'equals': validateExpression(condition.left, `${path}.left`, diagnostics); validateExpression(condition.right, `${path}.right`, diagnostics); return
    case 'all': case 'any':
      if (!Array.isArray(condition.conditions) || condition.conditions.length < 1) diagnostics.push({ path, message: `${condition.kind} needs one or more conditions` })
      else condition.conditions.forEach((child, index) => validateCondition(child, `${path}.conditions[${index}]`, diagnostics))
      return
    case 'not': validateCondition(condition.condition, `${path}.condition`, diagnostics); return
    default: diagnostics.push({ path, message: 'Unknown condition kind' })
  }
}
function validateUnique<T>(items: readonly T[] | undefined, path: string, key: (item: T) => string, diagnostics: ContentPackDiagnostic[]): void { if (!Array.isArray(items)) { diagnostics.push({ path, message: 'Must be an array' }); return }; const seen = new Set<string>(); for (const [index, item] of items.entries()) { const id = key(item); if (seen.has(id)) diagnostics.push({ path: `${path}[${index}]`, message: `Duplicate ID: ${id}` }); seen.add(id) } }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
function stableId(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/.test(value) }
function version(value: unknown): value is string { return typeof value === 'string' && /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(value) }
function positiveInteger(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0 }
function permille(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 1000 }
function invalid(path: string, message: string): never { throw Object.assign(new Error(`Invalid content pack: ${message}`), { diagnostics: Object.freeze([{ path, message }]) }) }
