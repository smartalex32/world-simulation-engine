import { canonicalStringify } from '../shared/canonicalJson'
import { schema } from '../shared/schema'
import { PERSON_VARIABLE_IDS } from '../simulation/variables/types'
import { ORGANIZATION_PURPOSE_IDS, ORGANIZATION_SHARED_RULE_IDS, type OrganizationDefinition } from '../simulation/organizations/types'
import type { ContentPack, ContentPackDiagnostic, DeterministicCondition, DeterministicExpression, EconomyGoodDefinition, EconomyRecipeDefinition, FictionalPathogenDefinition, ValidatedContentPack } from './types'

export const CONTENT_PACK_SCHEMA_VERSION = 1
const LEGACY_SCHOOL_ORGANIZATION_DEFINITION: OrganizationDefinition = {
  id: 'school', name: 'School', purposeIds: ['education'], memberRoleIds: ['learner', 'educator'], sharedRuleIds: ['organization.rule.attendance.v1'], initialService: { location: 'settlement-anchor', activityLocation: 'commons', serviceCapacity: 24 },
}

export const CONTENT_PACK_CODEC = schema.custom<ContentPack>({
  $id: 'world-simulation/content-pack', type: 'object',
  required: ['manifest', 'personVariables', 'influences', 'formulas', 'pathogens', 'economy', 'organizationDefinitions'],
  properties: {
    manifest: { type: 'object', required: ['format', 'schemaVersion', 'id', 'version', 'name', 'dependencies'] },
    personVariables: { type: 'array' }, influences: { type: 'array' }, formulas: { type: 'object' },
    pathogens: { type: 'array' }, economy: { type: 'object', required: ['goods', 'recipes'] }, organizationDefinitions: { type: 'array' },
  },
}, (value) => validateContentPack(value).pack)

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
  validateUnique(pack.organizationDefinitions, 'organizationDefinitions', (item) => item.id, diagnostics)
  for (const [index, definition] of (pack.organizationDefinitions ?? []).entries()) validateOrganizationDefinition(definition, `organizationDefinitions[${index}]`, diagnostics)
  if (!pack.economy || !Array.isArray(pack.economy.goods) || !Array.isArray(pack.economy.recipes)) diagnostics.push({ path: 'economy', message: 'Economy needs goods and recipes arrays' })
  else {
    validateUnique(pack.economy.goods, 'economy.goods', (item) => item.id, diagnostics)
    validateUnique(pack.economy.recipes, 'economy.recipes', (item) => item.id, diagnostics)
    for (const [index, good] of pack.economy.goods.entries()) validateEconomyGood(good, `economy.goods[${index}]`, diagnostics)
    const goodIds = new Set(pack.economy.goods.map((good) => good.id))
    for (const [index, recipe] of pack.economy.recipes.entries()) validateEconomyRecipe(recipe, goodIds, `economy.recipes[${index}]`, diagnostics)
  }
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
  migrated.economy ??= { goods: [], recipes: [] }
  // Prior v1 packs only supported this exact school specialization.  Preserve
  // their behavior explicitly instead of accepting an empty runtime registry.
  migrated.organizationDefinitions ??= [LEGACY_SCHOOL_ORGANIZATION_DEFINITION]
  if (!isContentPackCandidate(migrated)) throw invalid('pack', 'Content pack collections are invalid')
  return migrated
}

