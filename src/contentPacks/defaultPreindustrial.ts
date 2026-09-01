import { INFLUENCE_DEFINITIONS } from '../simulation/influences/registry'
import { PERSON_VARIABLE_DEFINITIONS } from '../simulation/variables/registry'
import type { ContentPack } from './types'

/** Initial setting-agnostic pack: current preindustrial rules retain their
 * existing IDs and coefficients while becoming portable inspectable content. */
export const DEFAULT_PREINDUSTRIAL_PACK: ContentPack = Object.freeze({
  manifest: Object.freeze({ format: 'world-simulation-content-pack', schemaVersion: 1, id: 'setting.preindustrial.default', version: '1.1.0', name: 'Default preindustrial setting', dependencies: Object.freeze([]) }),
  personVariables: Object.freeze(PERSON_VARIABLE_DEFINITIONS.map((definition) => Object.freeze({ ...definition }))),
  influences: Object.freeze(INFLUENCE_DEFINITIONS.map((definition) => Object.freeze({ ...definition }))),
  pathogens: Object.freeze([
    Object.freeze({ id: 'pathogen.fictional.respiratory-fever', incubationHours: 48, infectiousHours: 120, immunityHours: 720, transmissionPermille: 90, dailyHealthStressPermille: 45, annualMortalityPermille: 8 }),
  ]),
  economy: Object.freeze({
    goods: Object.freeze([
      Object.freeze({ id: 'good.food', name: 'Food', category: 'food', basePriceUnits: 2, decayPermillePerDay: 20 }),
      Object.freeze({ id: 'good.wood', name: 'Wood', category: 'material', basePriceUnits: 3, decayPermillePerDay: 0 }),
      Object.freeze({ id: 'good.tool', name: 'Tool', category: 'tool', basePriceUnits: 12, decayPermillePerDay: 0 }),
    ]),
    recipes: Object.freeze([
      Object.freeze({ id: 'recipe.tool.woodworking', inputs: Object.freeze({ 'good.wood': 2 }), outputs: Object.freeze({ 'good.tool': 1 }), laborHours: 8 }),
    ]),
  }),
  organizationDefinitions: Object.freeze([
    Object.freeze({ id: 'school', name: 'School', purposeIds: Object.freeze(['education']), memberRoleIds: Object.freeze(['learner', 'educator']), sharedRuleIds: Object.freeze(['organization.rule.attendance.v1']), initialService: Object.freeze({ location: 'settlement-anchor', activityLocation: 'commons', serviceCapacity: 24 }) }),
  ]),
  formulas: Object.freeze({
    // Retains the historical authored base weight while exercising the
    // engine-owned declarative formula path.
    'decision.explore.base': Object.freeze({ kind: 'constant', value: 40 }),
  }),
})
