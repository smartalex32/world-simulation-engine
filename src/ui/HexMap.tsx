import { useEffect, useMemo, useRef, useState } from 'react'
import type { CommunityVariableDefinition, CommunityVariableId } from '../simulation/community/types'
import type { GeographicCell } from '../simulation/domain/types'
import type { MapProjection, ProjectedMapCell, ProjectedRoad, ProjectedSettlement, ProjectedSettlementLink, ProjectionOverlay, ProjectedCommunityState, WorldDescriptor } from '../projection'
import { axialToPixel, pixelToAxial } from '../simulation/spatial/hex'
import { aggregateRegionPolygon, fitWorld, mapProjectionRequest, type MapViewportState } from './mapViewport'

export type MapOverlay = ProjectionOverlay

interface HexMapProps {
  world: WorldDescriptor
  settlements: readonly ProjectedSettlement[]
  roads: readonly ProjectedRoad[]
  settlementLinks?: readonly ProjectedSettlementLink[]
  map: MapProjection
  overlay: MapOverlay
  communityMeasureId: CommunityVariableId
  communities: readonly ProjectedCommunityState[]
  communityVariableDefinitions: readonly CommunityVariableDefinition[]
  selectedCellId?: string
  selectedCommunityId?: string
  showActivityLocations: boolean
  showHouseholds: boolean
  selectedPersonId?: string
  onSelect: (cell: GeographicCell) => void
  onFocusCell: (cellId: string) => void
  onViewportRequest: (request: ReturnType<typeof mapProjectionRequest>) => void
}

const HEX_SIZE = 18

