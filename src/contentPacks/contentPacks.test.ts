import { describe, expect, it } from 'vitest'
import { ContentPackClient, DEFAULT_PREINDUSTRIAL_PACK, MemoryContentPackCatalog, createContentPackRegistry, createContentPackResolver, createContentPackRuntime, createPackVariableValues, diffContentPacks, evaluateExpression, exportContentPack, importContentPack, validateContentPack, validatePackVariableValues } from '.'
import { SimulationEngine } from '../simulation/engine/engine'

describe('content packs', () => {
  it('round-trips the default setting through canonical export', () => {
    const restored = importContentPack(exportContentPack(DEFAULT_PREINDUSTRIAL_PACK))
    expect(restored).toEqual(DEFAULT_PREINDUSTRIAL_PACK)
    expect(validateContentPack(restored).canonicalJson).toBe(exportContentPack(DEFAULT_PREINDUSTRIAL_PACK))
  })
  it('migrates the prior manifest shape before canonical validation', () => {
    const legacy = structuredClone(DEFAULT_PREINDUSTRIAL_PACK) as unknown as { manifest: Record<string, unknown> }
    legacy.manifest.schemaVersion = 0
    delete legacy.manifest.dependencies
    expect(importContentPack(JSON.stringify(legacy))).toEqual(DEFAULT_PREINDUSTRIAL_PACK)
  })
  it('resolves declared dependencies in deterministic order and reports changes', () => {
    const foundation = { ...DEFAULT_PREINDUSTRIAL_PACK, manifest: { ...DEFAULT_PREINDUSTRIAL_PACK.manifest, id: 'setting.foundation', version: '1.0.0' } }
    const extension = { ...DEFAULT_PREINDUSTRIAL_PACK, manifest: { ...DEFAULT_PREINDUSTRIAL_PACK.manifest, id: 'setting.extension', version: '1.0.0', dependencies: [{ id: 'setting.foundation', version: '1.0.0' }] } }
    expect(createContentPackRegistry([extension, foundation]).resolve('setting.extension').map((pack) => pack.manifest.id)).toEqual(['setting.foundation', 'setting.extension'])
    expect(diffContentPacks(foundation, extension).map((item) => item.path)).toContain('manifest.id')
    const changed = { ...foundation, personVariables: foundation.personVariables.map((definition) => definition.id === 'person.trait.curiosity' ? { ...definition, defaultValue: 600 } : definition) }
    expect(diffContentPacks(foundation, changed)).toContainEqual(expect.objectContaining({ path: 'personVariables[person.trait.curiosity].defaultValue', before: 500, after: 600 }))
  })
  it('retains a canonical resolved graph and rejects ambiguous, cyclic, or altered versions', async () => {
    const base = structuredClone(DEFAULT_PREINDUSTRIAL_PACK)
    base.manifest = { ...base.manifest, id: 'setting.graph.base', version: '1.0.0', name: 'Graph base' }
    const extension = structuredClone(DEFAULT_PREINDUSTRIAL_PACK)
    extension.manifest = { ...extension.manifest, id: 'setting.graph.extension', version: '1.0.0', name: 'Graph extension', dependencies: [{ id: base.manifest.id, version: base.manifest.version }] }
    const resolved = createContentPackResolver([extension, base]).resolve(extension.manifest.id, extension.manifest.version)
    expect(resolved.packs.map((pack) => pack.manifest.id)).toEqual([base.manifest.id, extension.manifest.id])
    expect(resolved.checksum).toMatch(/^[0-9a-f]{32}$/)
    const engine = SimulationEngine.create('content-pack-graph', 8, 8, resolved)
    engine.advance(4)
    const snapshot = await engine.snapshot()
    expect((await SimulationEngine.restore(snapshot, resolved).then((restored) => restored.snapshot())).digest).toBe(snapshot.digest)
    const altered = structuredClone(base); altered.personVariables = altered.personVariables.map((entry) => entry.id === 'person.trait.curiosity' ? { ...entry, defaultValue: 501 } : entry)
    const alteredResolved = createContentPackResolver([extension, altered]).resolve(extension.manifest.id, extension.manifest.version)
    await expect(SimulationEngine.restore(snapshot, alteredResolved)).rejects.toThrow('checksum')
    expect(() => createContentPackRegistry([base, { ...base, manifest: { ...base.manifest, version: '2.0.0' } }]).get(base.manifest.id)).toThrow('Ambiguous')
    const cycle = structuredClone(base); cycle.manifest = { ...cycle.manifest, dependencies: [{ id: extension.manifest.id, version: extension.manifest.version }] }
    expect(() => createContentPackResolver([extension, cycle]).resolve(extension.manifest.id, extension.manifest.version)).toThrow('cycle')
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
  it('evaluates declared formula RNG through named, restored engine streams', async () => {
    const pack = structuredClone(DEFAULT_PREINDUSTRIAL_PACK)
    pack.manifest = { ...pack.manifest, id: 'setting.preindustrial.formula', version: '1.0.0', name: 'Formula setting' }
    pack.formulas = { ...pack.formulas, 'decision.rest.base': { kind: 'randomChance', stream: 'rest-weight', probabilityPermille: { kind: 'constant', value: 500 }, whenTrue: { kind: 'constant', value: 10_000 }, whenFalse: { kind: 'constant', value: 9_999 } } }
    const first = SimulationEngine.create('content-pack-formula-run', 8, 8, pack)
    const second = SimulationEngine.create('content-pack-formula-run', 8, 8, pack)
    first.advance(1); second.advance(1)
    const firstSnapshot = await first.snapshot(); const secondSnapshot = await second.snapshot()
    expect(firstSnapshot.digest).toBe(secondSnapshot.digest)
    expect(firstSnapshot.state.randomStreams.map((stream) => stream.name)).toContain('content-pack.setting.preindustrial.formula.rest-weight')
  })
  it('does not overwrite an existing content pack version', async () => {
    const catalog = new MemoryContentPackCatalog([DEFAULT_PREINDUSTRIAL_PACK])
    const changed = structuredClone(DEFAULT_PREINDUSTRIAL_PACK)
    changed.manifest = { ...changed.manifest, name: 'Changed without a version bump' }
    await expect(catalog.putPack(changed)).rejects.toThrow('immutable')
  })
  it('uses validated typed SDK payloads for catalog workflows', async () => {
    const requests: Request[] = []
    const fetcher: typeof fetch = async (input, init) => {
      requests.push(new Request(input, init))
      return new Response(JSON.stringify(init?.method === 'PUT' ? DEFAULT_PREINDUSTRIAL_PACK : [DEFAULT_PREINDUSTRIAL_PACK]), { status: init?.method === 'PUT' ? 201 : 200 })
    }
    const client = new ContentPackClient('https://example.test', 'token', fetcher)
    expect(await client.list()).toEqual([DEFAULT_PREINDUSTRIAL_PACK])
    expect(await client.put(DEFAULT_PREINDUSTRIAL_PACK)).toEqual(DEFAULT_PREINDUSTRIAL_PACK)
    expect(requests.map((request) => [request.url, request.method, request.headers.get('authorization')])).toEqual([
      ['https://example.test/content-packs', 'GET', 'Bearer token'], ['https://example.test/content-packs', 'PUT', 'Bearer token'],
    ])
  })
})
