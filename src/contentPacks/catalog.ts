import { compareStableText } from '../shared/stableOrder'
import { exportContentPack, importContentPack } from './registry'
import type { ContentPack } from './types'

/** Injectable pack catalog; a hosted durable repository can implement the same shape later. */
export interface ContentPackCatalog { listPacks(): Promise<readonly ContentPack[]>; getPack(id: string, version: string): Promise<ContentPack | undefined>; putPack(pack: ContentPack): Promise<ContentPack> }
export class MemoryContentPackCatalog implements ContentPackCatalog {
  private readonly packs = new Map<string, ContentPack>()
  constructor(initial: readonly ContentPack[] = []) { for (const pack of initial) void this.putPack(pack) }
  async listPacks(): Promise<readonly ContentPack[]> { return Object.freeze([...this.packs.values()].map((pack) => importContentPack(exportContentPack(pack))).sort((a, b) => compareStableText(a.manifest.id, b.manifest.id) || compareStableText(a.manifest.version, b.manifest.version))) }
  async getPack(id: string, version: string): Promise<ContentPack | undefined> { const pack = this.packs.get(key(id, version)); return pack && importContentPack(exportContentPack(pack)) }
  async putPack(pack: ContentPack): Promise<ContentPack> { const valid = importContentPack(exportContentPack(pack)); this.packs.set(key(valid.manifest.id, valid.manifest.version), valid); return valid }
}
function key(id: string, version: string): string { return `${id}@${version}` }
