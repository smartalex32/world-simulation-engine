import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { HostedRunCommand } from './types'
import { HostedSimulationJobManager } from './jobs'
import { HostedRunService } from './runService'
import { importContentPack, type ContentPackCatalog } from '../contentPacks'
import { HostedEventStream } from './eventStream'
import { SharedWorldService, type SharedOutboxEventInput, type SharedWorldMutationStore } from './sharedWorlds'
import { SharedRunCoordinator } from './sharedRuns'
import type { HostedRunRecord } from './types'
import { canonicalStringify } from '../shared/canonicalJson'
import { decodeApiRequest, openApiDocument } from './apiContract'
import { decodeHostedRunCommand } from '../runtime/hostedCommandContract'
import { decodeHostedJobRequest } from './jobContract'

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
      if (await handleMetadataRoutes(request, response, pathname, options)) return
      if (await handleIdentityRoutes(request, response, pathname, options, maximumRequestBytes)) return
      if (await handleWorldRoutes(request, response, pathname, options, maximumRequestBytes)) return
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
        const command = decodeHostedRunCommand(await readJson(request, maximumRequestBytes))
        authorizeToken(token, options.ownerToken)
        return sendJson(response, 200, await options.jobs.executeDirect(command))
      }
      if (request.method === 'GET' && pathname === `/runs/${options.runId}/jobs`) { authorizeToken(token, options.ownerToken); return sendJson(response, 200, await options.jobs.list()) }
      if (request.method === 'POST' && pathname === `/runs/${options.runId}/jobs`) { authorizeToken(token, options.ownerToken); return sendJson(response, 202, await options.jobs.start(decodeHostedJobRequest(await readJson(request, maximumRequestBytes)))) }
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

async function handleMetadataRoutes(request: IncomingMessage, response: ServerResponse, pathname: string, options: HostedHttpServerOptions): Promise<boolean> {
  if (request.method === 'GET' && pathname === '/api/v1/openapi.json') return respondJson(response, 200, openApiDocument())
  if (request.method !== 'GET' || pathname !== '/api/v1/events') return false
  requiredShared(options).authenticateToken(bearerToken(request), 'worlds:read')
  const lastEventId = parseLastEventId(request.headers['last-event-id'])
  if (options.sharedStore) writeSse(response, await options.sharedStore.outboxAfter(lastEventId ?? 0)); else requiredEvents(options).writeSse(response, lastEventId)
  return true
}

async function handleIdentityRoutes(request: IncomingMessage, response: ServerResponse, pathname: string, options: HostedHttpServerOptions, maximumRequestBytes: number): Promise<boolean> {
  if (request.method === 'POST' && pathname === '/api/v1/accounts') { const body = decodeApiRequest('createAccount', await readJson(request, maximumRequestBytes)); const account = await mutateShared(options, async (service) => ({ value: await service.createAccount(body.id, body.email, body.password, new Date().toISOString()) })); return respondJson(response, 201, { id: account.id, email: account.email, createdAt: account.createdAt }) }
  if (request.method === 'POST' && pathname === '/api/v1/sessions') { const body = decodeApiRequest('createSession', await readJson(request, maximumRequestBytes)); const session = await mutateShared(options, async (service) => ({ value: await service.createSession(body.email, body.password, new Date().toISOString()) })); return respondJson(response, 201, { token: session.token, expiresAt: session.session.expiresAt }) }
  if (request.method === 'POST' && pathname === '/api/v1/tokens') { const body = decodeApiRequest('issueToken', await readJson(request, maximumRequestBytes)); const bearer = bearerToken(request); const issued = await mutateShared(options, (service) => { const accountId = service.authenticateToken(bearer, 'worlds:write'); return { value: service.issueToken(body.id, accountId, [...new Set(body.scopes)].sort(), new Date().toISOString()) } }); return respondJson(response, 201, { token: issued.token, record: publicToken(issued.record) }) }
  if (request.method === 'GET' && pathname === '/api/v1/tokens') { const service = requiredShared(options); return respondJson(response, 200, service.listTokens(service.authenticateToken(bearerToken(request), 'worlds:read'))) }
  const tokenMatch = /^\/api\/v1\/tokens\/([a-zA-Z0-9_-]+)$/.exec(pathname)
  if (request.method === 'DELETE' && tokenMatch) { const bearer = bearerToken(request); await mutateShared(options, (service) => { service.revokeToken(tokenMatch[1]!, service.authenticateToken(bearer, 'worlds:write')); return { value: undefined } }); return respondJson(response, 204, undefined) }
  return false
}

