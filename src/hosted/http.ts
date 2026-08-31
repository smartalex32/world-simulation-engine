import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { MapProjectionRequest } from '../projection'
import type { HostedRunCommand } from './types'
import { HostedSimulationJobManager, type HostedJobRequest } from './jobs'
import { HostedRunService } from './runService'
import { importContentPack, type ContentPackCatalog } from '../contentPacks'
import { HostedEventStream } from './eventStream'
import { SharedWorldService, type SharedOutboxEventInput, type SharedWorldMutationStore } from './sharedWorlds'
import { SharedRunCoordinator } from './sharedRuns'
import type { HostedRunRecord } from './types'
import { canonicalStringify } from '../simulation/serialization/snapshot'

export interface HostedHttpServerOptions {
  runId: string
  ownerToken: string
  service: HostedRunService
  jobs: HostedSimulationJobManager
  maximumRequestBytes?: number
  contentPacks?: ContentPackCatalog
  sharedWorlds?: SharedWorldService
  sharedStore?: SharedWorldMutationStore
  eventStream?: HostedEventStream
  saveSharedWorlds?: (service: SharedWorldService) => Promise<void>
  sharedRuns?: SharedRunCoordinator
  saveEventStream?: () => Promise<void>
}

/** The HTTP layer only validates/authorizes transport; services retain state ownership. */
export function createHostedHttpServer(options: HostedHttpServerOptions): Server {
  const maximumRequestBytes = options.maximumRequestBytes ?? 65_536
  return createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname
      if (request.method === 'GET' && pathname === '/api/v1/openapi.json') return sendJson(response, 200, openApiDocument())
      if (request.method === 'GET' && pathname === '/api/v1/events') {
        const accountId = requiredShared(options).authenticateToken(bearerToken(request), 'worlds:read')
        void accountId
        const lastEventId = parseLastEventId(request.headers['last-event-id'])
        if (options.sharedStore) return writeSse(response, await options.sharedStore.outboxAfter(lastEventId ?? 0))
        return requiredEvents(options).writeSse(response, lastEventId)
      }
      if (request.method === 'POST' && pathname === '/api/v1/accounts') {
        const body = requiredRecord(await readJson(request, maximumRequestBytes)); const now = new Date().toISOString()
        const account = await mutateShared(options, async (service) => ({ value: await service.createAccount(requiredText(body.id), requiredText(body.email), requiredText(body.password), now) }))
        return sendJson(response, 201, { id: account.id, email: account.email, createdAt: account.createdAt })
      }
      if (request.method === 'POST' && pathname === '/api/v1/sessions') {
        const body = requiredRecord(await readJson(request, maximumRequestBytes)); const now = new Date().toISOString()
        const session = await mutateShared(options, async (service) => ({ value: await service.createSession(requiredText(body.email), requiredText(body.password), now) }))
        return sendJson(response, 201, { token: session.token, expiresAt: session.session.expiresAt })
      }
      if (request.method === 'POST' && pathname === '/api/v1/tokens') { const body = requiredRecord(await readJson(request, maximumRequestBytes)); const bearer = bearerToken(request); const now = new Date().toISOString(); const issued = await mutateShared(options, (service) => { const accountId = service.authenticateToken(bearer, 'worlds:write'); return { value: service.issueToken(requiredText(body.id), accountId, requiredScopes(body.scopes), now) } }); return sendJson(response, 201, { token: issued.token, record: publicToken(issued.record) }) }
      if (request.method === 'GET' && pathname === '/api/v1/tokens') { const service = requiredShared(options); const accountId = service.authenticateToken(bearerToken(request), 'worlds:read'); return sendJson(response, 200, service.listTokens(accountId)) }
      const tokenMatch = /^\/api\/v1\/tokens\/([a-zA-Z0-9_-]+)$/.exec(pathname)
      if (request.method === 'DELETE' && tokenMatch) { const bearer = bearerToken(request); await mutateShared(options, (service) => { const accountId = service.authenticateToken(bearer, 'worlds:write'); service.revokeToken(tokenMatch[1]!, accountId); return { value: undefined } }); return sendJson(response, 204, undefined) }
      if (request.method === 'POST' && pathname === '/api/v1/worlds') {
        const body = requiredRecord(await readJson(request, maximumRequestBytes)); const bearer = bearerToken(request); const now = new Date().toISOString(); const id = requiredText(body.id)
        const world = await mutateShared(options, (service) => { const accountId = service.authenticateToken(bearer, 'worlds:write'); const created = service.createWorld(id, requiredText(body.name), accountId, body.draft ?? {}, now); return { value: created, event: { key: `world:${id}:created`, topic: 'world', payload: { id: created.id, revision: created.currentRevision }, occurredAt: created.updatedAt } } })
        return sendJson(response, 201, world)
      }
      const worldMatch = /^\/api\/v1\/worlds\/([a-zA-Z0-9_-]+)$/.exec(pathname)
      if (request.method === 'GET' && worldMatch) { const accountId = requiredShared(options).authenticateToken(bearerToken(request), 'worlds:read'); return sendJson(response, 200, requiredShared(options).getWorld(worldMatch[1]!, accountId)) }
      const membersMatch = /^\/api\/v1\/worlds\/([a-zA-Z0-9_-]+)\/members$/.exec(pathname)
      if (request.method === 'GET' && membersMatch) { const service = requiredShared(options); const accountId = service.authenticateToken(bearerToken(request), 'worlds:read'); return sendJson(response, 200, service.listMembers(membersMatch[1]!, accountId)) }
      if (request.method === 'PUT' && membersMatch) { const body = requiredRecord(await readJson(request, maximumRequestBytes)); const bearer = bearerToken(request); const now = new Date().toISOString(); const member = await mutateShared(options, (service) => { const actorId = service.authenticateToken(bearer, 'worlds:write'); return { value: service.addMember(membersMatch[1]!, actorId, requiredText(body.accountId), requiredWorldRole(body.role), now) } }); return sendJson(response, 200, member) }
      const leaseMatch = /^\/api\/v1\/worlds\/([a-zA-Z0-9_-]+)\/lease$/.exec(pathname)
      if (request.method === 'POST' && leaseMatch) { const bearer = bearerToken(request); const body = requiredRecord(await readJson(request, maximumRequestBytes)); const now = new Date().toISOString(); const lease = await mutateShared(options, (service) => { const accountId = service.authenticateToken(bearer, 'worlds:write'); return { value: typeof body.leaseId === 'string' ? service.renewLease(leaseMatch[1]!, accountId, body.leaseId, requiredInteger(body.expectedRevision), now) : service.acquireLease(leaseMatch[1]!, accountId, now) } }); return sendJson(response, 200, lease) }
      const revisionsMatch = /^\/api\/v1\/worlds\/([a-zA-Z0-9_-]+)\/revisions$/.exec(pathname)
      if (request.method === 'GET' && revisionsMatch) { const service = requiredShared(options); const accountId = service.authenticateToken(bearerToken(request), 'worlds:read'); return sendJson(response, 200, service.listRevisions(revisionsMatch[1]!, accountId)) }
      if (request.method === 'POST' && revisionsMatch) { const body = requiredRecord(await readJson(request, maximumRequestBytes)); const bearer = bearerToken(request); const clientMutationId = requiredText(body.clientMutationId); const now = new Date().toISOString(); const revision = await mutateShared(options, (service) => { const accountId = service.authenticateToken(bearer, 'worlds:write'); const saved = service.saveRevision(revisionsMatch[1]!, accountId, requiredText(body.leaseId), requiredInteger(body.expectedRevision), clientMutationId, body.payload, now); return { value: saved, event: { key: `revision:${saved.worldId}:${accountId}:${clientMutationId}`, topic: 'draft.revised', payload: { worldId: saved.worldId, revision: saved.revision }, occurredAt: saved.createdAt } } }); return sendJson(response, 201, revision) }
      const auditsMatch = /^\/api\/v1\/worlds\/([a-zA-Z0-9_-]+)\/audits$/.exec(pathname)
      if (request.method === 'GET' && auditsMatch) { const service = requiredShared(options); const accountId = service.authenticateToken(bearerToken(request), 'worlds:read'); return sendJson(response, 200, service.listAudits(auditsMatch[1]!, accountId)) }
      const runsMatch = /^\/api\/v1\/worlds\/([a-zA-Z0-9_-]+)\/runs$/.exec(pathname)
      if (request.method === 'GET' && runsMatch) { const service = requiredShared(options); const accountId = service.authenticateToken(bearerToken(request), 'worlds:read'); return sendJson(response, 200, service.listRuns(runsMatch[1]!, accountId)) }
      if (request.method === 'POST' && runsMatch) {
        const body = requiredRecord(await readJson(request, maximumRequestBytes)); const bearer = bearerToken(request); const now = new Date().toISOString(); const runId = requiredText(body.runId); const coordinator = requiredSharedRuns(options)
        const run = await mutateShared(options, async (service) => { const accountId = service.authenticateToken(bearer, 'worlds:write'); const committed = service.commitRun(runsMatch[1]!, accountId, requiredInteger(body.revision), runId, now); const initialRun = await coordinator.prepare(committed.run.runId, committed.run.ownerAccountId, committed.draft, now); return { value: committed.run, initialRun, event: { key: `run:${runId}:committed`, topic: 'run.committed', payload: committed.run, occurredAt: committed.run.createdAt } } })
        return sendJson(response, 201, run)
      }
      const sharedRunMatch = /^\/api\/v1\/worlds\/([a-zA-Z0-9_-]+)\/runs\/([a-zA-Z0-9_-]+)\/(projection|commands)$/.exec(pathname)
      if (sharedRunMatch) {
        const bearer = bearerToken(request)
        if (request.method === 'GET' && sharedRunMatch[3] === 'projection') { const service = requiredShared(options); const accountId = service.authenticateToken(bearer, 'worlds:read'); const run = service.getRun(sharedRunMatch[1]!, sharedRunMatch[2]!, accountId); return sendJson(response, 200, await requiredSharedRuns(options).projection(run.runId, run.ownerAccountId, service.draftForRun(run))) }
        if (request.method === 'POST' && sharedRunMatch[3] === 'commands') { const command = validateHostedCommand(await readJson(request, maximumRequestBytes)); const result = await executeSharedRunCommand(options, sharedRunMatch[1]!, sharedRunMatch[2]!, bearer, command, new Date().toISOString()); return sendJson(response, 200, result) }
      }
      if (request.method === 'GET' && pathname === '/health') return sendJson(response, 200, { status: 'ok', runId: options.runId })
      const token = bearerToken(request)
      if (request.method === 'GET' && pathname === '/content-packs') { authorizeToken(token, options.ownerToken); return sendJson(response, 200, await requiredContentPacks(options).listPacks()) }
      if (request.method === 'PUT' && pathname === '/content-packs') {
        authorizeToken(token, options.ownerToken)
        const pack = importContentPack(JSON.stringify(await readJson(request, maximumRequestBytes)))
        return sendJson(response, 201, await requiredContentPacks(options).putPack(pack))
      }
      if (request.method === 'GET' && pathname === `/runs/${options.runId}/projection`) return sendJson(response, 200, await options.service.view(token))
      if (request.method === 'POST' && pathname === `/runs/${options.runId}/commands`) {
        const command = validateHostedCommand(await readJson(request, maximumRequestBytes))
        authorizeToken(token, options.ownerToken)
        return sendJson(response, 200, await options.jobs.executeDirect(command))
      }
      if (request.method === 'GET' && pathname === `/runs/${options.runId}/jobs`) { authorizeToken(token, options.ownerToken); return sendJson(response, 200, await options.jobs.list()) }
      if (request.method === 'POST' && pathname === `/runs/${options.runId}/jobs`) { authorizeToken(token, options.ownerToken); return sendJson(response, 202, await options.jobs.start(validateJobRequest(await readJson(request, maximumRequestBytes)))) }
      const cancelMatch = new RegExp(`^/runs/${options.runId}/jobs/([a-zA-Z0-9_-]+)/cancel$`).exec(pathname)
      if (request.method === 'POST' && cancelMatch) { authorizeToken(token, options.ownerToken); return sendJson(response, 200, await options.jobs.cancel(cancelMatch[1]!)) }
      const jobMatch = new RegExp(`^/runs/${options.runId}/jobs/([a-zA-Z0-9_-]+)$`).exec(pathname)
      if (request.method === 'GET' && jobMatch) {
        authorizeToken(token, options.ownerToken)
        const job = await options.jobs.get(jobMatch[1]!)
        if (!job) throw new HostedHttpError(404, 'Hosted job not found')
        return sendJson(response, 200, job)
      }
      throw new HostedHttpError(404, 'Not found')
    } catch (error) {
      const failure = httpFailure(error)
      return sendJson(response, failure.status, { error: failure.message })
    }
  })
}
function requiredContentPacks(options: HostedHttpServerOptions): ContentPackCatalog { if (!options.contentPacks) throw new HostedHttpError(404, 'Content packs are not configured'); return options.contentPacks }
function requiredShared(options: HostedHttpServerOptions): SharedWorldService { if (!options.sharedWorlds) throw new HostedHttpError(404, 'Shared worlds are not configured'); return options.sharedWorlds }
function requiredEvents(options: HostedHttpServerOptions): HostedEventStream { if (!options.eventStream) throw new HostedHttpError(404, 'Event stream is not configured'); return options.eventStream }
function requiredSharedRuns(options: HostedHttpServerOptions): SharedRunCoordinator { if (!options.sharedRuns) throw new HostedHttpError(404, 'Shared runs are not configured'); return options.sharedRuns }
async function saveEventStream(options: HostedHttpServerOptions): Promise<void> { if (options.saveEventStream) await options.saveEventStream() }

