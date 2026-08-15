import { useEffect, useMemo, useRef, useState } from 'react'
import type { GeographicCell, HexGrid, PersonState } from '../simulation/domain/types'
import { axialToPixel, pixelToAxial } from '../simulation/spatial/hex'
import { fitWorld, populationMarkerRadius, renderLevel } from './mapViewport'

export type MapOverlay = 'terrain' | 'elevation' | 'habitability' | 'movement' | 'food' | 'population'

interface HexMapProps {
  grid: HexGrid
  overlay: MapOverlay
  selectedCellId?: string
  people: PersonState[]
  selectedPersonId?: string
  onSelect: (cell?: GeographicCell) => void
}

const HEX_SIZE = 18

export function HexMap({ grid, overlay, selectedCellId, people, selectedPersonId, onSelect }: HexMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ width: 0, height: 0, scale: 0.86, x: 34, y: 42 })
  const drag = useRef<{ x: number; y: number; originX: number; originY: number; moved: boolean } | undefined>(undefined)
  const fittedGrid = useRef('')
  const level = useMemo(() => renderLevel(grid, viewport, HEX_SIZE), [grid, viewport])
  const populationCounts = useMemo(() => populationByRenderedCell(people, grid, level.stride), [grid, level.stride, people])

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
    for (const cell of level.cells) drawCell(context, cell, overlay, cell.id === selectedCellId, level.cellRadius, level.borderAlpha, populationCounts.get(cell.id) ?? 0)
    if (level.stride > 1 && selectedCellId) {
      const selected = grid.cells.find((cell) => cell.id === selectedCellId)
      if (selected) drawCell(context, selected, overlay, true, HEX_SIZE, 1, populationCounts.get(selected.id) ?? 0)
    }
    drawPopulation(context, people, grid, level.stride, selectedPersonId)
    context.restore()
  }, [grid, level, overlay, people, populationCounts, selectedCellId, selectedPersonId, viewport])

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
      <div className="map-lod">{level.label} · {level.cells.length.toLocaleString()} drawn</div>
      <div className="map-help">Drag to pan · Wheel to zoom · Click to inspect</div>
    </div>
  )
}

function drawPopulation(context: CanvasRenderingContext2D, people: PersonState[], grid: HexGrid, stride: number, selectedPersonId?: string): void {
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
      context.arc(x, y, populationMarkerRadius(group.count, stride), 0, Math.PI * 2)
      context.fillStyle = 'rgba(241, 210, 111, .58)'
      context.fill()
    }
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
    context.arc(center.x + Math.cos(angle) * distance, center.y + Math.sin(angle) * distance, populationMarkerRadius(1, 1, selected), 0, Math.PI * 2)
    context.fillStyle = selected ? '#fff2ad' : 'rgba(238, 197, 82, .86)'
    context.fill()
    if (selected) {
      context.strokeStyle = '#362b12'
      context.lineWidth = 1.2
      context.stroke()
    }
  }
}

function cellForPerson(person: PersonState, grid: HexGrid): GeographicCell | undefined {
  const comma = person.locationCellId.indexOf(',')
  const q = Number(person.locationCellId.slice(0, comma))
  const r = Number(person.locationCellId.slice(comma + 1))
  if (!Number.isInteger(q) || !Number.isInteger(r) || q < 0 || r < 0 || q >= grid.width || r >= grid.height) return undefined
  return grid.cells[r * grid.width + q]
}

function drawCell(context: CanvasRenderingContext2D, cell: GeographicCell, overlay: MapOverlay, selected: boolean, radius: number, borderAlpha: number, population: number): void {
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
  context.fillStyle = cellColor(cell, overlay, population)
  context.fill()
  if (selected || borderAlpha > 0) {
    context.strokeStyle = selected ? '#f2c94c' : `rgba(9, 17, 14, ${borderAlpha})`
    context.lineWidth = selected ? 3 : 0.8
    context.stroke()
  }
}

function cellColor(cell: GeographicCell, overlay: MapOverlay, population: number): string {
  if (overlay === 'terrain') {
    if (cell.terrain === 'water') return '#244b5a'
    if (cell.terrain === 'hill') return '#6d6547'
    return '#426a4d'
  }
  if (overlay === 'elevation') return gradient(cell.elevation / 1000, [32, 61, 47], [218, 207, 167])
  if (overlay === 'habitability') return cell.habitability === 0 ? '#25312f' : gradient(cell.habitability / 1000, [85, 47, 44], [87, 169, 101])
  if (overlay === 'food') return cell.resourceCapacity === 0 ? '#27322e' : gradient(cell.foodAmount / cell.resourceCapacity, [84, 42, 38], [111, 176, 82])
  if (overlay === 'population') return population === 0 ? '#1b2823' : gradient(Math.min(1, population / 8), [52, 72, 62], [236, 186, 70])
  if (cell.movementCost === 0) return '#253c49'
  return gradient((cell.movementCost - 1000) / 800, [59, 112, 71], [176, 89, 56])
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
