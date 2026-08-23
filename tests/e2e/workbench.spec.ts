import { expect, test } from '@playwright/test'
import { createCommonsActivity, createHouseholdHomeActivity } from '../../src/simulation/activities/model'
import { scheduleForAge } from '../../src/simulation/activities/config'
import { createCommunityState, createDailyCommunityCounters, createTwoCatchmentGeography } from '../../src/simulation/community'
import type { PersonState } from '../../src/simulation/domain/types'
import { SimulationEngine } from '../../src/simulation/engine/engine'
import { createParentCuriosityExposureAccumulator } from '../../src/simulation/exposure/model'
import { createSnapshot } from '../../src/simulation/serialization/snapshot'
import { axialToPixel } from '../../src/simulation/spatial/hex'
import { PERSON_VARIABLE_ID } from '../../src/simulation/variables/registry'
import { setPersonVariable } from '../../src/simulation/variables/storage'

test.describe.configure({ timeout: 60_000 })

async function advanceOneHour(page: import('@playwright/test').Page, tick: number): Promise<void> {
  await page.getByTitle('Advance one hour').click()
  await expect(page.locator('[data-simulation-tick]')).toHaveAttribute('data-simulation-tick', String(tick))
}

async function waitForMapSettled(canvas: import('@playwright/test').Locator): Promise<void> {
  await expect.poll(async () => {
    const requested = await canvas.getAttribute('data-map-request-revision')
    const rendered = await canvas.getAttribute('data-map-revision')
    return requested !== null && requested === rendered
  }).toBe(true)
}

test('opens the world setup surface with explicit scale and placement allocations', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.world-overview strong')).toHaveText('Seeded Valley')
  await page.getByRole('button', { name: 'Create world', exact: true }).click()
  const setup = page.getByRole('dialog', { name: 'Shape a new world' })
  await expect(setup).toBeVisible()
  await expect(setup.getByText('1 km hex radius · max 128 × 128')).toBeVisible()
  await setup.getByLabel('World name').fill('Ardentia')
  await setup.getByLabel('Map scale').selectOption('64x48')
  await setup.getByLabel('Starting population').fill('240')
  await setup.getByLabel('Zone 1 region').selectOption('center')
  await setup.getByLabel('Zone 1 people').fill('120')
  await setup.getByLabel('Zone 2 people').fill('120')
  await expect(setup.locator('.allocation')).toContainText('240 / 240')
  await expect(setup.locator('.draft-preview')).toContainText('Draft preview')
  await expect(setup.getByRole('button', { name: 'Commit & create world', exact: true })).toBeEnabled()
  await expect(page.getByText('Communities are geographic exposure measures, not memberships.')).toBeVisible()
  await setup.getByRole('button', { name: 'Commit & create world', exact: true }).click()
  await expect(setup).toBeHidden()
  await expect(page.locator('.world-overview strong')).toHaveText('Ardentia')
  await expect(page.getByText('64 × 48 hexes · 1 km radius')).toBeVisible()
  await expect(page.getByRole('button', { name: /Settlements/ })).toContainText('2')
  await expect(page.locator('.settlement-list')).toContainText('Westhaven')
  await expect(page.locator('.settlement-list')).toContainText('Eastwatch')
  await page.getByRole('button', { name: 'analytics', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Daily samples' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Entity categories' })).toBeHidden()
  await page.getByRole('button', { name: 'entities', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Entity categories' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Daily samples' })).toBeHidden()
  await page.getByRole('button', { name: 'world', exact: true }).click()
  await expect(page.locator('.world-overview strong')).toHaveText('Ardentia')
})

test('shows a bounded generated map only for a non-settlement draft zone', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create world', exact: true }).click()
  const setup = page.getByRole('dialog', { name: 'Shape a new world' })
  await setup.getByLabel('Zone 1 has settlement').uncheck()
  await expect(setup.getByLabel('Zone to draw')).toHaveValue('population-zone-1')
  const map = setup.getByLabel('Draft placement zone map')
  await expect(map).toBeVisible()
  await expect.poll(async () => map.getAttribute('data-draft-map-revision')).toMatch(/^\d+$/)
  await expect(map).toHaveAttribute('data-draft-zone-id', 'population-zone-1')
  await expect(setup.getByText('Terrain and settlement anchors are read-only.')).toBeVisible()
  const selection = setup.locator('.draft-zone-map-heading small')
  const before = await selection.textContent()
  const passableCenter = await map.getAttribute('data-draft-map-first-passable-center')
  expect(passableCenter).not.toBeNull()
  const [x, y] = passableCenter!.split(',').map(Number)
  const passablePixel = { x: x!, y: y! }
  await map.click({ position: passablePixel })
  await expect.poll(() => selection.textContent()).not.toBe(before)
})

