import type { SimulationEvent, SnapshotEnvelope, StatisticSample, WorldProjection } from '../simulation/domain/types'

export type SimulationCommand =
  | { type: 'CREATE_RUN'; requestId: string; seed: string }
  | { type: 'LOAD_RUN'; requestId: string; snapshot: SnapshotEnvelope }
  | { type: 'STEP'; requestId: string; count?: number }
  | { type: 'PLAY'; requestId: string; ticksPerBatch: number }
  | { type: 'PAUSE'; requestId: string }
  | { type: 'SET_SPEED'; requestId: string; ticksPerBatch: number }
  | { type: 'REQUEST_SNAPSHOT'; requestId: string }
  | { type: 'RESET'; requestId: string }
  | { type: 'DISPOSE'; requestId: string }

export type SimulationResponse =
  | { type: 'READY' }
  | { type: 'FRAME'; requestId?: string; projection: WorldProjection; events: SimulationEvent[]; statistics: StatisticSample[]; processingMs: number }
  | { type: 'STATUS'; requestId?: string; status: 'idle' | 'paused' | 'playing'; ticksPerBatch: number }
  | { type: 'SNAPSHOT'; requestId: string; snapshot: SnapshotEnvelope }
  | { type: 'ERROR'; requestId?: string; message: string; stack?: string }

export function requestId(): string {
  return `${Date.now().toString(36)}-${crypto.getRandomValues(new Uint32Array(1))[0]?.toString(36)}`
}
