import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import type { MapProjectionRequest } from '../projection'
import { defaultWorldCreationRequest } from '../simulation/domain/worldCreation'
import type { HostedRunCommand } from './types'
import { FileHostedRunStore } from './store'
import { HostedRunService } from './runService'

const port = numberEnvironment('PORT', 8787)
const runId = process.env.HOSTED_RUN_ID ?? 'hosted-run'
const ownerId = process.env.HOSTED_OWNER_ID ?? 'local-owner'
const ownerToken = requiredEnvironment('HOSTED_OWNER_TOKEN')
const dataDirectory = resolve(process.env.HOSTED_DATA_DIRECTORY ?? '.world-simulation-hosted')

const service = await HostedRunService.open({
  runId,
  ownerId,
  ownerToken,
  creation: defaultWorldCreationRequest(process.env.HOSTED_WORLD_SEED ?? 'hosted-valley'),
}, new FileHostedRunStore(dataDirectory))

createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname
    if (request.method === 'GET' && pathname === '/health') return sendJson(response, 200, { status: 'ok', runId })
    const token = bearerToken(request)
    if (request.method === 'GET' && pathname === `/runs/${runId}/projection`) return sendJson(response, 200, await service.view(token))
    if (request.method === 'POST' && pathname === `/runs/${runId}/commands`) return sendJson(response, 200, await service.execute(token, validateHostedCommand(await readJson(request))))
    return sendJson(response, 404, { error: 'Not found' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message.includes('authorization') ? 401 : message.includes('JSON') || message.includes('command') ? 400 : 500
    return sendJson(response, status, { error: message })
  }
}).listen(port, '127.0.0.1', () => {
  console.info(`Hosted single-node simulation listening on http://127.0.0.1:${port} for run ${runId}`)
})

function bearerToken(request: IncomingMessage): string {
  const authorization = request.headers.authorization
  if (!authorization?.startsWith('Bearer ')) throw new Error('Hosted run authorization failed')
  return authorization.slice('Bearer '.length)
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
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
    case 'SET_VIEWPORT':
      return { type: 'SET_VIEWPORT', requestId: value.requestId, viewport: parseViewport(value.viewport) }
    default: throw new Error(`Unsupported hosted command: ${value.type}`)
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value)
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} must be set before starting the hosted simulation server`)
  return value
}

function numberEnvironment(name: string, fallback: number): number {
  const value = process.env[name]
  if (value === undefined) return fallback
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < 1 || number > 65535) throw new Error(`${name} must be a valid port`)
  return number
}

function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(payload))
}
