import { describe, expect, it } from 'vitest'
import { DEFAULT_PREINDUSTRIAL_PACK, createContentPackRegistry, diffContentPacks, evaluateExpression, exportContentPack, importContentPack, validateContentPack } from '.'

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
    expect(diffContentPacks(foundation, extension).map((item) => item.path)).toContain('manifest')
  })
  it('rejects unsafe pack structure and evaluates named deterministic chance', () => {
    expect(() => validateContentPack({ ...DEFAULT_PREINDUSTRIAL_PACK, manifest: { ...DEFAULT_PREINDUSTRIAL_PACK.manifest, id: 'Bad ID' } })).toThrow('Invalid content pack')
    const random = { nextPermille: (stream: string) => { expect(stream).toBe('content.test'); return 4 } }
    expect(evaluateExpression({ kind: 'randomChance', stream: 'content.test', probabilityPermille: { kind: 'constant', value: 5 }, whenTrue: { kind: 'constant', value: 2 }, whenFalse: { kind: 'constant', value: 1 } }, {}, random)).toBe(2)
    expect(() => evaluateExpression({ kind: 'randomChance', stream: '', probabilityPermille: { kind: 'constant', value: 5 }, whenTrue: { kind: 'constant', value: 2 }, whenFalse: { kind: 'constant', value: 1 } }, {}, random)).toThrow('named RNG')
  })
})