interface PreparedSharedMutation<T> { value: T; event?: SharedOutboxEventInput; initialRun?: HostedRunRecord }
const sharedQueues = new WeakMap<SharedWorldService, Promise<void>>()
const unreconciledSharedServices = new WeakSet<SharedWorldService>()

async function mutateShared<T>(options: HostedHttpServerOptions, operation: (candidate: SharedWorldService) => PreparedSharedMutation<T> | Promise<PreparedSharedMutation<T>>): Promise<T> {
  const service = requiredShared(options)
  return enqueueShared(service, async () => {
    const candidate = service.fork(); const prepared = await operation(candidate)
    // A semantic retry (notably a repeated draft clientMutationId) may return
    // the prior result without changing state. Its original transaction already
    // owns the durable outbox event, so do not create a new storage revision.
    if (!prepared.initialRun && canonicalStringify(candidate.snapshotState()) === canonicalStringify(service.snapshotState())) return prepared.value
    await commitSharedCandidate(options, service, candidate, prepared.event, prepared.initialRun)
    return prepared.value
  })
}

async function commitSharedCandidate(options: HostedHttpServerOptions, service: SharedWorldService, candidate: SharedWorldService, event?: SharedOutboxEventInput, initialRun?: HostedRunRecord): Promise<void> {
  try {
    if (options.sharedStore) {
      const committed = await options.sharedStore.commitSharedWorldMutation({ expectedRevision: service.storageRevision(), service: candidate, event, initialRun })
      candidate.setStorageRevision(committed.revision)
    } else {
      if (initialRun) await requiredSharedRuns(options).persistPrepared(initialRun)
      if (options.saveSharedWorlds) await options.saveSharedWorlds(candidate)
      candidate.setStorageRevision(service.storageRevision() + 1)
      if (event) { requiredEvents(options).publish(event.topic, event.payload, event.occurredAt); await saveEventStream(options) }
    }
    service.replaceWith(candidate)
  } catch (error) {
    if (options.sharedStore) {
      try { service.replaceWith(await options.sharedStore.loadSharedWorldService()) }
      catch { unreconciledSharedServices.add(service) }
    }
    throw error
  }
}

