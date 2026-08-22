import { useEffect, useRef, useState } from 'react'
import type { DraftViewportProjection, DraftViewportRequest, GeographicCell, Terrain } from '../simulation/domain/types'
import { axialToPixel, pixelToAxial } from '../simulation/spatial/hex'
import { fitWorld, type MapViewportState, type WorldDimensions } from './mapViewport'

const HEX_SIZE = 15

/** The draft viewport is intentionally a small, non-authoritative map slice. */
export type DraftZoneViewport = DraftViewportProjection
export type DraftZoneViewportRequest = DraftViewportRequest

interface DraftZoneMapProps {
  world: WorldDimensions
  viewport?: DraftZoneViewport
  /** The accepted draft revision owning the terrain selection. */
  draftRevision?: number
  selectedZoneId?: string
  disabled?: boolean
  onViewportRequest: (request: DraftZoneViewportRequest) => void
  onSelectionCommit: (zoneId: string, cellIds: readonly string[]) => void
  terrainPaint?: Terrain
  onTerrainPaintCommit?: (terrain: Terrain, cellIds: readonly string[]) => void
  elevationPaint?: number
  onElevationPaintCommit?: (elevation: number, cellIds: readonly string[]) => void
}

export function DraftZoneMap({ world, viewport, draftRevision, selectedZoneId, disabled = false, onViewportRequest, onSelectionCommit, terrainPaint, onTerrainPaintCommit, elevationPaint, onElevationPaintCommit }: DraftZoneMapProps) {
  const terrainMode = terrainPaint !== undefined && onTerrainPaintCommit !== undefined
  const elevationMode = elevationPaint !== undefined && onElevationPaintCommit !== undefined
  const paintMode = terrainMode || elevationMode
  const paintLabel = terrainMode ? `Paint ${terrainPaint} terrain` : `Set elevation to ${elevationPaint}`
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [camera, setCamera] = useState<MapViewportState>({ width: 0, height: 0, scale: 1, x: 0, y: 0 })
  const fittedWorld = useRef('')
  const revision = useRef(0)
  const latestRequestedRevision = useRef(0)
  const requestFrame = useRef<number | undefined>(undefined)
  const drag = useRef<{ x: number; y: number; originX: number; originY: number; panning: boolean; changed: boolean; selected: Set<string> } | undefined>(undefined)
  const selection = useRef(new Set<string>())
  const lastCommittedSelection = useRef('')
  const pendingSelectionCommit = useRef<{ zoneId: string; cellIds: string[] } | undefined>(undefined)
  const [paintRevision, setPaintRevision] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setCamera((current) => ({ ...current, width: entry.contentRect.width, height: entry.contentRect.height }))
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!camera.width || !camera.height) return
    const key = `${world.width}x${world.height}`
    if (key === fittedWorld.current) return
    fittedWorld.current = key
    setCamera(fitWorld(world, camera.width, camera.height, HEX_SIZE, 20))
  }, [camera.height, camera.width, world.height, world.width])

  const currentViewport = viewport && viewport.revision >= latestRequestedRevision.current && (paintMode || viewport.selectedZoneId === selectedZoneId) ? viewport : undefined
  const firstPassableCenter = currentViewport?.cells.find(isEligibleHomeCell)
  const firstPassableScreenPoint = firstPassableCenter ? axialToPixel(firstPassableCenter, HEX_SIZE) : undefined

  useEffect(() => {
    if (paintMode || !currentViewport || currentViewport.selectedZoneId !== selectedZoneId || drag.current?.changed) return
    selection.current = new Set(currentViewport.cells.filter((cell) => cell.selected).map((cell) => cell.id))
    setPaintRevision((current) => current + 1)
  }, [currentViewport, selectedZoneId])

  useEffect(() => {
    if (!camera.width || !camera.height || (!paintMode && !selectedZoneId) || disabled) return
    if (requestFrame.current !== undefined) cancelAnimationFrame(requestFrame.current)
    requestFrame.current = requestAnimationFrame(() => {
      revision.current += 1
      latestRequestedRevision.current = revision.current
      onViewportRequest({ revision: revision.current, ...(paintMode ? {} : { selectedZoneId }), bounds: draftViewportBounds(world, camera) })
      requestFrame.current = undefined
    })
    return () => { if (requestFrame.current !== undefined) cancelAnimationFrame(requestFrame.current) }
  }, [camera, disabled, draftRevision, onViewportRequest, selectedZoneId, world.height, world.width])

  useEffect(() => {
    const pending = pendingSelectionCommit.current
    if (disabled || !pending) return
    pendingSelectionCommit.current = undefined
    onSelectionCommit(pending.zoneId, pending.cellIds)
  }, [disabled, onSelectionCommit])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !camera.width || !camera.height) return
    const ratio = window.devicePixelRatio || 1
    canvas.width = Math.floor(camera.width * ratio)
    canvas.height = Math.floor(camera.height * ratio)
    canvas.style.width = `${camera.width}px`
    canvas.style.height = `${camera.height}px`
    const context = canvas.getContext('2d')
    if (!context) return
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.fillStyle = '#09100c'
    context.fillRect(0, 0, camera.width, camera.height)
    context.save()
    context.translate(camera.x, camera.y)
    context.scale(camera.scale, camera.scale)
    for (const cell of currentViewport?.cells ?? []) drawCell(context, cell, selection.current.has(cell.id), HEX_SIZE)
    context.restore()
  }, [camera, currentViewport, paintRevision])

  function cellAt(clientX: number, clientY: number) {
    const bounds = canvasRef.current?.getBoundingClientRect()
    if (!bounds) return undefined
    const position = pixelToAxial((clientX - bounds.left - camera.x) / camera.scale, (clientY - bounds.top - camera.y) / camera.scale, HEX_SIZE)
    return currentViewport?.cells.find((cell) => cell.q === position.q && cell.r === position.r)
  }

  function paint(clientX: number, clientY: number): boolean {
    const cell = cellAt(clientX, clientY)
    if (!cell || (!paintMode && !isEligibleHomeCell(cell))) return false
    const current = drag.current
    if (!current || current.selected.has(cell.id)) return false
    current.selected.add(cell.id)
    if (selection.current.has(cell.id)) selection.current.delete(cell.id)
    else selection.current.add(cell.id)
    current.changed = true
    setPaintRevision((value) => value + 1)
    return true
  }

  function commitSelection(): void {
    if (!paintMode && !selectedZoneId) return
    const cellIds = [...selection.current].sort()
    const signature = cellIds.join(',')
    if (signature === lastCommittedSelection.current) return
    lastCommittedSelection.current = signature
    if (disabled) {
      if (!paintMode && selectedZoneId) pendingSelectionCommit.current = { zoneId: selectedZoneId, cellIds }
      return
    }
    if (terrainMode && terrainPaint && onTerrainPaintCommit) {
      selection.current.clear()
      setPaintRevision((value) => value + 1)
      onTerrainPaintCommit(terrainPaint, cellIds)
    } else if (elevationMode && elevationPaint !== undefined && onElevationPaintCommit) {
      selection.current.clear()
      setPaintRevision((value) => value + 1)
      onElevationPaintCommit(elevationPaint, cellIds)
    }
    else if (selectedZoneId) onSelectionCommit(selectedZoneId, cellIds)
  }

  return <section className="draft-zone-map" aria-label={paintMode ? 'Paint draft terrain' : 'Draw placement zone'}>
    <div className="draft-zone-map-heading"><div><span className="eyebrow">{elevationMode ? 'ELEVATION PAINTING' : terrainMode ? 'TERRAIN PAINTING' : 'DIRECT ZONE DRAWING'}</span><h4>{paintMode ? paintLabel : 'Habitable cells only'}</h4></div><small>{selection.current.size} selected</small></div>
    <p>{paintMode ? 'Drag across up to 512 generated cells, then apply this deterministic draft-only terrain edit.' : 'Drag across habitable cells to toggle this non-settlement zone. Terrain and settlement anchors are read-only.'}</p>
    <div className="draft-zone-canvas-wrap" ref={containerRef}>
      <canvas
        ref={canvasRef}
        aria-label={paintMode ? 'Draft terrain paint map' : 'Draft placement zone map'}
        tabIndex={0}
        data-draft-map-revision={currentViewport?.revision}
        data-draft-map-cell-count={currentViewport?.cells.length}
        data-draft-map-viewport={`${camera.x.toFixed(2)},${camera.y.toFixed(2)},${camera.scale.toFixed(4)}`}
        data-draft-zone-id={paintMode ? undefined : selectedZoneId}
        data-draft-map-first-passable-center={firstPassableScreenPoint ? `${(camera.x + firstPassableScreenPoint.x * camera.scale).toFixed(2)},${(camera.y + firstPassableScreenPoint.y * camera.scale).toFixed(2)}` : undefined}
        onPointerDown={(event) => {
          if (disabled) return
          event.currentTarget.setPointerCapture(event.pointerId)
          drag.current = { x: event.clientX, y: event.clientY, originX: camera.x, originY: camera.y, panning: event.button !== 0 || event.shiftKey, changed: false, selected: new Set() }
          if (!drag.current.panning && !paint(event.clientX, event.clientY)) drag.current.panning = true
        }}
        onPointerMove={(event) => {
          const current = drag.current
          if (!current || disabled) return
          if (current.panning) setCamera((value) => ({ ...value, x: current.originX + event.clientX - current.x, y: current.originY + event.clientY - current.y }))
          else paint(event.clientX, event.clientY)
        }}
        onPointerUp={() => {
          drag.current = undefined
        }}
        onWheel={(event) => {
          event.preventDefault()
          const bounds = event.currentTarget.getBoundingClientRect()
          const cursorX = event.clientX - bounds.left
          const cursorY = event.clientY - bounds.top
          setCamera((value) => {
            const scale = Math.max(.08, Math.min(4, value.scale * (event.deltaY < 0 ? 1.14 : .88)))
            const ratio = scale / value.scale
            return { ...value, scale, x: cursorX - (cursorX - value.x) * ratio, y: cursorY - (cursorY - value.y) * ratio }
          })
        }}
        onKeyDown={(event) => {
          const pan = 28
          if (event.key === 'f' || event.key === 'F') { event.preventDefault(); setCamera(fitWorld(world, camera.width, camera.height, HEX_SIZE, 20)); return }
          const delta = event.key === 'ArrowLeft' ? [pan, 0] : event.key === 'ArrowRight' ? [-pan, 0] : event.key === 'ArrowUp' ? [0, pan] : event.key === 'ArrowDown' ? [0, -pan] : undefined
          if (delta) { event.preventDefault(); setCamera((value) => ({ ...value, x: value.x + delta[0]!, y: value.y + delta[1]! })) }
        }}
      />
      {!currentViewport && <span className="draft-map-loading">Loading generated terrain…</span>}
    </div>
    <small className="draft-map-key"><i className="plain" /> plain <i className="hill" /> hill <i className="water" /> water / blocked <i className="selected" /> selected</small>
    <button type="button" className="secondary draft-zone-apply" disabled={disabled || selection.current.size === 0} onClick={commitSelection}>{paintMode ? paintLabel : 'Apply drawn cells'}</button>
  </section>
}

