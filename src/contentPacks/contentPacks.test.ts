import { describe, expect, it } from 'vitest'
import { DEFAULT_PREINDUSTRIAL_PACK, createContentPackRegistry, createContentPackRuntime, createPackVariableValues, diffContentPacks, evaluateExpression, exportContentPack, importContentPack, validateContentPack, validatePackVariableValues } from '.'
import { SimulationEngine } from '../simulation/engine/engine'

describe('content packs', () => {
  it('round-trips the default setting through canonical export', () => {
    const restored = importContentPack(exportContentPack(DEFAULT_PREINDUSTRIAL_PACK))
    expect(restored).toEqual(DEFAULT_PREINDUSTRIAL_PACK)
    expect(validateContentPack(restored).canonicalJson).toBe(exportContentPack(DEFAULT_PREINDUSTRIAL_PACK))
  })
  it('resolves declared dependencies in deterministic order and reports changes', () => {
    const foundation = { ...DEFAULT_PREINDUSTRIAL_PACK, manifest: { ...DEFAULT_PREINDUSTRIAL_PACK.manifest, id: 'setting.foundation', version: '1.0.0' } }
    const extension = { ...DEFAULT_PREINDUSTRIAL_PACK, manifest: { ...DEFAULT_PREINDUSTRIAL_PACK.manifest, id: 'setting.extension', version: '1.0.0', dependencies: [{ id: 'setting.foundation', version: '1.0.0' }] } }
    expect(createContentPackRegistry([extension, foundation]).resolve('setting.extension').map((pack) => pack.manifest.id)).toEqual(['setting.foundation', 'setting.extension'])
    expect(diffContentPacks(foundation, extension).map((item) => item.path)).toContain('manifest.id')
    const changed = { ...foundation, personVariables: foundation.personVariables.map((definition) => definition.id === 'person.trait.curiosity' ? { ...definition, defaultValue: 600 } : definition) }
    expect(diffContentPacks(foundation, changed)).toContainEqual(expect.objectContaining({ path: 'personVariables[person.trait.curiosity].defaultValue', before: 500, after: 600 }))
  })
  it('rejects unsafe pack structure and evaluates named deterministic chance', () => {
    expect(() => validateContentPack({ ...DEFAULT_PREINDUSTRIAL_PACK, manifest: { ...DEFAULT_PREINDUSTRIAL_PACK.manifest, id: 'Bad ID' } })).toThrow('Invalid content pack')
    const random = { nextPermille: (stream: string) => { expect(stream).toBe('content.test'); return 4 } }
    expect(evaluateExpression({ kind: 'randomChance', stream: 'content.test', probabilityPermille: { kind: 'constant', value: 5 }, whenTrue: { kind: 'constant', value: 2 }, whenFalse: { kind: 'constant', value: 1 } }, {}, random)).toBe(2)
    expect(() => evaluateExpression({ kind: 'randomChance', stream: '', probabilityPermille: { kind: 'constant', value: 5 }, whenTrue: { kind: 'constant', value: 2 }, whenFalse: { kind: 'constant', value: 1 } }, {}, random)).toThrow('named RNG')
    expect(() => validateContentPack({ ...DEFAULT_PREINDUSTRIAL_PACK, formulas: { bad: { kind: 'add', operands: [] } } })).toThrow('one or more operands')
    expect(() => validateContentPack({ ...DEFAULT_PREINDUSTRIAL_PACK, formulas: { bad: { kind: 'if', condition: { kind: 'not' }, whenTrue: { kind: 'constant', value: 1 }, whenFalse: { kind: 'constant', value: 0 } } } })).toThrow('Condition is invalid')
  })
  it('builds stable immutable runtime registries from a validated pack', () => {
    const runtime = createContentPackRuntime(DEFAULT_PREINDUSTRIAL_PACK)
    expect(runtime.variableDefinitions).toHaveLength(10)
    expect(runtime.influences.definitions).toHaveLength(12)
    expect(runtime.variableById.get('person.trait.curiosity')?.label).toBe('Curiosity')
    const values = createPackVariableValues(runtime, { 'person.trait.curiosity': 750 })
    expect(values['person.trait.curiosity']).toBe(750)
    expect(() => validatePackVariableValues(runtime, { ...values, unexpected: 1 })).toThrow('missing or unexpected')
  })
  it('selects an immutable custom pack for a run and restores it only with that pack', async () => {
    const pack = structuredClone(DEFAULT_PREINDUSTRIAL_PACK)
    pack.manifest = { ...pack.manifest, id: 'setting.preindustrial.custom', version: '1.0.0', name: 'Custom preindustrial setting' }
    pack.personVariables = [...pack.personVariables, {
      id: 'person.trait.diligence', label: 'Diligence', layer: 'trait', category: 'temperament', unit: 'permille', order: 95,
      minimum: 0, maximum: 1000, defaultValue: 500, initializationMinimum: 0, initializationMaximum: 1000, enabled: true,
    }]
    const engine = SimulationEngine.create('content-pack-custom-run', 8, 8, pack)
    expect(engine.project().variableDefinitions.map(({ id }) => id)).toContain('person.trait.diligence')
    const snapshot = await engine.snapshot()
    await expect(SimulationEngine.restore(snapshot)).rejects.toThrow('Unsupported content pack configuration')
    const restored = await SimulationEngine.restore(snapshot, pack)
    expect(restored.project().variableDefinitions.map(({ id }) => id)).toContain('person.trait.diligence')
  })
})