test('persists an accepted drawn zone through reload and commits its authoritative cells', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create world', exact: true }).click()
  let setup = page.getByRole('dialog', { name: 'Shape a new world' })
  // The dialog becomes visible before its worker-owned draft is fully
  // accepted and persisted. Wait for the explicit acknowledgement boundary
  // before changing a controlled form field.
  await expect(setup.getByRole('button', { name: 'Commit & create world', exact: true })).toBeEnabled()
  await setup.getByLabel('Zone 1 has settlement').uncheck()
  let map = setup.getByLabel('Draft placement zone map')
  await expect.poll(async () => map.getAttribute('data-draft-map-revision')).toMatch(/^\d+$/)
  await expect(setup.locator('.setup-fields')).toBeEnabled()
  await expect.poll(async () => map.getAttribute('data-draft-map-first-passable-center')).not.toBeNull()
  const [x, y] = (await map.getAttribute('data-draft-map-first-passable-center'))!.split(',').map(Number)
  const passablePixel = { x: x!, y: y! }
  await map.click({ position: passablePixel })
  await setup.getByRole('button', { name: 'Apply drawn cells', exact: true }).click()
  await expect(setup.locator('.placement-card').first().locator('.placement-meta')).toContainText(/Resolved cells: \d+/)
  await expect.poll(async () => map.getAttribute('data-draft-map-revision')).toMatch(/^\d+$/)

  await page.reload()
  await page.getByRole('button', { name: 'Create world', exact: true }).click()
  setup = page.getByRole('dialog', { name: 'Shape a new world' })
  await expect(setup.locator('.placement-card').first().locator('.placement-meta')).toContainText(/Resolved cells: \d+/)
  map = setup.getByLabel('Draft placement zone map')
  await expect.poll(async () => map.getAttribute('data-draft-map-revision')).not.toBeNull()
  await expect(setup.locator('.draft-zone-map-heading small')).toContainText('36 selected')
  await setup.getByRole('button', { name: 'Commit & create world', exact: true }).click()
  await expect(setup).toBeHidden()
  await expect(page.locator('.world-overview strong')).toHaveText('The Seeded Valley')
})

test('authors arbitrary stable placement zones before a draft commit', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create world', exact: true }).click()
  const setup = page.getByRole('dialog', { name: 'Shape a new world' })
  await expect(setup.locator('.draft-preview')).toContainText('Draft preview')
  await setup.getByRole('button', { name: 'Add placement zone', exact: true }).click()
  await expect(setup.getByRole('region', { name: 'Placement zone 3' })).toBeVisible()
  await setup.getByLabel('Zone 1 people').fill('80')
  await setup.getByLabel('Zone 2 people').fill('80')
  await setup.getByLabel('Zone 3 name').fill('Central arrivals')
  await setup.getByLabel('Zone 3 region').selectOption('center')
  await setup.getByLabel('Zone 3 radius').fill('2')
  await setup.getByLabel('Zone 3 people').fill('40')
  await expect(setup.locator('.allocation')).toContainText('200 / 200')
  await expect(setup.getByRole('button', { name: 'Commit & create world', exact: true })).toBeEnabled()
  await page.reload()
  await page.getByRole('button', { name: 'Create world', exact: true }).click()
  const restored = page.getByRole('dialog', { name: 'Shape a new world' })
  await expect(restored.getByLabel('Zone 3 name')).toHaveValue('Central arrivals')
  await expect(restored.getByLabel('Zone 3 radius')).toHaveValue('2')
  await expect(restored.getByText('population-zone-draft-1', { exact: true })).toBeVisible()
  await restored.getByRole('button', { name: 'Remove zone 3', exact: true }).click()
  await expect(restored.getByRole('button', { name: 'Commit & create world', exact: true })).toBeDisabled()
  await restored.getByRole('button', { name: 'Discard draft', exact: true }).click()
})

test('commits a three-zone population draft', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create world', exact: true }).click()
  const setup = page.getByRole('dialog', { name: 'Shape a new world' })
  await expect(setup.locator('.draft-preview')).toContainText('Draft preview')
  await setup.getByRole('button', { name: 'Add placement zone', exact: true }).click()
  await setup.getByLabel('Zone 1 people').fill('80')
  await setup.getByLabel('Zone 2 people').fill('80')
  await setup.getByLabel('Zone 3 name').fill('Central arrivals')
  await setup.getByLabel('Zone 3 region').selectOption('center')
  await setup.getByLabel('Zone 3 people').fill('40')
  await expect(setup.getByRole('button', { name: 'Commit & create world', exact: true })).toBeEnabled()
  await setup.getByRole('button', { name: 'Commit & create world', exact: true }).click()
  await expect(page.locator('.world-overview strong')).toHaveText('The Seeded Valley')
  await expect(page.locator('.settlement-list')).toContainText('Settlement 3')
})

