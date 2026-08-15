import { useEffect, useMemo, useRef, useState } from 'react'
import type { CommunitySimulationState, CommunityVariableDefinition, CommunityVariableId } from '../simulation/community/types'
import type { ActivityLocationState, GeographicCell, HouseholdState, HexGrid, PersonState, RelationshipState } from '../simulation/domain/types'
import { axialToPixel, pixelToAxial } from '../simulation/spatial/hex'
import { fitWorld, populationMarkerRadius, renderLevel } from './mapViewport'

export type MapOverlay = 'terrain' | 'elevation' | 'habitability' | 'movement' | 'food' | 'population' | 'community'

interface HexMapProps {
  grid: HexGrid
  overlay: MapOverlay
  selectedCellId?: string
  people: PersonState[]
  relationships: RelationshipState[]
  activityLocations: readonly ActivityLocationState[]
  households: readonly HouseholdState[]
  communities: readonly CommunitySimulationState[]
  communityVariableDefinitions: readonly CommunityVariableDefinition[]
  communityMeasureId: CommunityVariableId
  selectedCommunityId?: string
  showActivityLocations: boolean
  showHouseholds: boolean
  selectedPersonId?: string
  onSelect: (cell?: GeographicCell) => void
}

const HEX_SIZE = 18

export function HexMap({ grid, overlay, selectedCellId, people, relationships, activityLocations, households, communities, communityVariableDefinitions, communityMeasureId, selectedCommunityId, showActivityLocations, showHouseholds, selectedPersonId, onSelect }: HexMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0, scale: 0.86, x: 34, y: 42 })
  const drag = useRef<{ x: number; y: number; originX: number; originY: number; moved: boolean } | undefined>(undefined)
  const fittedGrid = useRef('')
  const level = useMemo(() => renderLevel(grid, viewport, HEX_SIZE), [grid, viewport])
  const populationCounts = useMemo(() => populationByRenderedCell(people, grid, level.stride), [grid, level.stride, people])
  const cellsById = useMemo(() => new Map(grid.cells.map((cell) => [cell.id, cell])), [grid])
  const communityByCellId = useMemo(() => {
    const result = new Map<string, CommunitySimulationState>()
    for (const community of communities) for (const cellId of community.catchment.cellIds) result.set(cellId, community)
    return result
  }, [communities])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      setViewport((current) => ({ ...current, width: entry.contentRect.width, height: entry.contentRect.height }))
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (viewport.width === 0 || viewport.height === 0) return
    const key = `${grid.width}x${grid.height}`
    if (fittedGrid.current === key) return
    fittedGrid.current = key
    setViewport(fitWorld(grid, viewport.width, viewport.height, HEX_SIZE))
  }, [grid, viewport.width, viewport.height])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || viewport.width === 0 || viewport.height === 0) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.floor(viewport.width * ratio)
    canvas.height = Math.floor(viewport.height * ratio)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, viewport.width, viewport.height)
    context.fillStyle = '#0d1311'
    context.fillRect(0, 0, viewport.width, viewport.height)
    context.save()
    context.translate(viewport.x, viewport.y)
    context.scale(viewport.scale, viewport.scale)
    for (const cell of level.cells) drawCell(context, cell, overlay, cell.id === selectedCellId, level.cellRadius, level.borderAlpha, populationCounts.get(cell.id) ?? 0, communityByCellId.get(cell.id), communityMeasureId)
    if (overlay === 'community') drawCommunityBoundaries(context, level.cells, communityByCellId, level.stride, level.cellRadius, viewport.scale, selectedCommunityId)
    if (level.stride > 1 && selectedCellId) {
      const selected = grid.cells.find((cell) => cell.id === selectedCellId)
      if (selected) drawCell(context, selected, overlay, true, HEX_SIZE, 1, populationCounts.get(selected.id) ?? 0, communityByCellId.get(selected.id), communityMeasureId)
    }
    drawRelationshipNetwork(context, people, relationships, grid, selectedPersonId, viewport.scale)
    drawPopulation(context, people, grid, level.stride, selectedPersonId, viewport.scale)
    if (showActivityLocations) drawActivityLocations(context, activityLocations, cellsById, level.stride, selectedPersonId ? people.find((person) => person.id === selectedPersonId)?.currentActivity.locationId : undefined, viewport.scale)
    if (showHouseholds) drawHouseholds(context, households, cellsById, level.stride, selectedPersonId ? people.find((person) => person.id === selectedPersonId)?.householdId : undefined, viewport.scale)
    context.restore()
  }, [activityLocations, cellsById, communityByCellId, communityMeasureId, grid, households, level, overlay, people, populationCounts, relationships, selectedCellId, selectedCommunityId, selectedPersonId, showActivityLocations, showHouseholds, viewport])

  function pointToCell(clientX: number, clientY: number): GeographicCell | undefined {
    const bounds = canvasRef.current?.getBoundingClientRect()
    if (!bounds) return undefined
    const localX = (clientX - bounds.left - viewport.x) / viewport.scale
    const localY = (clientY - bounds.top - viewport.y) / viewport.scale
    const coordinate = pixelToAxial(localX, localY, HEX_SIZE)
    if (coordinate.q < 0 || coordinate.r < 0 || coordinate.q >= grid.width || coordinate.r >= grid.height) return undefined
    return grid.cells[coordinate.r * grid.width + coordinate.q]
  }

  return (
    <div className="map-container" ref={containerRef}>
      <canvas
        ref={canvasRef}
        aria-label="Hex world map"
        data-map-viewport={`${viewport.x.toFixed(3)},${viewport.y.toFixed(3)},${viewport.scale.toFixed(5)}`}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { x: event.clientX, y: event.clientY, originX: viewport.x, originY: viewport.y, moved: false }
        }}
        onPointerMove={(event) => {
          const current = drag.current
          if (!current) return
          const dx = event.clientX - current.x
          const dy = event.clientY - current.y
          if (Math.abs(dx) + Math.abs(dy) > 3) current.moved = true
          setViewport((view) => ({ ...view, x: current.originX + dx, y: current.originY + dy }))
        }}
        onPointerUp={(event) => {
          const current = drag.current
          drag.current = undefined
          if (!current?.moved) onSelect(pointToCell(event.clientX, event.clientY))
        }}
        onWheel={(event) => {
          event.preventDefault()
          const bounds = event.currentTarget.getBoundingClientRect()
          const cursorX = event.clientX - bounds.left
          const cursorY = event.clientY - bounds.top
          setViewport((view) => {
            const nextScale = Math.max(0.015, Math.min(4, view.scale * (event.deltaY < 0 ? 1.12 : 0.89)))
            const ratio = nextScale / view.scale
            return { ...view, scale: nextScale, x: cursorX - (cursorX - view.x) * ratio, y: cursorY - (cursorY - view.y) * ratio }
          })
        }}
      />
      <button className="map-fit" onClick={() => setViewport(fitWorld(grid, viewport.width, viewport.height, HEX_SIZE))}>Fit world</button>
      {overlay === 'community' && <div className="community-map-legend" aria-label="Community overlay legend">
        <strong>{communityVariableDefinitions.find((definition) => definition.id === communityMeasureId)?.label ?? communityMeasureId}</strong>
        <small>{communityMeasureId === 'community.emergent.conflict' ? 'Geographic catchments · higher conflict is warmer' : 'Geographic catchments · higher values are greener'}</small>
        {communities.map((community) => <div key={community.catchment.id} className={community.catchment.id === selectedCommunityId ? 'selected' : ''}><i style={{ background: communityColor(communityValue(community, communityMeasureId), communityMeasureId) }} /><span>{community.catchment.displayName}</span><b>{(communityValue(community, communityMeasureId) / 10).toFixed(1)}%</b></div>)}
      </div>}
      <div className="map-lod">{level.label} · {level.cells.length.toLocaleString()} drawn</div>
      <div className="map-help">Drag to pan · Wheel to zoom · Click to inspect</div>
    </div>
  )
}

