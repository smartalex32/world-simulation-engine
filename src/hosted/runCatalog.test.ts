import { describe, expect, it } from 'vitest'
import { defaultWorldCreationRequest } from '../simulation/domain/worldCreation'
import { HostedRunCatalog } from './runCatalog'
import { MemoryHostedRunStore } from './store'

describe('hosted run catalog', () => it('keeps durable runs owner-scoped', async () => {
  const catalog = new HostedRunCatalog(new MemoryHostedRunStore())
  await catalog.open({ runId: 'one', ownerId: 'owner-a', ownerToken: 'a', creation: defaultWorldCreationRequest('one') })
  await catalog.open({ runId: 'two', ownerId: 'owner-b', ownerToken: 'b', creation: defaultWorldCreationRequest('two') })
  expect((await catalog.list('owner-a')).map((run) => run.runId)).toEqual(['one'])
}))
