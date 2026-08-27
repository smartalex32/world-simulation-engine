import { INFLUENCE_DEFINITIONS } from '../simulation/influences/registry'
import { PERSON_VARIABLE_DEFINITIONS } from '../simulation/variables/registry'
import type { ContentPack } from './types'

/** Initial setting-agnostic pack: current preindustrial rules retain their
 * existing IDs and coefficients while becoming portable inspectable content. */
export const DEFAULT_PREINDUSTRIAL_PACK: ContentPack = Object.freeze({
  manifest: Object.freeze({ format: 'world-simulation-content-pack', schemaVersion: 1, id: 'setting.preindustrial.default', version: '1.0.0', name: 'Default preindustrial setting', dependencies: Object.freeze([]) }),
  personVariables: Object.freeze(PERSON_VARIABLE_DEFINITIONS.map((definition) => Object.freeze({ ...definition }))),
  influences: Object.freeze(INFLUENCE_DEFINITIONS.map((definition) => Object.freeze({ ...definition }))),
  formulas: Object.freeze({
    // Retains the historical authored base weight while exercising the
    // engine-owned declarative formula path.
    'decision.explore.base': Object.freeze({ kind: 'constant', value: 40 }),
  }),
})
