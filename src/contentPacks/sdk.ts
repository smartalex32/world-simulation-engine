import { importContentPack } from './registry'
import type { ContentPack } from './types'

/** Minimal typed client for nonvisual content-pack workflows. */
export class ContentPackClient {
  constructor(private readonly baseUrl: string, private readonly token: string, private readonly fetcher: typeof fetch = fetch) {}
  async list(): Promise<readonly ContentPack[]> { return this.request('/content-packs') as Promise<readonly ContentPack[]> }
  async put(pack: ContentPack): Promise<ContentPack> { return this.request('/content-packs', { method: 'PUT', body: JSON.stringify(pack) }) as Promise<ContentPack> }
  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, { ...init, headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json', ...init.headers } })
    const value = await response.json() as unknown
    if (!response.ok) throw new Error(`Content-pack API request failed: ${response.status}`)
    return Array.isArray(value) ? value.map((item) => importContentPack(JSON.stringify(item))) : importContentPack(JSON.stringify(value))
  }
}
