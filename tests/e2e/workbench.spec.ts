import { expect, test } from '@playwright/test'
import { createCommonsActivity, createHouseholdHomeActivity } from '../../src/simulation/activities/model'
import { scheduleForAge } from '../../src/simulation/activities/config'
import type { PersonState } from '../../src/simulation/domain/types'
import { SimulationEngine } from '../../src/simulation/engine/engine'
import { createParentCuriosityExposureAccumulator } from '../../src/simulation/exposure/model'
import { createSnapshot } from '../../src/simulation/serialization/snapshot'
import { axialToPixel } from '../../src/simulation/spatial/hex'
import { PERSON_VARIABLE_ID } from '../../src/simulation/variables/registry'
import { setPersonVariable } from '../../src/simulation/variables/storage'

test('creates, steps, inspects, and saves a deterministic world', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Seeded Valley')).toBeVisible()
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
  await expect(page.getByText('Seeded Valley')).toBeVisible()
  await page.getByTitle('Advance one hour').click()
  await expect(page.getByText('Day 0 · 01:00')).toBeVisible()
  const firstDigest = await page.locator('.fact').filter({ hasText: 'STATE' }).locator('strong').textContent()
  expect(firstDigest).toBe('d58d5618b5')
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(page.getByText('Day 0 · 00:00')).toBeVisible()
  await page.getByTitle('Advance one hour').click()
  await expect(page.getByText('Day 0 · 01:00')).toBeVisible()
  await expect(page.locator('.fact').filter({ hasText: 'STATE' }).locator('strong')).toHaveText(firstDigest ?? '')
})

test('encounter events navigate between hooked people and their relationships', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Seeded Valley')).toBeVisible()
  for (let hour = 0; hour < 24; hour += 1) await page.getByTitle('Advance one hour').click()
  await expect(page.getByText('Day 1 · 00:00')).toBeVisible()
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
  await expect(page.getByText('Seeded Valley')).toBeVisible()
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
  await expect(page.getByText('Seeded Valley')).toBeVisible()
  await page.evaluate(async (savedSnapshot) => new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open('world-simulation-workbench', 1)
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
  await expect.poll(async () => canvas.getAttribute('data-map-viewport')).not.toBeNull()
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

async function controlledDevelopmentEngine(): Promise<SimulationEngine> {
  const source = (await SimulationEngine.create('development-ui-controlled').snapshot()).state
  const state = structuredClone(source)
  const passable = state.world.grid.cells.filter(({ movementCost }) => movementCost > 0)
  const first = passable[0]
  const second = passable[1]
  if (!first || !second) throw new Error('Controlled UI development fixture needs two passable cells')
  const homeCell = { ...first, id: '0,0', q: 0, r: 0, resourceCapacity: 0, foodAmount: 0, foodRegenerationPerDay: 0 }
  const awayCell = { ...second, id: '1,0', q: 1, r: 0, resourceCapacity: 0, foodAmount: 0, foodRegenerationPerDay: 0 }
  state.world.grid = { width: 2, height: 1, cells: [homeCell, awayCell] }
  state.config.worldWidth = 2
  state.config.worldHeight = 1
  state.tick = 0
  state.nextEventSequence = 1
  const retained = new Set(['person-0001', 'person-0051', 'person-0101', 'person-0151'])
  state.people = state.people.filter(({ id }) => retained.has(id))
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