async function executeSharedRunCommand(options: HostedHttpServerOptions, worldId: string, runId: string, bearer: string, command: HostedRunCommand, now: string): Promise<unknown> {
  const service = requiredShared(options)
  return enqueueShared(service, async () => {
    const candidate = service.fork(); const accountId = candidate.authenticateToken(bearer, 'worlds:write'); const run = candidate.getRun(worldId, runId, accountId)
    if (candidate.member(run.worldId, accountId)?.role !== 'owner') throw new Error('Shared world authorization failed')
    const draft = candidate.draftForRun(run); candidate.recordRunControl(run, accountId, command.type, now)
    const event: SharedOutboxEventInput = { key: `run-command:${run.runId}:${command.requestId}`, topic: 'run.command', payload: { worldId: run.worldId, runId: run.runId, command: command.type }, occurredAt: now }
    if (options.sharedStore && isAuthoritativeCommand(command)) {
      try {
        const transaction = await requiredSharedRuns(options).command(run.runId, run.ownerAccountId, draft, command, { expectedRevision: service.storageRevision(), service: candidate, event })
        if (transaction.outcome === 'committed') {
          if (!transaction.sharedWorld) throw new Error('Shared world transaction result is missing')
          candidate.setStorageRevision(transaction.sharedWorld.revision); service.replaceWith(candidate)
        } else service.replaceWith(await options.sharedStore.loadSharedWorldService())
        return transaction.result
      } catch (error) {
        try { service.replaceWith(await options.sharedStore.loadSharedWorldService()) }
        catch { unreconciledSharedServices.add(service) }
        throw error
      }
    }
    const result = (await requiredSharedRuns(options).command(run.runId, run.ownerAccountId, draft, command)).result
    await commitSharedCandidate(options, service, candidate, event)
    return result
  })
}