export function HexMap({ world, settlements = [], roads = [], settlementLinks = [], map, overlay, communityMeasureId, communities, communityVariableDefinitions, selectedCellId, selectedCommunityId, showActivityLocations, showHouseholds, selectedPersonId, onSelect, onFocusCell, onViewportRequest }: HexMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState<MapViewportState>({ width: 0, height: 0, scale: 0.86, x: 34, y: 42 })
  const drag = useRef<{ x: number; y: number; originX: number; originY: number; moved: boolean } | undefined>(undefined)
  const fittedWorld = useRef('')
  const revision = useRef(map.revision)
  const [requestedRevision, setRequestedRevision] = useState(map.revision)
  const sendFrame = useRef<number | undefined>(undefined)
  const selectedCell = useMemo(() => map.exactCells.find((cell) => cell.id === selectedCellId) ?? (map.focusCell?.id === selectedCellId ? map.focusCell : undefined), [map.exactCells, map.focusCell, selectedCellId])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      // Browsers may repeat identical ResizeObserver records after canvas
      // drawing. Do not turn those into an endless stream of viewport worker
      // requests that can starve the latest projection on slower CI runners.
      setViewport((current) => current.width === width && current.height === height ? current : { ...current, width, height })
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!viewport.width || !viewport.height) return
    const key = `${world.id}:${world.width}x${world.height}`
    if (fittedWorld.current === key) return
    fittedWorld.current = key
    setViewport(fitWorld(world, viewport.width, viewport.height, HEX_SIZE))
  }, [viewport.height, viewport.width, world.height, world.id, world.width])

  useEffect(() => {
    if (!viewport.width || !viewport.height) return
    if (sendFrame.current !== undefined) cancelAnimationFrame(sendFrame.current)
    sendFrame.current = requestAnimationFrame(() => {
      revision.current += 1
      setRequestedRevision(revision.current)
      onViewportRequest(mapProjectionRequest(world, viewport, HEX_SIZE, revision.current, overlay, {
        communityMeasureId: overlay === 'community' ? communityMeasureId : undefined,
        focusCellId: selectedCellId,
        hookedPersonId: selectedPersonId,
      }))
      sendFrame.current = undefined
    })
    return () => { if (sendFrame.current !== undefined) cancelAnimationFrame(sendFrame.current) }
  }, [communityMeasureId, onViewportRequest, overlay, selectedCellId, selectedPersonId, viewport, world.height, world.id, world.width])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !viewport.width || !viewport.height) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.floor(viewport.width * ratio)
    canvas.height = Math.floor(viewport.height * ratio)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.fillStyle = '#0d1311'
    context.fillRect(0, 0, viewport.width, viewport.height)
    context.save()
    context.translate(viewport.x, viewport.y)
    context.scale(viewport.scale, viewport.scale)
    const appliedMeasureId = map.communityMeasureId ?? communityMeasureId
    if (map.lod === 'cell') for (const cell of map.exactCells) drawCell(context, cell, map.overlay, cell.id === selectedCellId, HEX_SIZE, map.borderAlpha, appliedMeasureId)
    else for (const region of map.regions) drawRegion(context, region, map.overlay, appliedMeasureId)
    if (selectedCell && !map.exactCells.some((cell) => cell.id === selectedCell.id)) drawCell(context, selectedCell, map.overlay, true, HEX_SIZE, 1, appliedMeasureId)
    drawRoads(context, roads, map.exactCells, viewport.scale)
    drawSettlementLinks(context, settlementLinks, viewport.scale)
    drawRelationships(context, map, viewport.scale)
    drawPopulation(context, map, viewport.scale)
    if (showActivityLocations) drawLocationMarkers(context, map.activityMarkers, viewport.scale, 'activity')
    if (showHouseholds) drawLocationMarkers(context, map.householdMarkers, viewport.scale, 'household')
    drawSettlementMarkers(context, settlements, viewport, HEX_SIZE)
    context.restore()
  }, [communityMeasureId, map, overlay, roads, selectedCell, selectedCellId, settlementLinks, settlements, showActivityLocations, showHouseholds, viewport])

  function focusAt(clientX: number, clientY: number): void {
    const bounds = canvasRef.current?.getBoundingClientRect()
    if (!bounds) return
    const localX = (clientX - bounds.left - viewport.x) / viewport.scale
    const localY = (clientY - bounds.top - viewport.y) / viewport.scale
    const coordinate = pixelToAxial(localX, localY, HEX_SIZE)
    if (coordinate.q < 0 || coordinate.r < 0 || coordinate.q >= world.width || coordinate.r >= world.height) return
    const id = `${coordinate.q},${coordinate.r}`
    const exact = map.exactCells.find((cell) => cell.id === id)
    if (exact) onSelect(exact)
    else onFocusCell(id)
  }

  const hookedOffscreen = Boolean(selectedPersonId && map.hookedPersonMarker && !map.hookedPersonMarker.visible)
  return <div className="map-container" ref={containerRef}>
    <canvas
      ref={canvasRef}
      aria-label="Hex world map"
      aria-describedby="map-render-status"
      tabIndex={0}
      data-map-viewport={`${viewport.x.toFixed(3)},${viewport.y.toFixed(3)},${viewport.scale.toFixed(5)}`}
      data-map-revision={map.revision}
      data-map-request-revision={requestedRevision}
      data-map-lod={map.lod}
      data-map-region-size={map.regionSize}
      data-map-border-alpha={map.borderAlpha}
      data-map-primitive-count={map.exactCells.length + map.regions.length}
      data-map-population-markers={map.populationMarkers.length}
      data-hooked-person-id={map.hookedPersonMarker?.personId}
      data-hooked-cell={map.hookedPersonMarker ? `${map.hookedPersonMarker.q},${map.hookedPersonMarker.r}` : undefined}
      data-hooked-visible={map.hookedPersonMarker?.visible}
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, originX: viewport.x, originY: viewport.y, moved: false } }}
      onPointerMove={(event) => {
        const current = drag.current
        if (!current) return
        const dx = event.clientX - current.x
        const dy = event.clientY - current.y
        if (Math.abs(dx) + Math.abs(dy) > 3) current.moved = true
        setViewport((view) => ({ ...view, x: current.originX + dx, y: current.originY + dy }))
      }}
      onPointerUp={(event) => { const current = drag.current; drag.current = undefined; if (current && !current.moved) focusAt(event.clientX, event.clientY) }}
      onWheel={(event) => {
        event.preventDefault()
        const bounds = event.currentTarget.getBoundingClientRect()
        const cursorX = event.clientX - bounds.left
        const cursorY = event.clientY - bounds.top
        setViewport((view) => {
          const nextScale = Math.max(1e-6, Math.min(4, view.scale * (event.deltaY < 0 ? 1.12 : 0.89)))
          const ratio = nextScale / view.scale
          return { ...view, scale: nextScale, x: cursorX - (cursorX - view.x) * ratio, y: cursorY - (cursorY - view.y) * ratio }
        })
      }}
      onKeyDown={(event) => {
        const pan = Math.max(24, Math.min(viewport.width, viewport.height) * .08)
        if (event.key === 'f' || event.key === 'F') { event.preventDefault(); setViewport(fitWorld(world, viewport.width, viewport.height, HEX_SIZE)); return }
        if (event.key === '+' || event.key === '=') { event.preventDefault(); setViewport((view) => ({ ...view, scale: Math.min(4, view.scale * 1.2) })); return }
        if (event.key === '-') { event.preventDefault(); setViewport((view) => ({ ...view, scale: Math.max(1e-6, view.scale / 1.2) })); return }
        const delta = event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A' ? [pan, 0] : event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D' ? [-pan, 0] : event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W' ? [0, pan] : event.key === 'ArrowDown' || event.key === 's' || event.key === 'S' ? [0, -pan] : undefined
        if (delta) { const [deltaX = 0, deltaY = 0] = delta; event.preventDefault(); setViewport((view) => ({ ...view, x: view.x + deltaX, y: view.y + deltaY })) }
      }}
    />
    <button className="map-fit" onClick={() => setViewport(fitWorld(world, viewport.width, viewport.height, HEX_SIZE))}>Fit world</button>
    {map.overlay === 'community' && <CommunityLegend communities={communities} definitions={communityVariableDefinitions} measureId={map.communityMeasureId ?? communityMeasureId} selectedCommunityId={selectedCommunityId} />}
    <div id="map-render-status" className="map-lod" aria-live="polite">{map.lod === 'cell' ? (map.borderAlpha > 0 ? 'hex detail' : 'terrain overview') : map.lod === 'region' ? 'regional overview' : 'world overview'} · {(map.exactCells.length + map.regions.length).toLocaleString()} primitives{hookedOffscreen ? ' · hooked person outside view' : ''}</div>
    <div className="map-help">Drag or arrows/WASD to pan · Wheel or +/- to zoom · F to fit · Click to inspect</div>
  </div>
}