export function draftViewportBounds(world: WorldDimensions, viewport: MapViewportState): DraftZoneViewportRequest['bounds'] {
  const corners = [
    pixelToAxial((-viewport.x) / viewport.scale, (-viewport.y) / viewport.scale, HEX_SIZE),
    pixelToAxial((viewport.width - viewport.x) / viewport.scale, (-viewport.y) / viewport.scale, HEX_SIZE),
    pixelToAxial((-viewport.x) / viewport.scale, (viewport.height - viewport.y) / viewport.scale, HEX_SIZE),
    pixelToAxial((viewport.width - viewport.x) / viewport.scale, (viewport.height - viewport.y) / viewport.scale, HEX_SIZE),
  ]
  return limitDraftViewportBounds({ minQ: clamp(Math.min(...corners.map((cell) => cell.q)) - 2, 0, world.width - 1), maxQ: clamp(Math.max(...corners.map((cell) => cell.q)) + 2, 0, world.width - 1), minR: clamp(Math.min(...corners.map((cell) => cell.r)) - 2, 0, world.height - 1), maxR: clamp(Math.max(...corners.map((cell) => cell.r)) + 2, 0, world.height - 1) })
}

const MAX_DRAFT_VIEWPORT_CELLS = 4096

/** Keeps authoring requests inside the worker's fixed transport budget. */
function limitDraftViewportBounds(bounds: DraftZoneViewportRequest['bounds']): DraftZoneViewportRequest['bounds'] {
  const width = bounds.maxQ - bounds.minQ + 1
  const height = bounds.maxR - bounds.minR + 1
  if (width * height <= MAX_DRAFT_VIEWPORT_CELLS) return bounds
  const aspect = width / height
  const limitedWidth = Math.min(width, Math.max(1, Math.floor(Math.sqrt(MAX_DRAFT_VIEWPORT_CELLS * aspect))))
  const limitedHeight = Math.min(height, Math.max(1, Math.floor(MAX_DRAFT_VIEWPORT_CELLS / limitedWidth)))
  return {
    minQ: centeredMinimum(bounds.minQ, bounds.maxQ, limitedWidth),
    maxQ: centeredMinimum(bounds.minQ, bounds.maxQ, limitedWidth) + limitedWidth - 1,
    minR: centeredMinimum(bounds.minR, bounds.maxR, limitedHeight),
    maxR: centeredMinimum(bounds.minR, bounds.maxR, limitedHeight) + limitedHeight - 1,
  }
}

