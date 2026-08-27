const [method, path, body] = process.argv.slice(2)
const baseUrl = process.env.SHARED_WORLD_API_URL
const token = process.env.SHARED_WORLD_TOKEN

if (!baseUrl || !method || !path || (method !== 'GET' && method !== 'POST' && method !== 'PUT' && method !== 'DELETE')) {
  throw new Error('Usage: SHARED_WORLD_API_URL=<base> [SHARED_WORLD_TOKEN=<bearer>] pnpm shared-world <GET|POST|PUT|DELETE> </api/v1/path> [json-body]')
}
if (!path.startsWith('/api/v1/') && path !== '/health') throw new Error('Shared-world CLI path must target /api/v1 or /health')
let payload: string | undefined
if (body !== undefined) { JSON.parse(body); payload = body }
const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(payload === undefined ? {} : { 'content-type': 'application/json' }) }, body: payload })
const text = await response.text()
if (text) console.info(text)
if (!response.ok) process.exitCode = 1