async function enqueueShared<T>(service: SharedWorldService, operation: () => Promise<T>): Promise<T> {
  const previous = sharedQueues.get(service) ?? Promise.resolve(); let result!: T
  const queued = previous.then(async () => { if (unreconciledSharedServices.has(service)) throw new Error('Shared world authority is unreconciled; restart or restore durable state before continuing'); result = await operation() })
  sharedQueues.set(service, queued.then(() => undefined, () => undefined)); await queued; return result
}
function isAuthoritativeCommand(command: HostedRunCommand): boolean { return command.type === 'STEP' || command.type === 'RESET' || command.type === 'MATERIALIZE_COHORT' || command.type === 'DEMATERIALIZE_PEOPLE' || command.type === 'SET_PROTECTED_PEOPLE' }
function parseLastEventId(value: string | string[] | undefined): number | undefined { if (value === undefined || value === '') return undefined; if (Array.isArray(value)) throw new Error('Last-Event-ID is invalid'); const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('Last-Event-ID is invalid'); return parsed }
function writeSse(response: ServerResponse, events: readonly { id: number; topic: string; payload: unknown }[]): void { response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' }); for (const event of events) response.write(`id: ${event.id}\nevent: ${event.topic}\ndata: ${JSON.stringify(event.payload)}\n\n`) }

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization
  if (!authorization?.startsWith('Bearer ')) throw new HostedHttpError(401, 'Hosted run authorization failed')
  return authorization.slice('Bearer '.length)
}