async function handleWorldRoutes(request: IncomingMessage, response: ServerResponse, pathname: string, options: HostedHttpServerOptions, maximumRequestBytes: number): Promise<boolean> {
  if (request.method === 'POST' && pathname === '/api/v1/worlds') { const body = decodeApiRequest('createWorld', await readJson(request, maximumRequestBytes)); const bearer = bearerToken(request); const now = new Date().toISOString(); const world = await mutateShared(options, (service) => { const accountId = service.authenticateToken(bearer, 'worlds:write'); const created = service.createWorld(body.id, body.name, accountId, body.draft ?? {}, now); return { value: created, event: { key: `world:${body.id}:created`, topic: 'world', payload: { id: created.id, revision: created.currentRevision }, occurredAt: created.updatedAt } } }); return respondJson(response, 201, world) }
  const worldMatch = /^\/api\/v1\/worlds\/([a-zA-Z0-9_-]+)$/.exec(pathname)
  if (request.method === 'GET' && worldMatch) { const service = requiredShared(options); return respondJson(response, 200, service.getWorld(worldMatch[1]!, service.authenticateToken(bearerToken(request), 'worlds:read'))) }
  const membersMatch = /^\/api\/v1\/worlds\/([a-zA-Z0-9_-]+)\/members$/.exec(pathname)
  if (request.method === 'GET' && membersMatch) { const service = requiredShared(options); return respondJson(response, 200, service.listMembers(membersMatch[1]!, service.authenticateToken(bearerToken(request), 'worlds:read'))) }
  if (request.method === 'PUT' && membersMatch) { const body = decodeApiRequest('setMember', await readJson(request, maximumRequestBytes)); const bearer = bearerToken(request); const now = new Date().toISOString(); return respondJson(response, 200, await mutateShared(options, (service) => ({ value: service.addMember(membersMatch[1]!, service.authenticateToken(bearer, 'worlds:write'), body.accountId, body.role, now) }))) }
  const leaseMatch = /^\/api\/v1\/worlds\/([a-zA-Z0-9_-]+)\/lease$/.exec(pathname)
  if (request.method === 'POST' && leaseMatch) { const body = decodeApiRequest('acquireLease', await readJson(request, maximumRequestBytes)); const bearer = bearerToken(request); const now = new Date().toISOString(); return respondJson(response, 200, await mutateShared(options, (service) => { const accountId = service.authenticateToken(bearer, 'worlds:write'); return { value: body.leaseId ? service.renewLease(leaseMatch[1]!, accountId, body.leaseId, body.expectedRevision ?? failExpectedRevision(), now) : service.acquireLease(leaseMatch[1]!, accountId, now) } })) }
  const revisionsMatch = /^\/api\/v1\/worlds\/([a-zA-Z0-9_-]+)\/revisions$/.exec(pathname)
  if (request.method === 'GET' && revisionsMatch) { const service = requiredShared(options); return respondJson(response, 200, service.listRevisions(revisionsMatch[1]!, service.authenticateToken(bearerToken(request), 'worlds:read'))) }
  if (request.method === 'POST' && revisionsMatch) { const body = decodeApiRequest('saveRevision', await readJson(request, maximumRequestBytes)); const bearer = bearerToken(request); const now = new Date().toISOString(); const saved = await mutateShared(options, (service) => { const accountId = service.authenticateToken(bearer, 'worlds:write'); const revision = service.saveRevision(revisionsMatch[1]!, accountId, body.leaseId, body.expectedRevision, body.clientMutationId, body.payload, now); return { value: revision, event: { key: `revision:${revision.worldId}:${accountId}:${body.clientMutationId}`, topic: 'draft.revised', payload: { worldId: revision.worldId, revision: revision.revision }, occurredAt: revision.createdAt } } }); return respondJson(response, 201, saved) }
  const auditsMatch = /^\/api\/v1\/worlds\/([a-zA-Z0-9_-]+)\/audits$/.exec(pathname)
  if (request.method === 'GET' && auditsMatch) { const service = requiredShared(options); return respondJson(response, 200, service.listAudits(auditsMatch[1]!, service.authenticateToken(bearerToken(request), 'worlds:read'))) }
  const runsMatch = /^\/api\/v1\/worlds\/([a-zA-Z0-9_-]+)\/runs$/.exec(pathname)
  if (request.method === 'GET' && runsMatch) { const service = requiredShared(options); return respondJson(response, 200, service.listRuns(runsMatch[1]!, service.authenticateToken(bearerToken(request), 'worlds:read'))) }
  if (request.method === 'POST' && runsMatch) { const body = decodeApiRequest('commitRun', await readJson(request, maximumRequestBytes)); const bearer = bearerToken(request); const now = new Date().toISOString(); const coordinator = requiredSharedRuns(options); const run = await mutateShared(options, async (service) => { const accountId = service.authenticateToken(bearer, 'worlds:write'); const committed = service.commitRun(runsMatch[1]!, accountId, body.revision, body.runId, now); const initialRun = await coordinator.prepare(committed.run.runId, committed.run.ownerAccountId, committed.draft, now); return { value: committed.run, initialRun, event: { key: `run:${body.runId}:committed`, topic: 'run.committed', payload: committed.run, occurredAt: committed.run.createdAt } } }); return respondJson(response, 201, run) }
  const sharedRunMatch = /^\/api\/v1\/worlds\/([a-zA-Z0-9_-]+)\/runs\/([a-zA-Z0-9_-]+)\/(projection|commands)$/.exec(pathname)
  if (!sharedRunMatch) return false
  const bearer = bearerToken(request)
  if (request.method === 'GET' && sharedRunMatch[3] === 'projection') { const service = requiredShared(options); const run = service.getRun(sharedRunMatch[1]!, sharedRunMatch[2]!, service.authenticateToken(bearer, 'worlds:read')); return respondJson(response, 200, await requiredSharedRuns(options).projection(run.runId, run.ownerAccountId, service.draftForRun(run))) }
  if (request.method === 'POST' && sharedRunMatch[3] === 'commands') { const command = decodeApiRequest('runCommand', await readJson(request, maximumRequestBytes)); return respondJson(response, 200, await executeSharedRunCommand(options, sharedRunMatch[1]!, sharedRunMatch[2]!, bearer, command, new Date().toISOString())) }
  return false
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
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
  catch { throw new HostedHttpError(400, 'Hosted request body must be valid JSON') }
}

function publicToken({ tokenHash: _, ...token }: { id: string; accountId: string; tokenHash: string; scopes: readonly string[]; createdAt: string; expiresAt?: string }): Omit<typeof token, 'tokenHash'> { return token }
function failExpectedRevision(): never { throw new Error('Hosted lease expected revision is invalid') }
function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(payload))
}
function respondJson(response: ServerResponse, status: number, payload: unknown): true { sendJson(response, status, payload); return true }
class HostedHttpError extends Error { constructor(readonly status: number, message: string) { super(message) } }
function httpFailure(error: unknown): HostedHttpError {
  if (error instanceof HostedHttpError) return error
  const message = error instanceof Error ? error.message : ''
  if (message.includes('authorization')) return new HostedHttpError(401, 'Hosted run authorization failed')
  if (message.includes('already exists') || message.includes('state conflict') || message.includes('owned by an active') || message.includes('lease') || message.includes('stale')) return new HostedHttpError(409, 'Hosted operation conflicts with current run state')
  if (message.includes('invalid') || message.includes('unsupported') || message.includes('must be')) return new HostedHttpError(400, 'Hosted request is invalid')
  return new HostedHttpError(500, 'Hosted server could not complete the request')
}
