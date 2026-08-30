import { canonicalStringify } from '../simulation/serialization/snapshot'
import type { ContentPack, ContentPackId } from './types'
import { validateContentPack } from './validate'
import { compareStableText } from '../shared/stableOrder'

export interface ContentPackRegistry {
  readonly packs: readonly ContentPack[]
  get(id: ContentPackId, version?: string): ContentPack
  resolve(id: ContentPackId, version?: string): readonly ContentPack[]
}

/** A detached, deterministic description of the exact authored packs used by
 * a run.  The root is last in `packs`; dependencies are stable post-order. */
export interface ResolvedContentPack {
  readonly pack: ContentPack
  readonly packs: readonly ContentPack[]
  readonly dependencies: readonly { id: ContentPackId; version: string; checksum: string }[]
  readonly checksum: string
}

export interface ContentPackResolver {
  resolve(id: ContentPackId, version: string): ResolvedContentPack
}

export function createContentPackRegistry(candidates: readonly ContentPack[]): ContentPackRegistry {
  const sorted = candidates.map((candidate) => validateContentPack(candidate).pack).sort((left, right) => compareStableText(left.manifest.id, right.manifest.id) || compareStableText(left.manifest.version, right.manifest.version))
  const unique = new Map<string, ContentPack>()
  for (const pack of sorted) {
    const key = `${pack.manifest.id}@${pack.manifest.version}`
    const existing = unique.get(key)
    if (existing && canonicalStringify(existing) !== canonicalStringify(pack)) throw new Error(`Conflicting content-pack manifest version: ${key}`)
    unique.set(key, pack)
  }
  const packs = [...unique.values()]
  const byId = new Map(packs.map((pack) => [`${pack.manifest.id}@${pack.manifest.version}`, pack]))
  function resolve(id: ContentPackId, version: string | undefined, visiting = new Set<string>(), resolved: ContentPack[] = []): readonly ContentPack[] {
    const available = [...byId.values()].filter((pack) => pack.manifest.id === id).map((pack) => pack.manifest.version).sort(compareStableText)
    if (version === undefined && available.length > 1) throw new Error(`Ambiguous content-pack version: ${id} (${available.join(', ')})`)
    const key = version ? `${id}@${version}` : `${id}@${available[0] ?? ''}`
    if (visiting.has(key)) throw new Error(`Content-pack dependency cycle: ${[...visiting, key].join(' -> ')}`)
    const pack = byId.get(key)
    if (!pack) throw new Error(`Unknown content pack: ${key}`)
    visiting.add(key)
    for (const dependency of [...pack.manifest.dependencies].sort((left, right) => compareStableText(left.id, right.id) || compareStableText(left.version, right.version))) {
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

/** Resolves only exact ID/version references and freezes a canonical graph
 * checksum.  Dependency content is deliberately not merged into the root
 * runtime: packs retain their own semantic ownership. */
export function createContentPackResolver(candidates: readonly ContentPack[]): ContentPackResolver {
  const registry = createContentPackRegistry(candidates)
  return Object.freeze({
    resolve(id: ContentPackId, version: string): ResolvedContentPack {
      const packs = registry.resolve(id, version)
      const dependencies = packs.map((pack) => Object.freeze({ id: pack.manifest.id, version: pack.manifest.version, checksum: contentPackChecksum(pack) }))
      const checksum = contentPackChecksum({ packs: dependencies })
      return Object.freeze({ pack: packs.at(-1)!, packs: Object.freeze([...packs]), dependencies: Object.freeze(dependencies), checksum })
    },
  })
}

export function resolveContentPack(candidate: ContentPack | ResolvedContentPack): ResolvedContentPack {
  if (isResolvedContentPack(candidate)) {
    const verified = createContentPackResolver(candidate.packs).resolve(candidate.pack.manifest.id, candidate.pack.manifest.version)
    if (verified.checksum !== candidate.checksum) throw new Error('Resolved content-pack checksum is invalid')
    return verified
  }
  return createContentPackResolver([candidate]).resolve(candidate.manifest.id, candidate.manifest.version)
}

export function contentPackChecksum(value: unknown): string {
  // A deterministic fingerprint is sufficient here because content storage
  // additionally checks canonical bytes before accepting an immutable version.
  const source = canonicalStringify(value)
  let first = 0x811c9dc5; let second = 0x9e3779b9; let third = 0x85ebca6b; let fourth = 0xc2b2ae35
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193) >>> 0
    second = Math.imul(second ^ code, 0x27d4eb2d) >>> 0
    third = Math.imul(third ^ code, 0x165667b1) >>> 0
    fourth = Math.imul(fourth ^ code, 0x9e3779b1) >>> 0
  }
  return [first, second, third, fourth].map((part) => part.toString(16).padStart(8, '0')).join('')
}

function isResolvedContentPack(value: ContentPack | ResolvedContentPack): value is ResolvedContentPack {
  return 'packs' in value && 'checksum' in value && Array.isArray(value.packs)
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