function authorizeToken(token: string, ownerToken: string): void { if (token !== ownerToken) throw new HostedHttpError(401, 'Hosted run authorization failed') }

async function readJson(request: IncomingMessage, maximumRequestBytes: number): Promise<unknown> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > maximumRequestBytes) throw new HostedHttpError(413, `Hosted request body exceeds ${maximumRequestBytes} bytes`)
    chunks.push(buffer)
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }
  catch { throw new HostedHttpError(400, 'Hosted request body must be valid JSON') }
}

function validateHostedCommand(value: unknown): HostedRunCommand {
  if (!isRecord(value) || typeof value.type !== 'string' || typeof value.requestId !== 'string') throw new Error('Hosted command is invalid')
  switch (value.type) {
    case 'STEP':
      if (value.count !== undefined && (!isSafeInteger(value.count) || value.count < 1)) throw new Error('Hosted step count is invalid')
      return value.count === undefined ? { type: 'STEP', requestId: value.requestId } : { type: 'STEP', requestId: value.requestId, count: value.count }
    case 'PAUSE': return { type: 'PAUSE', requestId: value.requestId }
    case 'SET_SPEED':
      if (!isSafeInteger(value.ticksPerBatch)) throw new Error('Hosted speed is invalid')
      return { type: 'SET_SPEED', requestId: value.requestId, ticksPerBatch: value.ticksPerBatch }
    case 'REQUEST_SNAPSHOT': return { type: 'REQUEST_SNAPSHOT', requestId: value.requestId }
    case 'RESET': return { type: 'RESET', requestId: value.requestId }
    case 'MATERIALIZE_COHORT':
      if (typeof value.cohortId !== 'string' || !value.cohortId || !isSafeInteger(value.populationCount) || value.populationCount < 1) throw new Error('Hosted cohort materialization command is invalid')
      return { type: 'MATERIALIZE_COHORT', requestId: value.requestId, cohortId: value.cohortId, populationCount: value.populationCount }
    case 'DEMATERIALIZE_PEOPLE':
      if (!Array.isArray(value.personIds) || value.personIds.some((id) => typeof id !== 'string' || !id)) throw new Error('Hosted people dematerialization command is invalid')
      return { type: 'DEMATERIALIZE_PEOPLE', requestId: value.requestId, personIds: [...value.personIds] }
    case 'SET_PROTECTED_PEOPLE':
      if (!Array.isArray(value.personIds) || value.personIds.some((id) => typeof id !== 'string' || !id)) throw new Error('Hosted protected people command is invalid')
      return { type: 'SET_PROTECTED_PEOPLE', requestId: value.requestId, personIds: [...value.personIds] }
    case 'SET_VIEWPORT': return { type: 'SET_VIEWPORT', requestId: value.requestId, viewport: parseViewport(value.viewport) }
    default: throw new Error(`Unsupported hosted command: ${value.type}`)
  }
}

