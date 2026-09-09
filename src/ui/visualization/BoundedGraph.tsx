import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { deterministicNodePositions } from './scales'
import type { GraphViewModel } from './types'

export function BoundedGraph({ graph, selectedNodeId, selectedEdgeId, onSelectNode, onSelectEdge }: {
  graph: GraphViewModel
  selectedNodeId?: string
  selectedEdgeId?: string
  onSelectNode?: (nodeId: string) => void
  onSelectEdge?: (edgeId: string) => void
}) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [showTable, setShowTable] = useState(false)
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>())
  const width = 720
  const height = 440
  const positions = useMemo(() => deterministicNodePositions(graph.nodes.map((node) => node.id), width, height), [graph.nodes])
  const moveFocus = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? graph.nodes.length - 1 : (currentIndex + delta + graph.nodes.length) % graph.nodes.length
    const node = graph.nodes[index]
    if (node) nodeRefs.current.get(node.id)?.focus()
  }
  return <section className="bounded-graph" aria-label="Bounded relationship graph" data-node-count={graph.nodes.length} data-edge-count={graph.edges.length}>
    <div className="graph-toolbar" role="toolbar" aria-label="Graph view controls">
      <button type="button" onClick={() => setScale((value) => Math.min(2, value + 0.2))} aria-label="Zoom graph in">+</button>
      <button type="button" onClick={() => setScale((value) => Math.max(0.6, value - 0.2))} aria-label="Zoom graph out">−</button>
      <button type="button" onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }) }}>Fit</button>
      <button type="button" onClick={() => setOffset((value) => ({ ...value, x: value.x - 40 }))} aria-label="Pan graph left">←</button>
      <button type="button" onClick={() => setOffset((value) => ({ ...value, x: value.x + 40 }))} aria-label="Pan graph right">→</button>
      <button type="button" aria-pressed={showTable} onClick={() => setShowTable((value) => !value)}>Details table</button>
    </div>
    {(graph.nodesTruncated || graph.edgesTruncated || graph.missingEndpointCount > 0) && <p className="graph-budget" role="status">Bounded projection: {graph.nodes.length}/{graph.nodeLimit} nodes, {graph.edges.length}/{graph.edgeLimit} edges. {graph.nodesTruncated ? 'Nodes truncated. ' : ''}{graph.edgesTruncated ? 'Edges truncated. ' : ''}{graph.missingEndpointCount > 0 ? `${graph.missingEndpointCount} edges have unavailable endpoints.` : ''}</p>}
    <div className="graph-canvas" style={{ '--graph-scale': scale, '--graph-x': `${offset.x}px`, '--graph-y': `${offset.y}px` } as CSSProperties}>
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">{graph.edges.map((edge) => {
        const source = positions.get(edge.sourceId)
        const target = positions.get(edge.targetId)
        if (!source || !target) return null
        return <line key={edge.id} className={`graph-edge ${edge.style} ${selectedEdgeId === edge.id ? 'selected' : ''}`} x1={source.x} y1={source.y} x2={target.x} y2={target.y} />
      })}</svg>
      {graph.nodes.map((node, index) => {
        const position = positions.get(node.id)!
        return <button key={node.id} ref={(element) => { if (element) nodeRefs.current.set(node.id, element); else nodeRefs.current.delete(node.id) }} type="button" className={`graph-node ${selectedNodeId === node.id ? 'selected' : ''}`} style={{ left: `${position.x / width * 100}%`, top: `${position.y / height * 100}%` }} onClick={() => onSelectNode?.(node.id)} onKeyDown={(event) => moveFocus(event, index)} aria-pressed={selectedNodeId === node.id} aria-label={`${node.label}. ${node.description ?? node.category ?? 'Person'}`}>{node.label}</button>
      })}
    </div>
    {showTable && <div className="graph-details-table"><table><caption>Graph nodes and relationships</caption><thead><tr><th>Item</th><th>Evidence</th><th>Action</th></tr></thead><tbody>
      {graph.nodes.map((node) => <tr key={`node:${node.id}`}><th>{node.label}</th><td>{node.description ?? node.category ?? 'Node'}</td><td><button type="button" onClick={() => onSelectNode?.(node.id)}>Select node</button></td></tr>)}
      {graph.edges.map((edge) => <tr key={`edge:${edge.id}`}><th>{edge.label}</th><td>{edge.description ?? `${edge.sourceId} to ${edge.targetId}; ${edge.style}`}</td><td><button type="button" aria-pressed={selectedEdgeId === edge.id} onClick={() => onSelectEdge?.(edge.id)}>Select edge</button></td></tr>)}
    </tbody></table></div>}
  </section>
}
