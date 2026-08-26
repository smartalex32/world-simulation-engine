import { canonicalStringify } from '../simulation/serialization/snapshot'
import type { ContentPack, ContentPackId } from './types'
import { validateContentPack } from './validate'

export interface ContentPackRegistry {
  readonly packs: readonly ContentPack[]
  get(id: ContentPackId): ContentPack
  resolve(id: ContentPackId): readonly ContentPack[]
}

export function createContentPackRegistry(candidates: readonly ContentPack[]): ContentPackRegistry {
  const packs = candidates.map((candidate) => validateContentPack(candidate).pack).sort((left, right) => left.manifest.id.localeCompare(right.manifest.id))
  const byId = new Map(packs.map((pack) => [pack.manifest.id, pack]))
  if (byId.size !== packs.length) throw new Error('Duplicate content-pack manifest ID')
  function resolve(id: ContentPackId, visiting = new Set<string>(), resolved: ContentPack[] = []): readonly ContentPack[] {
    if (visiting.has(id)) throw new Error(`Content-pack dependency cycle: ${[...visiting, id].join(' -> ')}`)
    const pack = byId.get(id)
    if (!pack) throw new Error(`Unknown content pack: ${id}`)
    visiting.add(id)
    for (const dependency of pack.manifest.dependencies) {
      const required = byId.get(dependency.id)
      if (!required || required.manifest.version !== dependency.version) throw new Error(`Unsatisfied content-pack dependency: ${dependency.id}@${dependency.version}`)
      resolve(dependency.id, visiting, resolved)
    }
    visiting.delete(id)
    if (!resolved.some((candidate) => candidate.manifest.id === id)) resolved.push(pack)
    return resolved
  }
  return Object.freeze({ packs: Object.freeze(packs), get(id: ContentPackId) { const pack = byId.get(id); if (!pack) throw new Error(`Unknown content pack: ${id}`); return pack }, resolve(id: ContentPackId) { return Object.freeze([...resolve(id)]) } })
}

export interface ContentPackDifference { path: string; before?: unknown; after?: unknown }
export function diffContentPacks(before: ContentPack, after: ContentPack): readonly ContentPackDifference[] {
  const left = JSON.parse(canonicalStringify(before)) as Record<string, unknown>
  const right = JSON.parse(canonicalStringify(after)) as Record<string, unknown>
  const differences: ContentPackDifference[] = []
  for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) if (canonicalStringify(left[key]) !== canonicalStringify(right[key])) differences.push(Object.freeze({ path: key, before: left[key], after: right[key] }))
  return Object.freeze(differences)
}

export function exportContentPack(pack: ContentPack): string { return validateContentPack(pack).canonicalJson }
export function importContentPack(value: string): ContentPack { return validateContentPack(JSON.parse(value) as unknown).pack }