function validateJobRequest(value: unknown): HostedJobRequest {
  if (!isRecord(value) || typeof value.jobId !== 'string' || !isSafeInteger(value.totalTicks)) throw new Error('Hosted job is invalid')
  if (value.quantumTicks !== undefined && !isSafeInteger(value.quantumTicks)) throw new Error('Hosted job quantum is invalid')
  if (value.checkpointIntervalTicks !== undefined && !isSafeInteger(value.checkpointIntervalTicks)) throw new Error('Hosted job checkpoint interval is invalid')
  return {
    jobId: value.jobId,
    totalTicks: value.totalTicks,
    ...(value.quantumTicks === undefined ? {} : { quantumTicks: value.quantumTicks }),
    ...(value.checkpointIntervalTicks === undefined ? {} : { checkpointIntervalTicks: value.checkpointIntervalTicks }),
  }
}

function parseViewport(value: unknown): MapProjectionRequest {
  if (!isRecord(value) || !isSafeInteger(value.revision) || value.revision < 0 || !isRecord(value.bounds)
    || !isSafeInteger(value.bounds.minQ) || !isSafeInteger(value.bounds.maxQ) || !isSafeInteger(value.bounds.minR) || !isSafeInteger(value.bounds.maxR)
    || value.bounds.minQ > value.bounds.maxQ || value.bounds.minR > value.bounds.maxR
    || typeof value.projectedHexRadius !== 'number' || !Number.isFinite(value.projectedHexRadius) || value.projectedHexRadius < 0
    || !isProjectionOverlay(value.overlay)) throw new Error('Hosted viewport command is invalid')
  const viewport: MapProjectionRequest = {
    revision: value.revision,
    bounds: { minQ: value.bounds.minQ, maxQ: value.bounds.maxQ, minR: value.bounds.minR, maxR: value.bounds.maxR },
    projectedHexRadius: value.projectedHexRadius,
    overlay: value.overlay,
  }
  if (typeof value.communityMeasureId === 'string') viewport.communityMeasureId = value.communityMeasureId as MapProjectionRequest['communityMeasureId']
  if (typeof value.focusCellId === 'string') viewport.focusCellId = value.focusCellId
  if (typeof value.hookedPersonId === 'string') viewport.hookedPersonId = value.hookedPersonId
  return viewport
}