function drawActivityLocations(context: CanvasRenderingContext2D, locations: readonly ActivityLocationState[], cellsById: ReadonlyMap<string, GeographicCell>, stride: number, selectedLocationId: string | null | undefined, viewportScale: number): void {
  const visible = stride > 1
    ? aggregateLocationCells(locations.map((location) => ({ cellId: location.cellId, selected: location.id === selectedLocationId })), cellsById, stride)
    : locations.map((location) => ({ cellId: location.cellId, count: 1, selected: location.id === selectedLocationId }))
  for (const marker of visible) {
    const cell = cellsById.get(marker.cellId)
    if (!cell) continue
    const { x, y } = axialToPixel(cell, HEX_SIZE)
    const radius = screenRadius(marker.selected ? 5.5 : Math.min(4.2, 2.1 + marker.count * .25), viewportScale, marker.selected ? 4 : 2, marker.selected ? 7 : 4)
    context.beginPath()
    context.rect(x - radius, y - radius, radius * 2, radius * 2)
    context.fillStyle = marker.selected ? 'rgba(120, 215, 255, .95)' : 'rgba(104, 185, 210, .7)'
    context.fill()
    if (marker.selected) { context.strokeStyle = '#e5fbff'; context.lineWidth = 1.1 / viewportScale; context.stroke() }
  }
}

