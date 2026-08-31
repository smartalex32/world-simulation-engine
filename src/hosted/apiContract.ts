import { schema, type Codec, type Infer, type JsonSchema } from '../shared/schema'
import { HOSTED_RUN_COMMAND_CODEC, HOSTED_RUN_COMMAND_CODECS } from '../runtime/hostedCommandContract'
import { opaqueId } from '../shared/ids'

const id = schema.string({ minLength: 1, pattern: '^[a-zA-Z0-9_-]+$' })
const accountId = opaqueId('AccountId')
const tokenId = opaqueId('ApiTokenId')
const worldId = opaqueId('WorldId')
const runId = opaqueId('RunId')
const leaseId = opaqueId('LeaseId')
const mutationId = opaqueId('ClientMutationId')
const text = schema.string({ minLength: 1 })
const integer = schema.number({ integer: true, minimum: 0 })
const unknownObject = schema.record(schema.unknown())
const responseObject = schema.record(schema.unknown())
const timestamp = schema.string({ minLength: 1, format: 'date-time' })
const accountResponse = schema.object({ id, email: text, createdAt: timestamp })
const sessionResponse = schema.object({ token: text, expiresAt: timestamp })
const tokenResponse = schema.object({ id, accountId: id, scopes: schema.array(text), createdAt: timestamp, expiresAt: schema.optional(timestamp) })
const issuedTokenResponse = schema.object({ token: text, record: tokenResponse })
const worldResponse = schema.object({ id, name: text, ownerAccountId: id, currentRevision: integer, createdAt: timestamp, updatedAt: timestamp })
const memberResponse = schema.object({ worldId: id, accountId: id, role: schema.enum(['owner', 'editor', 'viewer']) })
const leaseResponse = schema.object({ worldId: id, leaseId: text, holderAccountId: id, revision: integer, expiresAt: timestamp })
const revisionResponse = schema.object({ worldId: id, revision: integer, parentRevision: schema.optional(integer), canonicalDigest: text, authorAccountId: id, payload: schema.unknown(), createdAt: timestamp })
const runResponse = schema.object({ worldId: id, revision: integer, runId: id, ownerAccountId: id, createdAt: timestamp })
const auditResponse = schema.object({ id, worldId: id, actorAccountId: id, action: text, revision: integer, createdAt: timestamp })

export const API_REQUEST_CODECS = {
  createAccount: schema.object({ id: accountId, email: text, password: schema.string({ minLength: 12 }) }),
  createSession: schema.object({ email: text, password: text }),
  issueToken: schema.object({ id: tokenId, scopes: schema.array(schema.enum(['worlds:read', 'worlds:write']), { minItems: 1 }) }),
  createWorld: schema.object({ id: worldId, name: text, draft: schema.optional(unknownObject) }),
  setMember: schema.object({ accountId, role: schema.enum(['editor', 'viewer']) }),
  acquireLease: schema.object({ leaseId: schema.optional(leaseId), expectedRevision: schema.optional(integer) }),
  saveRevision: schema.object({ leaseId, expectedRevision: integer, clientMutationId: mutationId, payload: schema.unknown() }),
  commitRun: schema.object({ revision: integer, runId }),
  runCommand: HOSTED_RUN_COMMAND_CODEC,
} as const

export type ApiRequest<K extends keyof typeof API_REQUEST_CODECS> = Infer<(typeof API_REQUEST_CODECS)[K]>

export interface ApiRouteContract {
  readonly operationId: string
  readonly method: 'get' | 'post' | 'put' | 'delete'
  readonly path: string
  readonly summary: string
  readonly request?: Codec<unknown>
  readonly response: Codec<unknown>
  readonly status: number
}

function route<const T extends ApiRouteContract>(value: T): T { return Object.freeze(value) }