test('discards an editable world draft without changing the active simulation', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.world-overview strong')).toHaveText('Seeded Valley')
  const activeSeed = await page.locator('.active-world-seed').textContent()
  await page.getByRole('button', { name: 'Create world', exact: true }).click()
  const setup = page.getByRole('dialog', { name: 'Shape a new world' })
  await expect(setup.locator('.draft-preview')).toContainText('Draft preview')
  await setup.getByLabel('World name').fill('Discarded Draft')
  await setup.getByRole('button', { name: 'Reset draft', exact: true }).click()
  await expect(setup.getByLabel('World name')).toHaveValue('The Seeded Valley')
  await setup.getByRole('button', { name: 'Discard draft', exact: true }).click()
  await expect(setup).toBeHidden()
  await expect(page.locator('.world-overview strong')).toHaveText('Seeded Valley')
  await expect(page.locator('.active-world-seed')).toHaveText(activeSeed ?? '')
})

test('rehydrates a persisted draft before any authoritative world commit', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create world', exact: true }).click()
  let setup = page.getByRole('dialog', { name: 'Shape a new world' })
  await expect(setup.locator('.draft-preview')).toContainText('Draft preview')
  await setup.getByLabel('World name').fill('Persisted Draft Valley')
  await expect(setup.getByRole('button', { name: 'Commit & create world', exact: true })).toBeEnabled()
  await page.reload()
  await expect(page.locator('.world-overview strong')).toHaveText('Seeded Valley')
  await page.getByRole('button', { name: 'Create world', exact: true }).click()
  setup = page.getByRole('dialog', { name: 'Shape a new world' })
  await expect(setup.getByLabel('World name')).toHaveValue('Persisted Draft Valley')
  await setup.getByRole('button', { name: 'Discard draft', exact: true }).click()
  await expect(setup).toBeHidden()
})

test('settles an idle viewport request and supports keyboard map navigation', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.world-overview strong')).toHaveText('Seeded Valley')
  const canvas = page.getByLabel('Hex world map')
  await waitForMapSettled(canvas)
  const before = await canvas.getAttribute('data-map-viewport')
  await canvas.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => canvas.getAttribute('data-map-viewport')).not.toBe(before)
  await page.keyboard.press('f')
  await expect(canvas).toHaveAttribute('data-map-revision', /\d+/)
})

test('switches to bounded world overview rendering without distant hex outlines', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.world-overview strong')).toHaveText('Seeded Valley')
  const canvas = page.getByLabel('Hex world map')
  await expect(canvas).toHaveAttribute('data-map-lod', 'cell')
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds) return
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  for (let index = 0; index < 18; index += 1) await page.mouse.wheel(0, 500)
  await expect(canvas).toHaveAttribute('data-map-lod', /region|world/)
  await expect(canvas).toHaveAttribute('data-map-border-alpha', '0')
  const primitiveCount = Number(await canvas.getAttribute('data-map-primitive-count'))
  expect(primitiveCount).toBeLessThanOrEqual(4096)
  await expect(page.locator('#map-render-status')).toContainText(/regional overview|world overview/)
})

test('keeps a hooked person live without changing the camera', async ({ page }) => {
  const expected = SimulationEngine.create('valley-001')
  const before = expected.project()
  const after = expected.step(1).projection

  await page.goto('/')
  await expect(page.locator('.world-overview strong')).toHaveText('Seeded Valley')
  const person = await findVisiblePerson(page, before.people)
  expect(person).toBeDefined()
  if (!person) return
  const moved = after.people.find((candidate) => candidate.id === person.id)
  expect(moved).toBeDefined()
  if (!moved) return
  await hookPersonAtCurrentCell(page, person)
  const canvas = page.getByLabel('Hex world map')
  await expect(canvas).toHaveAttribute('data-hooked-person-id', person.id)
  const cameraBefore = await canvas.getAttribute('data-map-viewport')
  await page.getByTitle('Advance one hour').click()
  await expect(page.getByText('Day 0 · 01:00')).toBeVisible()
  await expect(page.getByText('Person hooked')).toBeVisible()
  await expect(canvas).toHaveAttribute('data-map-viewport', cameraBefore ?? '')
  await expect(canvas).toHaveAttribute('data-hooked-person-id', person.id)
  const comma = moved.locationCellId.indexOf(',')
  await expect(canvas).toHaveAttribute('data-hooked-cell', `${Number(moved.locationCellId.slice(0, comma))},${Number(moved.locationCellId.slice(comma + 1))}`)
  await expect(page.locator('.inspector-grid .metric').filter({ hasText: 'Location' }).first().locator('strong')).toHaveText(moved.locationCellId)
})

