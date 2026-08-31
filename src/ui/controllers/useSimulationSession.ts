import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { MapProjectionRequest, WorkbenchProjection } from '../../projection'
import type { SimulationEvent, StatisticSample } from '../../simulation/domain/types'
import { mergeWorkbenchProjection } from '../projectionFrame'
import type { SimulationResponse } from '../../runtime/contracts'
import type { SimulationWorkerClient } from '../../worker/client'

export type SimulationSessionPort = Pick<SimulationWorkerClient, 'subscribe' | 'dispose' | 'create' | 'step' | 'play' | 'pause' | 'setSpeed' | 'setViewport' | 'reset' | 'materializeCohort' | 'dematerializePeople'>
export type SessionStatus = 'starting' | 'idle' | 'paused' | 'playing'

export interface SimulationSessionState {
  projection?: WorkbenchProjection
  status: SessionStatus
  speed: number
  events: SimulationEvent[]
  statistics: StatisticSample[]
  processingMs: number
  error?: string
}

export type SimulationSessionAction =
  | { type: 'response'; response: SimulationResponse }
  | { type: 'clearTimeline' }
  | { type: 'dismissError' }

export const initialSimulationSessionState: SimulationSessionState = { status: 'starting', speed: 24, events: [], statistics: [], processingMs: 0 }

export function simulationSessionReducer(state: SimulationSessionState, action: SimulationSessionAction): SimulationSessionState {
  if (action.type === 'clearTimeline') return { ...state, events: [], statistics: [] }
  if (action.type === 'dismissError') return { ...state, error: undefined }
  const response = action.response
  if (response.type === 'FRAME') {
    const changedRun = state.projection !== undefined && state.projection.projectionEpoch !== response.projection.projectionEpoch
    const projection = { ...mergeWorkbenchProjection(state.projection, response.projection), digest: response.projection.digest ?? state.projection?.digest }
    return {
      ...state,
      projection,
      processingMs: response.processingMs,
      events: changedRun ? [...response.events].reverse() : response.events.length ? [...response.events].reverse().concat(state.events).slice(0, 150) : state.events,
      statistics: changedRun ? [...response.statistics] : response.statistics.length ? [...response.statistics, ...state.statistics].slice(0, 150) : state.statistics,
    }
  }
  if (response.type === 'STATUS') return { ...state, status: response.status, speed: response.ticksPerBatch }
  if (response.type === 'ERROR') return { ...state, status: 'paused', error: response.message }
  return state
}

export function useSimulationSession(client: SimulationSessionPort, initialSeed = 'valley-001') {
  const [state, dispatch] = useReducer(simulationSessionReducer, initialSimulationSessionState)
  const seedRef = useRef(initialSeed)
  const command = useCallback((operation: Promise<unknown>) => { void operation.catch((reason) => dispatch({ type: 'response', response: { type: 'ERROR', message: messageOf(reason) } })) }, [])

  useEffect(() => {
    const unsubscribe = client.subscribe((response) => {
      if (response.type === 'READY') command(client.create(seedRef.current))
      else if (response.type === 'FRAME' || response.type === 'STATUS' || response.type === 'ERROR') dispatch({ type: 'response', response })
    })
    return createSessionDisposer(client, unsubscribe)
  }, [client, command])

  const setSeed = useCallback((seed: string) => { seedRef.current = seed }, [])
  const clearTimeline = useCallback(() => dispatch({ type: 'clearTimeline' }), [])
  const dismissError = useCallback(() => dispatch({ type: 'dismissError' }), [])
  const step = useCallback((count = 1) => command(client.step(count)), [client, command])
  const play = useCallback(() => command(client.play(state.speed)), [client, command, state.speed])
  const pause = useCallback(() => command(client.pause()), [client, command])
  const changeSpeed = useCallback((speed: number) => command(client.setSpeed(speed)), [client, command])
  const requestViewport = useCallback((viewport: MapProjectionRequest) => command(client.setViewport(viewport)), [client, command])
  const reset = useCallback(() => command(client.reset()), [client, command])
  const materializeCohort = useCallback((cohortId: string, count: number) => command(client.materializeCohort(cohortId, count)), [client, command])
  const dematerializePeople = useCallback((personIds: string[]) => command(client.dematerializePeople(personIds)), [client, command])

  return {
    ...state,
    selectedRunId: state.projection?.runId,
    setSeed,
    clearTimeline,
    dismissError,
    step,
    play,
    pause,
    changeSpeed,
    requestViewport,
    reset,
    materializeCohort,
    dematerializePeople,
  }
}

export function createSessionDisposer(client: Pick<SimulationSessionPort, 'dispose'>, unsubscribe: () => void): () => void {
  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    unsubscribe()
    client.dispose()
  }
}

function messageOf(reason: unknown): string { return reason instanceof Error ? reason.message : String(reason) }
