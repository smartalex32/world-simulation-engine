import { canonicalStringify } from '../simulation/serialization/snapshot'
import type { ContentPack, ContentPackId } from './types'
import { validateContentPack } from './validate'
import { compareStableText } from '../shared/stableOrder'

export interface ContentPackRegistry {
  readonly packs: readonly ContentPack[]
  get(id: ContentPackId, version?: string): ContentPack
  resolve(id: ContentPackId, version?: string): readonly ContentPack[]
}

export function createContentPackRegistry(candidates: readonly ContentPack[]): ContentPackRegistry {
  const packs = candidates.map((candidate) => validateContentPack(candidate).pack).sort((left, right) => compareStableText(left.manifest.id, right.manifest.id) || compareStableText(left.manifest.version, right.manifest.version))
  const byId = new Map(packs.map((pack) => [`${pack.manifest.id}@${pack.manifest.version}`, pack]))
  if (byId.size !== packs.length) throw new Error('Duplicate content-pack manifest ID')
  function resolve(id: ContentPackId, version: string | undefined, visiting = new Set<string>(), resolved: ContentPack[] = []): readonly ContentPack[] {
    const key = version ? `${id}@${version}` : `${id}@${[...byId.values()].filter((pack) => pack.manifest.id === id).map((pack) => pack.manifest.version).sort().at(-1) ?? ''}`
    if (visiting.has(key)) throw new Error(`Content-pack dependency cycle: ${[...visiting, key].join(' -> ')}`)
    const pack = byId.get(key)
    if (!pack) throw new Error(`Unknown content pack: ${key}`)
    visiting.add(key)
    for (const dependency of pack.manifest.dependencies) {
      const required = byId.get(`${dependency.id}@${dependency.version}`)
      if (!required) throw new Error(`Unsatisfied content-pack dependency: ${dependency.id}@${dependency.version}`)
      resolve(dependency.id, dependency.version, visiting, resolved)
    }
    visiting.delete(key)
    if (!resolved.some((candidate) => candidate.manifest.id === id && candidate.manifest.version === pack.manifest.version)) resolved.push(pack)
    return resolved
  }
  return Object.freeze({ packs: Object.freeze(packs), get(id: ContentPackId, version?: string) { return resolve(id, version).at(-1)! }, resolve(id: ContentPackId, version?: string) { return Object.freeze([...resolve(id, version)]) } })
}

export interface ContentPackDifference { path: string; before?: unknown; after?: unknown }
export function diffContentPacks(before: ContentPack, after: ContentPack): readonly ContentPackDifference[] {
  const left = JSON.parse(canonicalStringify(before)) as Record<string, unknown>
  const right = JSON.parse(canonicalStringify(after)) as Record<string, unknown>
  const differences: ContentPackDifference[] = []
  diffValue(left, right, '', differences)
  return Object.freeze(differences)
}

function diffValue(before: unknown, after: unknown, path: string, differences: ContentPackDifference[]): void {
  if (canonicalStringify(before) === canonicalStringify(after)) return
  if (Array.isArray(before) && Array.isArray(after)) {
    const keyed = (value: unknown): value is { id: string } => Boolean(value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string')
    if (before.every(keyed) && after.every(keyed)) {
      const left = new Map(before.map((item) => [item.id, item])); const right = new Map(after.map((item) => [item.id, item]))
      for (const id of [...new Set([...left.keys(), ...right.keys()])].sort()) diffValue(left.get(id), right.get(id), `${path}[${id}]`, differences)
      return
    }
  }
  if (before && after && typeof before === 'object' && typeof after === 'object' && !Array.isArray(before) && !Array.isArray(after)) {
    const left = before as Record<string, unknown>; const right = after as Record<string, unknown>
    for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) diffValue(left[key], right[key], path ? `${path}.${key}` : key, differences)
    return
  }
  differences.push(Object.freeze({ path, before, after }))
}

export function exportContentPack(pack: ContentPack): string { return validateContentPack(pack).canonicalJson }
export function importContentPack(value: string): ContentPack { return validateContentPack(JSON.parse(value) as unknown).pack }