test('creates, steps, inspects, and saves a deterministic world', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.world-overview strong')).toHaveText('Seeded Valley')
  await page.getByRole('button', { name: 'food', exact: true }).click()
  await expect(page.getByRole('button', { name: 'food', exact: true })).toHaveClass(/active/)
  const activityLayer = page.getByRole('button', { name: 'Activity locations', exact: true })
  const householdLayer = page.getByRole('button', { name: 'Households', exact: true })
  await expect(activityLayer).toHaveAttribute('aria-pressed', 'false')
  await expect(householdLayer).toHaveAttribute('aria-pressed', 'false')
  await activityLayer.click()
  await householdLayer.click()
  await expect(activityLayer).toHaveAttribute('aria-pressed', 'true')
  await expect(householdLayer).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Day 0 · 00:00')).toBeVisible()
  await page.getByTitle('Advance one hour').click()
  await expect(page.getByText('Day 0 · 01:00')).toBeVisible()
  await page.getByPlaceholder('Snapshot name').fill('First hour')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('First hour')).toBeVisible()
  await expect(page.getByText('CLOCK ADVANCED')).toBeVisible()
  await page.getByRole('button', { name: /Inspect person-/ }).first().click()
  await expect(page.getByText('Person inspector')).toBeVisible()
  await expect(page.getByText('Person hooked')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Current activity', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Household', exact: true })).toBeVisible()
  await expect(page.getByText(/daily schedule/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Current condition', exact: true })).toBeVisible()
  await expect(page.locator('#need-variables-heading')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Core dispositions', exact: true })).toBeVisible()
  await expect(page.locator('[data-variable-id="person.trait.curiosity"]')).toBeVisible()
  await expect(page.locator('[data-variable-id="person.trait.riskTolerance"]')).toBeVisible()
  await expect(page.locator('[data-variable-id="person.trait.sociability"]')).toBeVisible()
  await expect(page.locator('[data-variable-id="person.trait.trustPropensity"]')).toBeVisible()
  await expect(page.locator('[data-variable-id="person.trait.conformity"]')).toBeVisible()
  await expect(page.locator('[data-variable-id="person.trait.persistence"]')).toBeVisible()
  await expect(page.getByText('Why this action?')).toBeVisible()
  await expect(page.getByText('Baseline')).toBeVisible()
  const currentStateContributions = page.locator('#contribution-current-state').locator('..')
  await expect(currentStateContributions).toBeVisible()
  await expect(currentStateContributions.locator('[data-source-id]').first()).toBeVisible()
  await expect(currentStateContributions).toContainText(/Hunger|Fatigue/)
  await expect(page.getByText(/selection probability/)).toBeVisible()
  const canvasHeight = await page.getByLabel('Hex world map').evaluate((canvas) => canvas.clientHeight)
  expect(canvasHeight).toBeGreaterThan(250)
  expect(canvasHeight).toBeLessThanOrEqual(800)
  const inspectorDimensions = await page.locator('.right-panel').evaluate((panel) => ({ clientHeight: panel.clientHeight, scrollHeight: panel.scrollHeight, overflowY: getComputedStyle(panel).overflowY }))
  expect(inspectorDimensions.clientHeight).toBeLessThanOrEqual(800)
  expect(inspectorDimensions.scrollHeight).toBeGreaterThan(inspectorDimensions.clientHeight)
  expect(inspectorDimensions.overflowY).toMatch(/auto|scroll/)
  await page.getByTitle('Advance one hour').click()
  await expect(page.getByText('Person inspector')).toBeVisible()
  await expect(page.getByText('Person hooked')).toBeVisible()
})

test('the same seed and step count produce the same digest', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.world-overview strong')).toHaveText('Seeded Valley')
  await page.getByTitle('Advance one hour').click()
  await expect(page.getByText('Day 0 · 01:00')).toBeVisible()
  const firstDigest = await page.locator('.fact').filter({ hasText: 'SAVED HASH' }).locator('strong').textContent()
  expect(firstDigest).toBe('37ab0ff047')
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(page.getByText('Day 0 · 00:00')).toBeVisible()
  await page.getByTitle('Advance one hour').click()
  await expect(page.getByText('Day 0 · 01:00')).toBeVisible()
  await expect(page.locator('.fact').filter({ hasText: 'SAVED HASH' }).locator('strong')).toHaveText(firstDigest ?? '')
})

test('encounter events navigate between hooked people and their relationships', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.world-overview strong')).toHaveText('Seeded Valley')
  for (let hour = 1; hour <= 24; hour += 1) await advanceOneHour(page, hour)
  await expect(page.locator('[data-simulation-tick]')).toHaveAttribute('data-simulation-tick', '24')
  const encounter = page.locator('.event-row').filter({ hasText: 'PERSON ENCOUNTERED' }).first()
  await expect(encounter).toBeVisible()
  await expect(encounter.getByRole('button')).toHaveCount(2)
  await encounter.getByRole('button').first().click()
  await expect(page.getByText('Last encounter')).toBeVisible()
  await expect(page.getByText(/outcome probability/)).toBeVisible()
  await expect(page.locator('.relationship-list button').first()).toBeVisible()
  const relationshipTarget = await page.locator('.relationship-list button').first().getAttribute('aria-label')
  await page.locator('.relationship-list button').first().click()
  await expect(page.locator('.right-panel .panel-title').first().locator('span')).toHaveText((relationshipTarget ?? '').replace('Hook ', ''))
})