function drawHouseholds(context: CanvasRenderingContext2D, households: readonly HouseholdState[], cellsById: ReadonlyMap<string, GeographicCell>, stride: number, selectedHouseholdId: string | undefined, viewportScale: number): void {
  const visible = stride > 1
    ? aggregateLocationCells(households.map((household) => ({ cellId: household.homeCellId, selected: household.id === selectedHouseholdId })), cellsById, stride)
    : households.map((household) => ({ cellId: household.homeCellId, count: household.memberIds.length, selected: household.id === selectedHouseholdId }))
  for (const marker of visible) {
    const cell = cellsById.get(marker.cellId)
    if (!cell) continue
    const { x, y } = axialToPixel(cell, HEX_SIZE)
    const radius = screenRadius(marker.selected ? 6 : Math.min(4.5, 2.2 + marker.count * .2), viewportScale, marker.selected ? 4 : 2, marker.selected ? 7 : 4)
    context.beginPath()
    context.moveTo(x, y - radius)
    context.lineTo(x + radius, y + radius)
    context.lineTo(x - radius, y + radius)
    context.closePath()
    context.fillStyle = marker.selected ? 'rgba(255, 225, 126, .95)' : 'rgba(226, 172, 83, .72)'
    context.fill()
    if (marker.selected) { context.strokeStyle = '#fff0bb'; context.lineWidth = 1.1 / viewportScale; context.stroke() }
  }
}

function aggregateLocationCells(entries: readonly { cellId: string; selected: boolean }[], cellsById: ReadonlyMap<string, GeographicCell>, stride: number): { cellId: string; count: number; selected: boolean }[] {
  const counts = new Map<string, { count: number; selected: boolean }>()
  for (const entry of entries) {
    const cell = cellsById.get(entry.cellId)
    if (!cell) continue
    const id = `${Math.floor(cell.q / stride) * stride},${Math.floor(cell.r / stride) * stride}`
    const existing = counts.get(id)
    counts.set(id, { count: (existing?.count ?? 0) + 1, selected: (existing?.selected ?? false) || entry.selected })
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cellId, value]) => ({ cellId, ...value }))
}

function drawPopulation(context: CanvasRenderingContext2D, people: PersonState[], grid: HexGrid, stride: number, selectedPersonId?: string, viewportScale = 1): void {
  if (stride > 1) {
    const groups = new Map<string, { q: number; r: number; count: number }>()
    for (const person of people) {
      const cell = cellForPerson(person, grid)
      if (!cell) continue
      const q = Math.floor(cell.q / stride) * stride
      const r = Math.floor(cell.r / stride) * stride
      const key = `${q},${r}`
      const group = groups.get(key)
      if (group) group.count += 1
      else groups.set(key, { q, r, count: 1 })
    }
    for (const group of groups.values()) {
      const { x, y } = axialToPixel(group, HEX_SIZE)
      context.beginPath()
      context.arc(x, y, screenRadius(populationMarkerRadius(group.count, stride), viewportScale, 2, 8), 0, Math.PI * 2)
      context.fillStyle = 'rgba(241, 210, 111, .58)'
      context.fill()
    }
    drawSelectedMarker(context, people, grid, selectedPersonId, viewportScale)
    return
  }

  const occupancy = new Map<string, number>()
  for (const person of people) {
    const cell = cellForPerson(person, grid)
    if (!cell) continue
    const index = occupancy.get(cell.id) ?? 0
    occupancy.set(cell.id, index + 1)
    const center = axialToPixel(cell, HEX_SIZE)
    const angle = (index * 2.399963229728653) % (Math.PI * 2)
    const distance = Math.min(8, 2 + Math.sqrt(index) * 2.2)
    const selected = person.id === selectedPersonId
    context.beginPath()
    context.arc(center.x + Math.cos(angle) * distance, center.y + Math.sin(angle) * distance, screenRadius(populationMarkerRadius(1, 1, selected), viewportScale, selected ? 4 : 2, selected ? 7 : 4), 0, Math.PI * 2)
    context.fillStyle = selected ? '#fff2ad' : 'rgba(238, 197, 82, .86)'
    context.fill()
    if (selected) {
      context.strokeStyle = '#362b12'
      context.lineWidth = 1.2 / viewportScale
      context.stroke()
    }
  }

}

