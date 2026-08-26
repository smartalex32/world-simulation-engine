import { defaultWorldCreationRequest, WORLD_CREATION_LIMITS } from '../simulation/domain/worldCreation'
import { createHostedHttpServer } from './http'
import { HostedSimulationJobManager } from './jobs'
import { HostedRunService } from './runService'
import { PostgresHostedRunStore } from './postgres'

const port = numberEnvironment('PORT', 8787)
const bindHost = hostEnvironment('HOSTED_BIND_HOST', '127.0.0.1')
const runId = process.env.HOSTED_RUN_ID ?? 'hosted-run'
const ownerId = process.env.HOSTED_OWNER_ID ?? 'local-owner'
const ownerToken = requiredEnvironment('HOSTED_OWNER_TOKEN')
const databaseUrl = requiredEnvironment('DATABASE_URL')
const hostedPopulation = boundedIntegerEnvironment('HOSTED_WORLD_POPULATION', 200, WORLD_CREATION_LIMITS.minimumPopulation, WORLD_CREATION_LIMITS.maximumPopulation)

const store = await PostgresHostedRunStore.connect(databaseUrl)
await store.assertReady()
const bootstrap = {
  runId,
  ownerId,
  ownerToken,
  creation: { ...defaultWorldCreationRequest(process.env.HOSTED_WORLD_SEED ?? 'hosted-valley'), initialPopulationCount: hostedPopulation },
}
const service = await HostedRunService.open(bootstrap, store)
const jobs = new HostedSimulationJobManager(service, store, ownerId, ownerToken)
await jobs.resumePending()

createHostedHttpServer({ runId, ownerToken, service, jobs }).listen(port, bindHost, () => {
  console.info(`Hosted single-node simulation listening on http://${bindHost}:${port} for run ${runId}`)
})

process.once('SIGINT', () => { void store.close().finally(() => process.exit(0)) })
process.once('SIGTERM', () => { void store.close().finally(() => process.exit(0)) })

function requiredEnvironment(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} must be set before starting the hosted simulation server`)
  return value
}

function hostEnvironment(name: string, fallback: string): string {
  const value = process.env[name] ?? fallback
  if (!/^[a-zA-Z0-9.:-]+$/.test(value)) throw new Error(`${name} contains unsupported characters`)
  return value
}

function numberEnvironment(name: string, fallback: number): number {
  return boundedIntegerEnvironment(name, fallback, 1, 65_535, 'a valid port')
}

function boundedIntegerEnvironment(name: string, fallback: number, minimum: number, maximum: number, label = `an integer from ${minimum} through ${maximum}`): number {
  const value = process.env[name]
  if (value === undefined) return fallback
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new Error(`${name} must be ${label}`)
  return number
}