function validateOrganizationDefinition(definition: OrganizationDefinition, path: string, diagnostics: ContentPackDiagnostic[]): void {
  const uniqueStableIds = (ids: readonly string[] | undefined, field: string, allowEmpty = false) => {
    if (!Array.isArray(ids) || (!allowEmpty && ids.length === 0) || ids.some((id) => !stableId(id)) || new Set(ids).size !== ids.length) diagnostics.push({ path: `${path}.${field}`, message: 'Must contain unique stable IDs' })
  }
  if (!definition || !stableId(definition.id) || typeof definition.name !== 'string' || definition.name.trim().length === 0) diagnostics.push({ path, message: 'Organization definition needs a stable ID and display name' })
  uniqueStableIds(definition?.purposeIds, 'purposeIds')
  for (const purposeId of definition?.purposeIds ?? []) if (!ORGANIZATION_PURPOSE_IDS.includes(purposeId as never)) diagnostics.push({ path: `${path}.purposeIds`, message: `Unknown organization purpose: ${purposeId}` })
  uniqueStableIds(definition?.memberRoleIds, 'memberRoleIds')
  uniqueStableIds(definition?.sharedRuleIds, 'sharedRuleIds', true)
  for (const ruleId of definition?.sharedRuleIds ?? []) if (!ORGANIZATION_SHARED_RULE_IDS.includes(ruleId as never)) diagnostics.push({ path: `${path}.sharedRuleIds`, message: `Unknown organization rule: ${ruleId}` })
  const hasAttendance = definition?.sharedRuleIds?.includes('organization.rule.attendance.v1') ?? false
  if (definition?.assets && (!Number.isSafeInteger(definition.assets.initialCurrencyUnits) || definition.assets.initialCurrencyUnits < 0 || !definition.assets.initialGoods || Object.entries(definition.assets.initialGoods).some(([id, amount]) => !stableId(id) || !Number.isSafeInteger(amount) || amount < 0))) diagnostics.push({ path: `${path}.assets`, message: 'Organization assets need non-negative integer balances keyed by stable good IDs' })
  if (definition?.reputation && definition.reputation.enabled !== true && definition.reputation.enabled !== false) diagnostics.push({ path: `${path}.reputation`, message: 'Organization reputation enablement must be explicit' })
  if (definition?.id === 'school' && !definition.memberRoleIds.includes('learner')) diagnostics.push({ path: `${path}.memberRoleIds`, message: 'School definitions must allow the learner role' })
  if (definition?.id === 'school' && !hasAttendance) diagnostics.push({ path: `${path}.sharedRuleIds`, message: 'School definitions must include the attendance rule' })
  if (definition?.id !== 'school' && hasAttendance) diagnostics.push({ path: `${path}.sharedRuleIds`, message: 'The attendance rule is reserved for school definitions' })
  const initial = definition?.initialService
  if (!initial || initial.location !== 'settlement-anchor' || initial.activityLocation !== 'commons' || !positiveInteger(initial.serviceCapacity)) diagnostics.push({ path: `${path}.initialService`, message: 'Initial service needs settlement-anchor, commons, and positive capacity' })
  const lifecycle = definition?.lifecycle
  if (lifecycle !== undefined) {
    const formation = lifecycle.formation
    const membership = lifecycle.membership
    const validCadence = Number.isSafeInteger(lifecycle.cadenceHours) && lifecycle.cadenceHours >= 24 && lifecycle.cadenceHours % 24 === 0
    const validFormation = typeof formation?.enabled === 'boolean' && permille(formation.baseProbabilityPermille)
    const validMembership = typeof membership?.enabled === 'boolean'
      && definition.memberRoleIds.includes(membership.defaultRoleId)
      && permille(membership.baseJoinProbabilityPermille)
      && permille(membership.baseRoleChangeProbabilityPermille)
      && permille(membership.baseLeaveProbabilityPermille)
      && permille(membership.roleChangeInterestThresholdPermille)
    if (!validCadence || !validFormation || !validMembership) diagnostics.push({ path: `${path}.lifecycle`, message: 'Lifecycle needs a daily cadence, explicit enablement, permille probabilities, and an allowed default role' })
    if (membership?.enabled && definition.memberRoleIds.length < 2 && membership.baseRoleChangeProbabilityPermille > 0) diagnostics.push({ path: `${path}.lifecycle.membership`, message: 'Role-change probability requires at least two allowed roles' })
  }
}

function validateEconomyGood(good: EconomyGoodDefinition, path: string, diagnostics: ContentPackDiagnostic[]): void {
  if (!good || !stableId(good.id) || typeof good.name !== 'string' || good.name.trim().length === 0 || !['food', 'material', 'tool'].includes(good.category) || !positiveInteger(good.basePriceUnits) || !permille(good.decayPermillePerDay)) diagnostics.push({ path, message: 'Good needs a stable ID, name, category, positive price, and decay permille' })
}
function validateEconomyRecipe(recipe: EconomyRecipeDefinition, goodIds: ReadonlySet<string>, path: string, diagnostics: ContentPackDiagnostic[]): void {
  const validEntries = (entries: unknown) => !!entries && typeof entries === 'object' && Object.entries(entries as Record<string, unknown>).length > 0 && Object.entries(entries as Record<string, unknown>).every(([id, quantity]) => goodIds.has(id) && positiveInteger(quantity))
  if (!recipe || !stableId(recipe.id) || !positiveInteger(recipe.laborHours) || !validEntries(recipe.inputs) || !validEntries(recipe.outputs)) diagnostics.push({ path, message: 'Recipe needs stable input/output goods and positive labor hours' })
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
function isContentPackCandidate(value: unknown): value is ContentPack {
  if (!isRecord(value) || !isRecord(value.manifest) || !Array.isArray(value.personVariables) || !Array.isArray(value.influences)
    || !Array.isArray(value.pathogens) || !Array.isArray(value.organizationDefinitions) || !isRecord(value.economy) || !Array.isArray(value.economy.goods) || !Array.isArray(value.economy.recipes)) return false
  return value.formulas === undefined || isRecord(value.formulas)
}
function stableId(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/.test(value) }
function version(value: unknown): value is string { return typeof value === 'string' && /^\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9.-]+)?$/.test(value) }
function positiveInteger(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) > 0 }
function permille(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 1000 }
function invalid(path: string, message: string): never { throw Object.assign(new Error(`Invalid content pack: ${message}`), { diagnostics: Object.freeze([{ path, message }]) }) }