test('hooks a fixed child, inspects household origins, and re-hooks a parent without camera follow', async ({ page }) => {
  const expected = await SimulationEngine.create('valley-001')
  const expectedProjection = expected.project()
  const peopleByCell = new Map<string, number>()
  for (const person of expectedProjection.people) peopleByCell.set(person.locationCellId, (peopleByCell.get(person.locationCellId) ?? 0) + 1)
  const parentChild = expectedProjection.parentChildLinks.find((link) => (peopleByCell.get(expectedProjection.people.find((person) => person.id === link.childId)?.locationCellId ?? '') ?? 0) <= 12)
  const child = expectedProjection.people.find((person) => person.id === parentChild?.childId)
  expect(child).toBeDefined()
  expect(parentChild).toBeDefined()

  await page.goto('/')
  await expect(page.locator('.world-overview strong')).toHaveText('Seeded Valley')
  const canvas = page.getByLabel('Hex world map')
  const bounds = await canvas.boundingBox()
  expect(bounds).not.toBeNull()
  if (!bounds || !child || !parentChild) return
  await expect.poll(async () => canvas.evaluate((element) => {
    const transform = element.getAttribute('data-map-viewport')
    return transform && element.clientWidth > 0 && element.clientHeight > 0 && transform !== '34.000,42.000,0.86000'
  })).toBe(true)
  const transform = await canvas.getAttribute('data-map-viewport')
  expect(transform).not.toBeNull()
  if (!transform) return
  const [x = Number.NaN, y = Number.NaN, scale = Number.NaN] = transform.split(',').map(Number)
  expect(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(scale)).toBe(true)
  const comma = child.locationCellId.indexOf(',')
  const center = axialToPixel({ q: Number(child.locationCellId.slice(0, comma)), r: Number(child.locationCellId.slice(comma + 1)) }, 18)
  await page.mouse.click(bounds.x + x + center.x * scale, bounds.y + y + center.y * scale)
  await page.locator('.occupant-list button').filter({ hasText: child.id }).click()

  await expect(page.locator('.right-panel .panel-title').first().locator('span')).toHaveText(child.id)
  await expect(page.getByText('Starting predisposition', { exact: true })).toBeVisible()
  await expect(page.getByText(/Fictional, configurable parental-baseline-variation/)).toBeVisible()
  await expect(page.locator('.household-members button').filter({ hasText: parentChild.parentId })).toContainText('Parent')
  const cameraBefore = await canvas.getAttribute('data-map-viewport')
  await page.locator('.household-members button').filter({ hasText: parentChild.parentId }).click()
  await expect(page.locator('.right-panel .panel-title').first().locator('span')).toHaveText(parentChild.parentId)
  await expect(canvas).toHaveAttribute('data-map-viewport', cameraBefore ?? '')
  const dimensions = await canvas.evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight }))
  expect(dimensions.width).toBeGreaterThan(250)
  expect(dimensions.height).toBeGreaterThan(250)
})

test('inspects persisted experience and deterministic development at the 720-hour boundary', async ({ page }) => {
  const engine = await controlledDevelopmentEngine()
  const result = engine.step(720)
  const child = result.projection.people.find((person) => person.id === 'person-0101')
  expect(child?.development.lastExperience).toBeDefined()
  expect(child?.development.lastChange).toBeDefined()
  if (!child) return
  const snapshot = await engine.snapshot()
  await page.goto('/')
  await expect(page.locator('.world-overview strong')).toHaveText('Seeded Valley')
  await page.evaluate(async (savedSnapshot) => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open('world-simulation-workbench')
    opening.onerror = () => reject(opening.error)
    opening.onsuccess = () => {
      const database = opening.result
      const transaction = database.transaction('snapshots', 'readwrite')
      transaction.objectStore('snapshots').put({ key: 'e2e:development', runId: savedSnapshot.state.runId, kind: 'named', name: 'Development fixture', createdAt: '2000-01-01T00:00:00.000Z', snapshot: savedSnapshot })
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onerror = () => reject(transaction.error)
    }
  }), snapshot)
  await page.reload()
  const developmentSnapshot = page.getByRole('button', { name: /Development fixture Hour 720/ })
  await expect(developmentSnapshot).toBeVisible()
  await developmentSnapshot.evaluate((button) => (button as HTMLButtonElement).click())
  await expect(page.getByText('Day 30 · 00:00')).toBeVisible()
  const canvas = page.getByLabel('Hex world map')
  await expect.poll(async () => canvas.evaluate((element) => {
    const transform = element.getAttribute('data-map-viewport')
    return transform !== null
      && transform !== '34.000,42.000,0.86000'
      && element.clientWidth > 0
      && element.clientHeight > 0
  })).toBe(true)
  const bounds = await canvas.boundingBox()
  const transform = await canvas.getAttribute('data-map-viewport')
  expect(bounds).not.toBeNull()
  expect(transform).not.toBeNull()
  if (!bounds || !transform) return
  const [x = Number.NaN, y = Number.NaN, scale = Number.NaN] = transform.split(',').map(Number)
  const comma = child.locationCellId.indexOf(',')
  const center = axialToPixel({ q: Number(child.locationCellId.slice(0, comma)), r: Number(child.locationCellId.slice(comma + 1)) }, 18)
  await page.mouse.click(bounds.x + x + center.x * scale, bounds.y + y + center.y * scale)
  await page.locator('.occupant-list button').filter({ hasText: child.id }).click()

  await expect(page.getByRole('heading', { name: 'Recent experience', exact: true })).toBeVisible()
  await expect(page.getByText('Parent curiosity modeling', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Developmental exposure', exact: true })).toBeVisible()
  await expect(page.getByText('No co-presence recorded in current window.', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Development change', exact: true })).toBeVisible()
  await expect(page.locator('.development-change-summary')).toContainText('→')
  const disclosure = page.getByRole('button', { name: 'Contributors and formula inputs' })
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  await disclosure.click()
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByText('Requested delta', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /Hook development source/ }).first()).toBeVisible()
})

