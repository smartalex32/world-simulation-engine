import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { MapProjectionRequest } from '../projection'
import type { HostedRunCommand } from './types'
import { HostedSimulationJobManager, type HostedJobRequest } from './jobs'
import { HostedRunService } from './runService'
import { importContentPack, type ContentPackCatalog } from '../contentPacks'
import { HostedEventStream } from './eventStream'
import { SharedWorldService } from './sharedWorlds'

export interface HostedHttpServerOptions {
  runId: string
  ownerToken: string
  service: HostedRunService
  jobs: HostedSimulationJobManager
  maximumRequestBytes?: number
  contentPacks?: ContentPackCatalog
  sharedWorlds?: SharedWorldService
  eventStream?: HostedEventStream
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
        const last = request.headers['last-event-id']; const lastEventId = typeof last === 'string' && last.length ? Number(last) : undefined
        return requiredEvents(options).writeSse(response, lastEventId)
      }
      if (request.method === 'POST' && pathname === '/api/v1/accounts') {
        const body = requiredRecord(await readJson(request, maximumRequestBytes)); const account = await requiredShared(options).createAccount(requiredText(body.id), requiredText(body.email), requiredText(body.password), new Date().toISOString())
        return sendJson(response, 201, { id: account.id, email: account.email, createdAt: account.createdAt })
      }
      if (request.method === 'POST' && pathname === '/api/v1/worlds') {
        const body = requiredRecord(await readJson(request, maximumRequestBytes)); const service = requiredShared(options); const accountId = service.authenticateToken(bearerToken(request), 'worlds:write'); const world = service.createWorld(requiredText(body.id), requiredText(body.name), accountId, body.draft ?? {}, new Date().toISOString()); requiredEvents(options).publish('world', { id: world.id, revision: world.currentRevision }, world.updatedAt); return sendJson(response, 201, world)
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
function isSafeInteger(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) }
function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(payload))
}
class HostedHttpError extends Error { constructor(readonly status: number, message: string) { super(message) } }
function openApiDocument(): object { return { openapi: '3.1.0', info: { title: 'World Simulation Engine API', version: 'v1' }, paths: { '/api/v1/accounts': { post: { summary: 'Create a local account' } }, '/api/v1/worlds': { post: { summary: 'Create a shared world with an immutable first draft revision' } }, '/api/v1/events': { get: { summary: 'Resume ordered server-sent operational events using Last-Event-ID' } } } } }
function httpFailure(error: unknown): HostedHttpError {
  if (error instanceof HostedHttpError) return error
  const message = error instanceof Error ? error.message : ''
  if (message.includes('authorization')) return new HostedHttpError(401, 'Hosted run authorization failed')
  if (message.includes('already exists') || message.includes('run state conflict') || message.includes('owned by an active')) return new HostedHttpError(409, 'Hosted operation conflicts with current run state')
  if (message.includes('invalid') || message.includes('unsupported') || message.includes('must be')) return new HostedHttpError(400, 'Hosted request is invalid')
  return new HostedHttpError(500, 'Hosted server could not complete the request')
}