function isProjectionOverlay(value: unknown): value is MapProjectionRequest['overlay'] {
  return value === 'terrain' || value === 'elevation' || value === 'habitability' || value === 'movement' || value === 'food' || value === 'population' || value === 'community'
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null }
function requiredRecord(value: unknown): Record<string, unknown> { if (!isRecord(value)) throw new Error('Hosted request is invalid'); return value }
function requiredText(value: unknown): string { if (typeof value !== 'string' || !value.trim()) throw new Error('Hosted request is invalid'); return value }
function requiredInteger(value: unknown): number { if (!isSafeInteger(value) || value < 0) throw new Error('Hosted request is invalid'); return value }
function requiredWorldRole(value: unknown): 'editor' | 'viewer' { if (value !== 'editor' && value !== 'viewer') throw new Error('Hosted request is invalid'); return value }
function requiredScopes(value: unknown): readonly string[] { if (!Array.isArray(value) || value.length === 0 || value.some((scope) => scope !== 'worlds:read' && scope !== 'worlds:write')) throw new Error('Hosted request is invalid'); return [...new Set(value)].sort() as readonly string[] }
function publicToken({ tokenHash: _, ...token }: { id: string; accountId: string; tokenHash: string; scopes: readonly string[]; createdAt: string; expiresAt?: string }): Omit<typeof token, 'tokenHash'> { return token }
function isSafeInteger(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) }
function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(payload))
}
class HostedHttpError extends Error { constructor(readonly status: number, message: string) { super(message) } }
function openApiDocument(): object { return { openapi: '3.1.0', info: { title: 'World Simulation Engine API', version: 'v1' }, paths: { '/api/v1/accounts': { post: { summary: 'Create an account' } }, '/api/v1/sessions': { post: { summary: 'Create an expiring bearer session' } }, '/api/v1/tokens': { get: { summary: 'List scoped API tokens' }, post: { summary: 'Issue a scoped API token' } }, '/api/v1/tokens/{tokenId}': { delete: { summary: 'Revoke an API token' } }, '/api/v1/worlds': { post: { summary: 'Create a shared world with its immutable first draft revision' } }, '/api/v1/worlds/{worldId}': { get: { summary: 'Read an authorized shared world' } }, '/api/v1/worlds/{worldId}/members': { get: { summary: 'List world roles' }, put: { summary: 'Set an owner-authorized editor or viewer role' } }, '/api/v1/worlds/{worldId}/lease': { post: { summary: 'Acquire or renew a single-writer draft lease' } }, '/api/v1/worlds/{worldId}/revisions': { get: { summary: 'List immutable draft revisions' }, post: { summary: 'Save an idempotent lease-authorized draft revision' } }, '/api/v1/worlds/{worldId}/runs': { get: { summary: 'List authorized run history' }, post: { summary: 'Commit one immutable draft revision into a server-owned run' } }, '/api/v1/worlds/{worldId}/runs/{runId}/projection': { get: { summary: 'Read a role-authorized projection' } }, '/api/v1/worlds/{worldId}/runs/{runId}/commands': { post: { summary: 'Owner-authorized server run command' } }, '/api/v1/worlds/{worldId}/audits': { get: { summary: 'List noncanonical collaboration audit records' } }, '/api/v1/events': { get: { summary: 'Resume ordered server-sent operational events using Last-Event-ID' } } } } }
function httpFailure(error: unknown): HostedHttpError {
  if (error instanceof HostedHttpError) return error
  const message = error instanceof Error ? error.message : ''
  if (message.includes('authorization')) return new HostedHttpError(401, 'Hosted run authorization failed')
  if (message.includes('already exists') || message.includes('state conflict') || message.includes('owned by an active') || message.includes('lease') || message.includes('stale')) return new HostedHttpError(409, 'Hosted operation conflicts with current run state')
  if (message.includes('invalid') || message.includes('unsupported') || message.includes('must be')) return new HostedHttpError(400, 'Hosted request is invalid')
  return new HostedHttpError(500, 'Hosted server could not complete the request')
}