function drawSelectedMarker(context: CanvasRenderingContext2D, people: PersonState[], grid: HexGrid, selectedPersonId: string | undefined, viewportScale: number): void {
  if (!selectedPersonId) return
  const selected = people.find((person) => person.id === selectedPersonId)
  const cell = selected ? cellForPerson(selected, grid) : undefined
  if (!cell) return
  const center = axialToPixel(cell, HEX_SIZE)
  context.beginPath()
  context.arc(center.x, center.y, screenRadius(4.5, viewportScale, 5, 8), 0, Math.PI * 2)
  context.fillStyle = '#fff2ad'
  context.fill()
  context.strokeStyle = '#362b12'
  context.lineWidth = 1.4 / viewportScale
  context.stroke()
}

function drawRelationshipNetwork(context: CanvasRenderingContext2D, people: PersonState[], relationships: RelationshipState[], grid: HexGrid, selectedPersonId: string | undefined, viewportScale: number): void {
  if (!selectedPersonId) return
  const selected = people.find((person) => person.id === selectedPersonId)
  const selectedCell = selected ? cellForPerson(selected, grid) : undefined
  if (!selectedCell) return
  const peopleById = new Map(people.map((person) => [person.id, person]))
  const origin = axialToPixel(selectedCell, HEX_SIZE)
  const directRelationships = relationships
    .filter((relationship) => relationship.personAId === selectedPersonId || relationship.personBId === selectedPersonId)
    .sort((first, second) => first.id < second.id ? -1 : first.id > second.id ? 1 : 0)
  for (const relationship of directRelationships) {
    const otherId = relationship.personAId === selectedPersonId ? relationship.personBId : relationship.personAId
    const other = peopleById.get(otherId)
    const otherCell = other ? cellForPerson(other, grid) : undefined
    if (!otherCell) continue
    const destination = axialToPixel(otherCell, HEX_SIZE)
    context.beginPath()
    context.moveTo(origin.x, origin.y)
    context.lineTo(destination.x, destination.y)
    context.strokeStyle = `rgba(119, 207, 170, ${0.26 + relationship.familiarity / 2000})`
    context.lineWidth = screenRadius(1.1 + relationship.familiarity / 1000, viewportScale, 0.7, 2.2)
    context.stroke()
  }
}

function screenRadius(worldRadius: number, viewportScale: number, minimumPixels: number, maximumPixels: number): number {
  return Math.max(minimumPixels, Math.min(maximumPixels, worldRadius * viewportScale)) / Math.max(viewportScale, 0.001)
}

function cellForPerson(person: PersonState, grid: HexGrid): GeographicCell | undefined {
  const comma = person.locationCellId.indexOf(',')
  const q = Number(person.locationCellId.slice(0, comma))
  const r = Number(person.locationCellId.slice(comma + 1))
  if (!Number.isInteger(q) || !Number.isInteger(r) || q < 0 || r < 0 || q >= grid.width || r >= grid.height) return undefined
  return grid.cells[r * grid.width + q]
}

function drawCell(context: CanvasRenderingContext2D, cell: GeographicCell, overlay: MapOverlay, selected: boolean, radius: number, borderAlpha: number, population: number, community: CommunitySimulationState | undefined, communityMeasureId: CommunityVariableId): void {
  const { x, y } = axialToPixel(cell, HEX_SIZE)
  context.beginPath()
  for (let index = 0; index < 6; index += 1) {
    const angle = ((60 * index - 30) * Math.PI) / 180
    const px = x + radius * Math.cos(angle)
    const py = y + radius * Math.sin(angle)
    if (index === 0) context.moveTo(px, py)
    else context.lineTo(px, py)
  }
  context.closePath()
  context.fillStyle = cellColor(cell, overlay, population, community, communityMeasureId)
  context.fill()
  if (selected || borderAlpha > 0) {
    context.strokeStyle = selected ? '#f2c94c' : `rgba(9, 17, 14, ${borderAlpha})`
    context.lineWidth = selected ? 3 : 0.8
    context.stroke()
  }
}