test('maps and explains authoritative catchment measures without losing a hooked person', async ({ page }) => {
  const restoreEngine = await SimulationEngine.create('valley-001')
  const restoreResult = restoreEngine.step(24)
  const westAtSnapshot = restoreResult.projection.communities.find((community) => community.catchment.displayName === 'West Valley')
  expect(westAtSnapshot).toBeDefined()
  const snapshot = await restoreEngine.snapshot()
  await page.goto('/')
  await expect(page.locator('.world-overview strong')).toHaveText('Seeded Valley')
  await storeNamedSnapshot(page, snapshot, 'e2e:community', 'Community fixture')
  await expect(page.locator('.community-signal-card')).toHaveCount(2)
  await expect(page.locator('.community-signal-card').filter({ hasText: 'West Valley' })).toBeVisible()
  await expect(page.locator('.community-signal-card').filter({ hasText: 'East Valley' })).toBeVisible()

  for (let hour = 0; hour < 24; hour += 1) await page.getByTitle('Advance one hour').click()
  await expect(page.getByText('Day 1 · 00:00')).toBeVisible()
  const canvas = page.getByLabel('Hex world map')
  const communityLayer = page.getByRole('button', { name: 'community', exact: true })
  await communityLayer.click()
  await expect(communityLayer).toHaveClass(/active/)
  await page.getByLabel('Community map measure').selectOption('community.emergent.conflict')
  await expect(page.getByLabel('Community overlay legend')).toContainText('Conflict pressure')
  await expect(page.getByLabel('Community overlay legend')).toContainText('West Valley')
  await expect(page.getByLabel('Community overlay legend')).toContainText('East Valley')

  const encounter = page.locator('.event-row').filter({ hasText: 'PERSON ENCOUNTERED' }).first()
  await expect(encounter).toBeVisible()
  await encounter.getByRole('button').first().click()
  await expect(page.getByText('Person hooked')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Current geographic exposure', exact: true })).toBeVisible()
  const hookedPersonId = await page.locator('.right-panel .panel-title').first().locator('span').textContent()
  const cameraBefore = await canvas.getAttribute('data-map-viewport')

  await page.getByRole('region', { name: 'Community signals' }).getByRole('button', { name: 'Inspect West Valley community' }).click()
  await expect(page.getByText('Community inspector')).toBeVisible()
  await expect(page.getByText('Person remains hooked')).toBeVisible()
  await expect(canvas).toHaveAttribute('data-map-viewport', cameraBefore ?? '')
  const socialTrustCard = page.locator('.community-measure-card').filter({ hasText: 'Social trust' })
  const traceDisclosure = socialTrustCard.getByRole('button', { name: 'Why this measure?' })
  await expect(traceDisclosure).toHaveAttribute('aria-expanded', 'false')
  await traceDisclosure.click()
  await expect(traceDisclosure).toHaveAttribute('aria-expanded', 'true')
  await expect(socialTrustCard).toContainText('previous')
  await expect(socialTrustCard).toContainText('observed')
  await expect(socialTrustCard).toContainText('current')
  await expect(socialTrustCard.locator('[data-source-id]').first()).toBeVisible()
  await expect(page.getByText(/not assigned to people through community membership/)).toBeVisible()

  await page.getByRole('button', { name: 'Return to hooked person' }).click()
  await expect(page.locator('.right-panel .panel-title').first().locator('span')).toHaveText(hookedPersonId ?? '')
  await expect(page.getByText('Person hooked')).toBeVisible()
  await expect(canvas).toHaveAttribute('data-map-viewport', cameraBefore ?? '')

  const communityEvent = page.locator('.event-row').filter({ hasText: 'COMMUNITY MEASURES UPDATED' }).first()
  await expect(communityEvent).toBeVisible()
  await expect(communityEvent).toContainText(/ticks 1–24/)
  await communityEvent.getByRole('button', { name: /Inspect .* community/ }).click()
  await expect(page.getByText('Community inspector')).toBeVisible()

  await page.reload()
  const communitySnapshot = page.getByRole('button', { name: /Community fixture Hour 24/ })
  await expect(communitySnapshot).toBeVisible()
  await communitySnapshot.click()
  await expect(page.getByText('Day 1 · 00:00')).toBeVisible()
  await expect(page.locator('.community-signal-card').filter({ hasText: 'West Valley' })).toContainText(`${((westAtSnapshot?.emergent['community.emergent.socialTrust'] ?? 0) / 10).toFixed(1)}%`)
})

test('shows the authoritative community influence in an actual person action trace', async ({ page }) => {
  const expected = await SimulationEngine.create('valley-001')
  const result = expected.step(25)
  const person = result.projection.people.find((candidate) => candidate.lastDecision?.contributions.some((contribution) => contribution.kind === 'communityInfluence' && contribution.value !== 0))
  expect(person).toBeDefined()
  if (!person) return

  await page.goto('/')
  await expect(page.locator('.world-overview strong')).toHaveText('Seeded Valley')
  for (let hour = 0; hour < 25; hour += 1) await page.getByTitle('Advance one hour').click()
  await hookPersonAtCurrentCell(page, person)
  const communityGroup = page.locator('#contribution-community-exposure').locator('..')
  await expect(communityGroup).toBeVisible()
  await expect(communityGroup).toContainText('Community exposure')
  const contribution = communityGroup.locator('[data-community-id][data-edge-id][data-source-id]').first()
  await expect(contribution).toBeVisible()
  await expect(contribution).toContainText(/source \d+‰ · centered [+-]?\d+‰ · weight -?\d+‰/)
})

async function hookPersonAtCurrentCell(page: import('@playwright/test').Page, person: PersonState): Promise<void> {
  const canvas = page.getByLabel('Hex world map')
  await expect.poll(async () => canvas.getAttribute('data-map-viewport')).not.toBeNull()
  await waitForMapSettled(canvas)
  const bounds = await canvas.boundingBox()
  const transform = await canvas.getAttribute('data-map-viewport')
  expect(bounds).not.toBeNull()
  expect(transform).not.toBeNull()
  if (!bounds || !transform) return
  const [x = Number.NaN, y = Number.NaN, scale = Number.NaN] = transform.split(',').map(Number)
  const comma = person.locationCellId.indexOf(',')
  const center = axialToPixel({ q: Number(person.locationCellId.slice(0, comma)), r: Number(person.locationCellId.slice(comma + 1)) }, 18)
  await page.mouse.click(bounds.x + x + center.x * scale, bounds.y + y + center.y * scale)
  await waitForMapSettled(canvas)
  const personButton = page.locator('.occupant-list button').filter({ hasText: person.id })
  await expect(personButton).toBeVisible()
  await personButton.click()
}

async function findVisiblePerson(page: import('@playwright/test').Page, people: readonly PersonState[]): Promise<PersonState | undefined> {
  const canvas = page.getByLabel('Hex world map')
  await expect.poll(async () => canvas.getAttribute('data-map-viewport')).not.toBeNull()
  const bounds = await canvas.boundingBox()
  const transform = await canvas.getAttribute('data-map-viewport')
  if (!bounds || !transform) return undefined
  const [x = Number.NaN, y = Number.NaN, scale = Number.NaN] = transform.split(',').map(Number)
  return people.find((person) => {
    const comma = person.locationCellId.indexOf(',')
    const center = axialToPixel({ q: Number(person.locationCellId.slice(0, comma)), r: Number(person.locationCellId.slice(comma + 1)) }, 18)
    const screenX = x + center.x * scale
    const screenY = y + center.y * scale
    return screenX >= 0 && screenX <= bounds.width && screenY >= 0 && screenY <= bounds.height
  })
}

async function storeNamedSnapshot(page: import('@playwright/test').Page, snapshot: Awaited<ReturnType<SimulationEngine['snapshot']>>, key: string, name: string): Promise<void> {
  await page.evaluate(async ({ savedSnapshot, savedKey, savedName }) => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open('world-simulation-workbench')
    opening.onerror = () => reject(opening.error)
    opening.onsuccess = () => {
      const database = opening.result
      const transaction = database.transaction('snapshots', 'readwrite')
      transaction.objectStore('snapshots').put({ key: savedKey, runId: savedSnapshot.state.runId, kind: 'named', name: savedName, createdAt: '2000-01-01T00:00:00.000Z', snapshot: savedSnapshot })
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onerror = () => reject(transaction.error)
    }
  }), { savedSnapshot: snapshot, savedKey: key, savedName: name })
}

