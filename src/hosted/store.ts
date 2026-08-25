import { mkdir, readFile, rename, writeFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { HostedJobStore, HostedSimulationJob, HostedRunRecord, HostedRunStore } from './types'

/** In-memory store used only by tests and embedding hosts. */
export class MemoryHostedRunStore implements HostedRunStore, HostedJobStore {
  private readonly records = new Map<string, HostedRunRecord>()
  private readonly jobs = new Map<string, HostedSimulationJob>()

  async load(runId: string): Promise<HostedRunRecord | undefined> {
    const record = this.records.get(runId)
    return record === undefined ? undefined : structuredClone(record)
  }

  async save(record: HostedRunRecord): Promise<void> {
    this.records.set(record.runId, structuredClone(record))
  }
  async list(ownerId: string): Promise<HostedRunRecord[]> { return [...this.records.values()].filter((record) => record.ownerId === ownerId).map((record) => structuredClone(record)).sort((a, b) => a.runId.localeCompare(b.runId)) }
  async loadJob(runId: string, jobId: string): Promise<HostedSimulationJob | undefined> {
    const job = this.jobs.get(jobKey(runId, jobId))
    return job === undefined ? undefined : structuredClone(job)
  }
  async saveJob(job: HostedSimulationJob): Promise<void> { this.jobs.set(jobKey(job.runId, job.jobId), structuredClone(job)) }
  async listJobs(runId: string): Promise<HostedSimulationJob[]> {
    return [...this.jobs.values()].filter((job) => job.runId === runId).map((job) => structuredClone(job)).sort((a, b) => a.jobId.localeCompare(b.jobId))
  }
}

/** One JSON record per run, written through an atomic replacement. */
export class FileHostedRunStore implements HostedRunStore, HostedJobStore {
  constructor(private readonly directory: string) {}

  async load(runId: string): Promise<HostedRunRecord | undefined> {
    try {
      return JSON.parse(await readFile(this.pathFor(runId), 'utf8')) as HostedRunRecord
    } catch (error) {
      if (isMissingFile(error)) return undefined
      throw error
    }
  }

  async save(record: HostedRunRecord): Promise<void> {
    const path = this.pathFor(record.runId)
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.tmp`
    await writeFile(temporary, JSON.stringify(record), 'utf8')
    await rename(temporary, path)
  }

  async list(ownerId: string): Promise<HostedRunRecord[]> {
    try {
      const names = (await readdir(this.directory)).filter((name) => name.endsWith('.json')).sort()
      const records = await Promise.all(names.map(async (name) => JSON.parse(await readFile(join(this.directory, name), 'utf8')) as HostedRunRecord))
      return records.filter((record) => record.ownerId === ownerId).sort((a, b) => a.runId.localeCompare(b.runId))
    } catch (error) { if (isMissingFile(error)) return []; throw error }
  }

  async loadJob(runId: string, jobId: string): Promise<HostedSimulationJob | undefined> {
    try { return JSON.parse(await readFile(this.jobPathFor(runId, jobId), 'utf8')) as HostedSimulationJob }
    catch (error) { if (isMissingFile(error)) return undefined; throw error }
  }

  async saveJob(job: HostedSimulationJob): Promise<void> {
    const path = this.jobPathFor(job.runId, job.jobId)
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.tmp`
    await writeFile(temporary, JSON.stringify(job), 'utf8')
    await rename(temporary, path)
  }

  async listJobs(runId: string): Promise<HostedSimulationJob[]> {
    const directory = join(this.directory, 'jobs', validatedId(runId))
    try {
      const names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort()
      return await Promise.all(names.map(async (name) => JSON.parse(await readFile(join(directory, name), 'utf8')) as HostedSimulationJob))
    } catch (error) { if (isMissingFile(error)) return []; throw error }
  }

  private pathFor(runId: string): string {
    return join(this.directory, `${validatedId(runId)}.json`)
  }
  private jobPathFor(runId: string, jobId: string): string { return join(this.directory, 'jobs', validatedId(runId), `${validatedId(jobId)}.json`) }
}

function validatedId(value: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('Hosted run ID contains unsupported characters')
  return value
}
function jobKey(runId: string, jobId: string): string { return `${runId}:${jobId}` }

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