function cellColor(cell: GeographicCell, overlay: MapOverlay, population: number, community: CommunitySimulationState | undefined, communityMeasureId: CommunityVariableId): string {
  if (overlay === 'terrain') {
    if (cell.terrain === 'water') return '#244b5a'
    if (cell.terrain === 'hill') return '#6d6547'
    return '#426a4d'
  }
  if (overlay === 'elevation') return gradient(cell.elevation / 1000, [32, 61, 47], [218, 207, 167])
  if (overlay === 'habitability') return cell.habitability === 0 ? '#25312f' : gradient(cell.habitability / 1000, [85, 47, 44], [87, 169, 101])
  if (overlay === 'food') return cell.resourceCapacity === 0 ? '#27322e' : gradient(cell.foodAmount / cell.resourceCapacity, [84, 42, 38], [111, 176, 82])
  if (overlay === 'population') return population === 0 ? '#1b2823' : gradient(Math.min(1, population / 8), [52, 72, 62], [236, 186, 70])
  if (overlay === 'community') return community ? communityColor(communityValue(community, communityMeasureId), communityMeasureId) : '#18211e'
  if (cell.movementCost === 0) return '#253c49'
  return gradient((cell.movementCost - 1000) / 800, [59, 112, 71], [176, 89, 56])
}

const AXIAL_DIRECTIONS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]] as const

function drawCommunityBoundaries(context: CanvasRenderingContext2D, cells: readonly GeographicCell[], communityByCellId: ReadonlyMap<string, CommunitySimulationState>, stride: number, radius: number, viewportScale: number, selectedCommunityId?: string): void {
  for (const cell of cells) {
    const community = communityByCellId.get(cell.id)
    if (!community) continue
    const center = axialToPixel(cell, HEX_SIZE)
    for (let edge = 0; edge < 6; edge += 1) {
      const direction = AXIAL_DIRECTIONS[edge]
      if (!direction) continue
      const neighborId = `${cell.q + direction[0] * stride},${cell.r + direction[1] * stride}`
      const neighbor = communityByCellId.get(neighborId)
      if (neighbor?.catchment.id === community.catchment.id) continue
      const startAngle = ((60 * edge - 30) * Math.PI) / 180
      const endAngle = ((60 * (edge + 1) - 30) * Math.PI) / 180
      context.beginPath()
      context.moveTo(center.x + radius * Math.cos(startAngle), center.y + radius * Math.sin(startAngle))
      context.lineTo(center.x + radius * Math.cos(endAngle), center.y + radius * Math.sin(endAngle))
      context.strokeStyle = community.catchment.id === selectedCommunityId ? '#fff0ad' : 'rgba(230, 237, 227, .58)'
      context.lineWidth = (community.catchment.id === selectedCommunityId ? 2.8 : 1.25) / Math.max(viewportScale, .001)
      context.stroke()
    }
  }
}

function communityValue(community: CommunitySimulationState, id: CommunityVariableId): number {
  if (id === 'community.structural.foodSecurity') return community.structural[id]
  return community.emergent[id]
}

function communityColor(value: number, id: CommunityVariableId): string {
  const amount = Math.max(0, Math.min(1, value / 1000))
  return id === 'community.emergent.conflict'
    ? gradient(amount, [44, 91, 65], [151, 62, 54])
    : gradient(amount, [77, 51, 48], [78, 139, 91])
}

function populationByRenderedCell(people: PersonState[], grid: HexGrid, stride: number): Map<string, number> {
  const result = new Map<string, number>()
  for (const person of people) {
    const cell = cellForPerson(person, grid)
    if (!cell) continue
    const q = Math.floor(cell.q / stride) * stride
    const r = Math.floor(cell.r / stride) * stride
    const id = `${q},${r}`
    result.set(id, (result.get(id) ?? 0) + 1)
  }
  return result
}

function gradient(amount: number, from: [number, number, number], to: [number, number, number]): string {
  const clamped = Math.max(0, Math.min(1, amount))
  const channels = from.map((value, index) => Math.round(value + ((to[index] ?? value) - value) * clamped))
  return `rgb(${channels.join(',')})`
}