function drawCell(context: CanvasRenderingContext2D, cell: ProjectedMapCell, overlay: MapOverlay, selected: boolean, radius: number, borderAlpha: number, communityMeasureId: CommunityVariableId): void {
  const { x, y } = axialToPixel(cell, HEX_SIZE)
  hexPath(context, x, y, radius)
  context.fillStyle = cellColor(cell, overlay, cell.communityValuePermille, communityMeasureId)
  context.fill()
  if (selected || borderAlpha > 0) {
    context.strokeStyle = selected ? '#f2c94c' : `rgba(9, 17, 14, ${borderAlpha})`
    context.lineWidth = selected ? 3 : .8
    context.stroke()
  }
}

function drawRegion(context: CanvasRenderingContext2D, region: MapProjection['regions'][number], overlay: MapOverlay, communityMeasureId: CommunityVariableId): void {
  const [topLeft, topRight, bottomRight, bottomLeft] = aggregateRegionPolygon(region.q, region.r, region.qMax, region.rMax, HEX_SIZE)
  if (!topLeft || !topRight || !bottomRight || !bottomLeft) return
  context.fillStyle = regionColor(region, overlay, communityMeasureId)
  context.beginPath()
  context.moveTo(topLeft.x, topLeft.y)
  context.lineTo(topRight.x, topRight.y)
  context.lineTo(bottomRight.x, bottomRight.y)
  context.lineTo(bottomLeft.x, bottomLeft.y)
  context.closePath()
  context.fill()
}

function drawPopulation(context: CanvasRenderingContext2D, map: MapProjection, scale: number): void {
  for (const marker of map.populationMarkers) drawMarker(context, marker.q, marker.r, marker.count, scale, false)
  const hooked = map.hookedPersonMarker
  if (hooked?.visible) drawMarker(context, hooked.q, hooked.r, 1, scale, true)
}

function drawMarker(context: CanvasRenderingContext2D, q: number, r: number, count: number, scale: number, selected: boolean): void {
  const center = axialToPixel({ q, r }, HEX_SIZE)
  const pixels = selected ? 7 : Math.max(2, Math.min(8, 2 + Math.sqrt(count) * 1.15))
  context.beginPath()
  context.arc(center.x, center.y, pixels / Math.max(scale, .001), 0, Math.PI * 2)
  context.fillStyle = selected ? '#fff2ad' : 'rgba(238, 197, 82, .78)'
  context.fill()
  if (selected) { context.strokeStyle = '#362b12'; context.lineWidth = 1.3 / Math.max(scale, .001); context.stroke() }
}