function centeredMinimum(minimum: number, maximum: number, size: number): number {
  return minimum + Math.floor(((maximum - minimum + 1) - size) / 2)
}

function drawCell(context: CanvasRenderingContext2D, cell: GeographicCell, selected: boolean, size: number) {
  const { x, y } = axialToPixel(cell, size)
  context.beginPath()
  for (let index = 0; index < 6; index += 1) {
    const angle = Math.PI / 180 * (60 * index - 30)
    const pointX = x + size * Math.cos(angle)
    const pointY = y + size * Math.sin(angle)
    if (index === 0) context.moveTo(pointX, pointY)
    else context.lineTo(pointX, pointY)
  }
  context.closePath()
  context.fillStyle = cell.movementCost <= 0 ? '#26383f' : cell.terrain === 'hill' ? '#766b46' : '#4f7653'
  context.fill()
  context.lineWidth = selected ? 2.2 : .75
  context.strokeStyle = selected ? '#f1c85c' : cell.movementCost <= 0 ? '#47616b' : '#213a29'
  context.stroke()
}

/** Mirrors the current creator-side home-cell requirement. */
function isEligibleHomeCell(cell: GeographicCell): boolean {
  return cell.movementCost > 0 && cell.habitability >= 500
}

function clamp(value: number, minimum: number, maximum: number) { return Math.max(minimum, Math.min(maximum, value)) }