async function controlledDevelopmentEngine(): Promise<SimulationEngine> {
  const source = (await SimulationEngine.create('development-ui-controlled').snapshot()).state
  const state = structuredClone(source)
  const passable = state.world.grid.cells.filter(({ movementCost }) => movementCost > 0)
  const first = passable[0]
  const second = passable[1]
  if (!first || !second) throw new Error('Controlled UI development fixture needs two passable cells')
  const homeCell = { ...first, id: '0,0', q: 0, r: 0, habitability: 700, resourceCapacity: 0, foodAmount: 0, foodRegenerationPerDay: 0 }
  const awayCell = { ...second, id: '1,0', q: 1, r: 0, resourceCapacity: 0, foodAmount: 0, foodRegenerationPerDay: 0 }
  state.world.grid = { width: 2, height: 1, cells: [homeCell, awayCell] }
  state.config.worldWidth = 2
  state.config.worldHeight = 1
  const catchments = createTwoCatchmentGeography({ cells: state.world.grid.cells, width: state.world.grid.width, height: state.world.grid.height })
  state.communities = catchments.map((catchment) => ({ ...createCommunityState(catchment, 500, 0), lastUpdatedTick: 0, latestTraces: [] }))
  state.dailyCommunityCounters = catchments.map((catchment) => ({ communityId: catchment.id, counters: { ...createDailyCommunityCounters(), windowStartTick: 1, windowEndTick: 24 } }))
  state.tick = 0
  state.nextEventSequence = 1
  const retained = new Set(['person-0001', 'person-0051', 'person-0101', 'person-0151'])
  state.people = state.people.filter(({ id }) => retained.has(id))
  state.config.worldCreation = {
    ...state.config.worldCreation,
    width: 2,
    height: 1,
    initialPopulationCount: state.people.length,
    populationZones: [{ id: 'population-zone-0001', name: 'Controlled population', cellIds: [homeCell.id], populationCount: state.people.length }],
    settlements: [],
  }
  const peopleById = new Map(state.people.map((person) => [person.id, person]))
  configureDevelopmentPerson(requiredDevelopmentPerson(peopleById, 'person-0001'), 30, homeCell.id, 600)
  configureDevelopmentPerson(requiredDevelopmentPerson(peopleById, 'person-0051'), 30, homeCell.id, 800)
  configureDevelopmentPerson(requiredDevelopmentPerson(peopleById, 'person-0101'), 10, homeCell.id, 400)
  configureDevelopmentPerson(requiredDevelopmentPerson(peopleById, 'person-0151'), 30, homeCell.id, 1000)
  state.households = state.households
    .filter(({ id }) => id === 'household-0001' || id === 'household-0051')
    .map((household) => ({ ...household, homeCellId: homeCell.id, memberIds: household.memberIds.filter((id) => retained.has(id)) }))
  state.parentChildLinks = state.parentChildLinks.filter(({ childId }) => childId === 'person-0101')
  state.activityLocations = [
    createCommonsActivity(homeCell.id), createCommonsActivity(awayCell.id),
    ...state.households.map(({ id }) => createHouseholdHomeActivity(id, homeCell.id)),
  ].sort((firstLocation, secondLocation) => firstLocation.id.localeCompare(secondLocation.id))
  for (const person of state.people) {
    const household = state.households.find(({ id }) => id === person.householdId)
    if (!household) throw new Error(`Controlled UI fixture missing household ${person.householdId}`)
    person.homeCellId = homeCell.id
    person.knownCellIds = [homeCell.id]
    person.activityScheduleId = scheduleForAge(person.ageYears)
    person.currentActivity = { kind: 'home', locationId: household.homeActivityLocationId, sinceTick: 0 }
    person.development = { exposures: [{ ...createParentCuriosityExposureAccumulator(1), sourcePersonIds: [] }] }
    person.journey = undefined
    person.lastDecision = undefined
    person.lastEncounter = undefined
  }
  state.relationships = []
  state.dailySpatialCounters = { travelCost: 0, completedMoves: 0, foodConsumed: 0, failedMeals: 0 }
  state.dailySocialCounters = { encounters: 0, positiveEncounters: 0, neutralEncounters: 0, tenseEncounters: 0, relationshipsFormed: 0 }
  state.dailyActivityCounters = { homePersonHours: 0, commonsPersonHours: 0, travelPersonHours: 0 }
  state.dailyDevelopmentCounters = { parentChildCoExposureSourceHours: 0, developmentExperiences: 0, developmentChanges: 0, absoluteCuriosityChange: 0 }
  return SimulationEngine.restore(await createSnapshot(state))
}

function configureDevelopmentPerson(person: PersonState, ageYears: number, cellId: string, curiosity: number): void {
  person.ageYears = ageYears
  person.ageHoursIntoYear = 0
  person.locationCellId = cellId
  setPersonVariable(person.variables, PERSON_VARIABLE_ID.curiosity, curiosity)
}

function requiredDevelopmentPerson(peopleById: ReadonlyMap<string, PersonState>, id: string): PersonState {
  const person = peopleById.get(id)
  if (!person) throw new Error(`Controlled UI development fixture missing ${id}`)
  return person
}