function drawLocationMarkers(context: CanvasRenderingContext2D, markers: readonly MapProjection['activityMarkers'][number][], scale: number, kind: 'activity' | 'household'): void {
  for (const marker of markers) {
    const center = axialToPixel(marker, HEX_SIZE)
    const radius = (marker.selected ? 6 : Math.max(2, Math.min(4, 2 + Math.sqrt(marker.count) * .45))) / Math.max(scale, .001)
    context.beginPath()
    if (kind === 'activity') context.rect(center.x - radius, center.y - radius, radius * 2, radius * 2)
    else { context.moveTo(center.x, center.y - radius); context.lineTo(center.x + radius, center.y + radius); context.lineTo(center.x - radius, center.y + radius); context.closePath() }
    context.fillStyle = kind === 'activity' ? (marker.selected ? 'rgba(120, 215, 255, .95)' : 'rgba(104, 185, 210, .7)') : (marker.selected ? 'rgba(255, 225, 126, .95)' : 'rgba(226, 172, 83, .72)')
    context.fill()
  }
}

function drawSettlementMarkers(context: CanvasRenderingContext2D, settlements: readonly ProjectedSettlement[], viewport: MapViewportState, radius: number): void {
  const scale = Math.max(viewport.scale, .001)
  const labelSize = Math.max(9, Math.min(13, 12 / scale))
  for (const settlement of settlements) {
    const comma = settlement.anchorCellId.indexOf(',')
    if (comma <= 0) continue
    const q = Number(settlement.anchorCellId.slice(0, comma))
    const r = Number(settlement.anchorCellId.slice(comma + 1))
    if (!Number.isSafeInteger(q) || !Number.isSafeInteger(r)) continue
    const center = axialToPixel({ q, r }, radius)
    const screenX = viewport.x + center.x * viewport.scale
    const screenY = viewport.y + center.y * viewport.scale
    if (screenX < -80 || screenY < -30 || screenX > viewport.width + 80 || screenY > viewport.height + 30) continue
    const markerRadius = 5 / scale
    context.beginPath()
    context.arc(center.x, center.y, markerRadius, 0, Math.PI * 2)
    context.fillStyle = '#f2c94c'
    context.fill()
    context.strokeStyle = '#17231f'
    context.lineWidth = 1.2 / scale
    context.stroke()
    context.font = `600 ${labelSize / scale}px Inter, sans-serif`
    context.textAlign = 'center'
    context.textBaseline = 'bottom'
    const labelY = center.y - markerRadius - 4 / scale
    const padding = 4 / scale
    const label = `${settlement.name} · ${settlement.scale}`
    const width = context.measureText(label).width + padding * 2
    context.fillStyle = 'rgba(7, 14, 16, .82)'
    context.fillRect(center.x - width / 2, labelY - labelSize / scale - padding / 2, width, labelSize / scale + padding)
    context.fillStyle = '#f4f0dc'
    context.fillText(label, center.x, labelY)
  }
}

function drawRoads(context: CanvasRenderingContext2D, roads: readonly ProjectedRoad[], cells: readonly ProjectedMapCell[], scale: number): void {
  if (scale < .2) return
  const byId = new Map(cells.map((cell) => [cell.id, cell]))
  context.save()
  context.strokeStyle = '#d7bf82'
  context.lineWidth = Math.max(.7, 2.4 / scale)
  context.globalAlpha = .82
  for (const road of roads) for (let index = 1; index < road.cellIds.length; index += 1) {
    const first = byId.get(road.cellIds[index - 1]!)
    const second = byId.get(road.cellIds[index]!)
    if (!first || !second) continue
    const from = axialToPixel(first, HEX_SIZE)
    const to = axialToPixel(second, HEX_SIZE)
    context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke()
  }
  context.restore()
}
function drawSettlementLinks(context: CanvasRenderingContext2D, links: readonly ProjectedSettlementLink[], scale: number): void {
  if (scale < .12) return
  context.save(); context.setLineDash([4 / scale, 4 / scale]); context.strokeStyle = 'rgba(104, 194, 239, .5)'; context.lineWidth = 1 / scale
  for (const link of links) { const [fq, fr] = link.fromCellId.split(',').map(Number); const [tq, tr] = link.toCellId.split(',').map(Number); if ([fq, fr, tq, tr].some((value) => !Number.isFinite(value))) continue; const from = axialToPixel({ q: fq!, r: fr! }, HEX_SIZE); const to = axialToPixel({ q: tq!, r: tr! }, HEX_SIZE); context.beginPath(); context.moveTo(from.x, from.y); context.lineTo(to.x, to.y); context.stroke() }
  context.restore()
}