export const PUBLIC_API_ROUTES = [
  route({ operationId: 'openApi', method: 'get', path: '/api/v1/openapi.json', summary: 'Read the generated API contract', response: responseObject, status: 200 }),
  route({ operationId: 'events', method: 'get', path: '/api/v1/events', summary: 'Resume ordered server-sent operational events using Last-Event-ID', response: schema.string(), status: 200 }),
  route({ operationId: 'createAccount', method: 'post', path: '/api/v1/accounts', summary: 'Create an account', request: API_REQUEST_CODECS.createAccount, response: accountResponse, status: 201 }),
  route({ operationId: 'createSession', method: 'post', path: '/api/v1/sessions', summary: 'Create an expiring bearer session', request: API_REQUEST_CODECS.createSession, response: sessionResponse, status: 201 }),
  route({ operationId: 'listTokens', method: 'get', path: '/api/v1/tokens', summary: 'List scoped API tokens', response: schema.array(tokenResponse), status: 200 }),
  route({ operationId: 'issueToken', method: 'post', path: '/api/v1/tokens', summary: 'Issue a scoped API token', request: API_REQUEST_CODECS.issueToken, response: issuedTokenResponse, status: 201 }),
  route({ operationId: 'revokeToken', method: 'delete', path: '/api/v1/tokens/{tokenId}', summary: 'Revoke an API token', response: schema.unknown(), status: 204 }),
  route({ operationId: 'createWorld', method: 'post', path: '/api/v1/worlds', summary: 'Create a shared world with its immutable first draft revision', request: API_REQUEST_CODECS.createWorld, response: worldResponse, status: 201 }),
  route({ operationId: 'getWorld', method: 'get', path: '/api/v1/worlds/{worldId}', summary: 'Read an authorized shared world', response: worldResponse, status: 200 }),
  route({ operationId: 'listMembers', method: 'get', path: '/api/v1/worlds/{worldId}/members', summary: 'List world roles', response: schema.array(memberResponse), status: 200 }),
  route({ operationId: 'setMember', method: 'put', path: '/api/v1/worlds/{worldId}/members', summary: 'Set an owner-authorized editor or viewer role', request: API_REQUEST_CODECS.setMember, response: memberResponse, status: 200 }),
  route({ operationId: 'acquireLease', method: 'post', path: '/api/v1/worlds/{worldId}/lease', summary: 'Acquire or renew a single-writer draft lease', request: API_REQUEST_CODECS.acquireLease, response: leaseResponse, status: 200 }),
  route({ operationId: 'listRevisions', method: 'get', path: '/api/v1/worlds/{worldId}/revisions', summary: 'List immutable draft revisions', response: schema.array(revisionResponse), status: 200 }),
  route({ operationId: 'saveRevision', method: 'post', path: '/api/v1/worlds/{worldId}/revisions', summary: 'Save an idempotent lease-authorized draft revision', request: API_REQUEST_CODECS.saveRevision, response: revisionResponse, status: 201 }),
  route({ operationId: 'listRuns', method: 'get', path: '/api/v1/worlds/{worldId}/runs', summary: 'List authorized run history', response: schema.array(runResponse), status: 200 }),
  route({ operationId: 'commitRun', method: 'post', path: '/api/v1/worlds/{worldId}/runs', summary: 'Commit one immutable draft revision into a server-owned run', request: API_REQUEST_CODECS.commitRun, response: runResponse, status: 201 }),
  route({ operationId: 'getRunProjection', method: 'get', path: '/api/v1/worlds/{worldId}/runs/{runId}/projection', summary: 'Read a role-authorized projection', response: responseObject, status: 200 }),
  route({ operationId: 'runCommand', method: 'post', path: '/api/v1/worlds/{worldId}/runs/{runId}/commands', summary: 'Owner-authorized server run command', request: API_REQUEST_CODECS.runCommand, response: responseObject, status: 200 }),
  route({ operationId: 'listAudits', method: 'get', path: '/api/v1/worlds/{worldId}/audits', summary: 'List noncanonical collaboration audit records', response: schema.array(auditResponse), status: 200 }),
] as const satisfies readonly ApiRouteContract[]

export function decodeApiRequest<K extends keyof typeof API_REQUEST_CODECS>(kind: K, value: unknown): ApiRequest<K> {
  return API_REQUEST_CODECS[kind].decode(value, `request.${kind}`) as ApiRequest<K>
}

export function openApiDocument(): object {
  const paths: Record<string, Record<string, unknown>> = {}
  for (const contract of PUBLIC_API_ROUTES) {
    const request = 'request' in contract ? contract.request : undefined
    const operation: Record<string, unknown> = {
      operationId: contract.operationId,
      summary: contract.summary,
      parameters: pathParameters(contract.path),
      responses: { [contract.status]: { description: 'Contract response', content: contract.status === 204 ? undefined : { [contract.operationId === 'events' ? 'text/event-stream' : 'application/json']: { schema: contract.response.schema } } } },
    }
    if (request) operation.requestBody = { required: true, content: { 'application/json': { schema: request.schema } } }
    ;(paths[contract.path] ??= {})[contract.method] = operation
  }
  return {
    openapi: '3.1.0', info: { title: 'World Simulation Engine API', version: 'v1' }, paths,
    components: { schemas: { ...Object.fromEntries(Object.entries(API_REQUEST_CODECS).map(([name, value]) => [name, value.schema])), ...Object.fromEntries(Object.entries(HOSTED_RUN_COMMAND_CODECS).map(([name, value]) => [`command_${name}`, value.schema])) } },
  }
}

function pathParameters(path: string): object[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({ name: match[1], in: 'path', required: true, schema: id.schema }))
}

export function operationSchemas(document: ReturnType<typeof openApiDocument>): JsonSchema[] {
  const paths = (document as { paths: Record<string, Record<string, { requestBody?: { content: { 'application/json': { schema: JsonSchema } } }; responses: Record<string, { content?: Record<string, { schema: JsonSchema }> }> }>> }).paths
  return Object.values(paths).flatMap((methods) => Object.values(methods).flatMap((operation) => [operation.requestBody?.content['application/json'].schema, ...Object.values(operation.responses).flatMap((response) => Object.values(response.content ?? {}).map(({ schema }) => schema))].filter((value): value is JsonSchema => value !== undefined)))
}