function drawRelationships(context: CanvasRenderingContext2D, map: MapProjection, scale: number): void {
  for (const segment of map.relationshipSegments) {
    const origin = axialToPixel({ q: segment.originQ, r: segment.originR }, HEX_SIZE)
    const destination = axialToPixel({ q: segment.destinationQ, r: segment.destinationR }, HEX_SIZE)
    context.beginPath(); context.moveTo(origin.x, origin.y); context.lineTo(destination.x, destination.y)
    context.strokeStyle = `rgba(119, 207, 170, ${.26 + segment.familiarity / 2000})`
    context.lineWidth = Math.max(.7, Math.min(2.2, 1.1 + segment.familiarity / 1000)) / Math.max(scale, .001)
    context.stroke()
  }
}

function CommunityLegend({ communities, definitions, measureId, selectedCommunityId }: { communities: readonly ProjectedCommunityState[]; definitions: readonly CommunityVariableDefinition[]; measureId: CommunityVariableId; selectedCommunityId?: string }) {
  return <div className="community-map-legend" aria-label="Community overlay legend"><strong>{definitions.find((definition) => definition.id === measureId)?.label ?? measureId}</strong><small>{measureId === 'community.emergent.conflict' ? 'Geographic catchments · higher conflict is warmer' : 'Geographic catchments · higher values are greener'}</small>{communities.map((community) => { const value = measureId === 'community.structural.foodSecurity' ? community.structural[measureId] : community.emergent[measureId]; return <div key={community.catchment.id} className={community.catchment.id === selectedCommunityId ? 'selected' : ''}><i style={{ background: communityColor(value, measureId) }} /><span>{community.catchment.displayName}</span><b>{(value / 10).toFixed(1)}%</b></div> })}</div>
}

function hexPath(context: CanvasRenderingContext2D, x: number, y: number, radius: number): void { context.beginPath(); for (let index = 0; index < 6; index += 1) { const angle = ((60 * index - 30) * Math.PI) / 180; const px = x + radius * Math.cos(angle); const py = y + radius * Math.sin(angle); if (index === 0) context.moveTo(px, py); else context.lineTo(px, py) }; context.closePath() }
function cellColor(cell: ProjectedMapCell, overlay: MapOverlay, communityValue: number | undefined, communityMeasureId: CommunityVariableId): string { return regionColor({ dominantTerrain: cell.terrain, elevation: cell.elevation, habitability: cell.habitability, movementCost: cell.movementCost, foodAmount: cell.foodAmount, resourceCapacity: cell.resourceCapacity, populationCount: cell.populationCount, communityValuePermille: communityValue }, overlay, communityMeasureId) }
function regionColor(region: Pick<MapProjection['regions'][number], 'dominantTerrain' | 'elevation' | 'habitability' | 'movementCost' | 'foodAmount' | 'resourceCapacity' | 'populationCount' | 'communityValuePermille'>, overlay: MapOverlay, communityMeasureId: CommunityVariableId): string {
  if (overlay === 'terrain') return region.dominantTerrain === 'water' ? '#244b5a' : region.dominantTerrain === 'hill' ? '#6d6547' : '#426a4d'
  if (overlay === 'elevation') return gradient(region.elevation / 1000, [32, 61, 47], [218, 207, 167])
  if (overlay === 'habitability') return region.habitability === 0 ? '#25312f' : gradient(region.habitability / 1000, [85, 47, 44], [87, 169, 101])
  if (overlay === 'food') return region.resourceCapacity === 0 ? '#27322e' : gradient((region.foodAmount ?? 0) / region.resourceCapacity, [84, 42, 38], [111, 176, 82])
  if (overlay === 'population') return region.populationCount === 0 ? '#1b2823' : gradient(Math.min(1, region.populationCount / 8), [52, 72, 62], [236, 186, 70])
  if (overlay === 'community') return communityColor(region.communityValuePermille ?? 0, communityMeasureId)
  if (region.movementCost === 0) return '#253c49'
  return gradient((region.movementCost - 1000) / 800, [59, 112, 71], [176, 89, 56])
}
function communityColor(value: number, id: CommunityVariableId): string { const amount = Math.max(0, Math.min(1, value / 1000)); return id === 'community.emergent.conflict' ? gradient(amount, [44, 91, 65], [151, 62, 54]) : gradient(amount, [77, 51, 48], [78, 139, 91]) }
function gradient(amount: number, from: [number, number, number], to: [number, number, number]): string { const clamped = Math.max(0, Math.min(1, amount)); const channels = from.map((value, index) => Math.round(value + ((to[index] ?? value) - value) * clamped)); return `rgb(${channels.join(',')})` }
