export type WorkbenchCommandId = 'play' | 'pause' | 'step' | 'speed' | 'reset' | 'new-run' | 'save' | 'load' | 'export' | 'cancel'
export type WorkbenchCommandStatus = 'idle' | 'pending' | 'succeeded' | 'failed' | 'unavailable'

export interface WorkbenchCommandEntry {
  status: WorkbenchCommandStatus
  correlation: number
  error?: string
}

export type WorkbenchCommandState = Readonly<Record<WorkbenchCommandId, WorkbenchCommandEntry>>

export type WorkbenchCommandAction =
  | { type: 'submit'; command: WorkbenchCommandId; correlation: number }
  | { type: 'settle'; command: WorkbenchCommandId; correlation: number; succeeded: boolean; error?: string }
  | { type: 'availability'; command: WorkbenchCommandId; available: boolean }
  | { type: 'replace-run' }

const IDS: readonly WorkbenchCommandId[] = ['play', 'pause', 'step', 'speed', 'reset', 'new-run', 'save', 'load', 'export', 'cancel']

export const initialWorkbenchCommandState = Object.freeze(Object.fromEntries(IDS.map((id) => [id, { status: id === 'cancel' ? 'unavailable' : 'idle', correlation: 0 }])) as unknown as WorkbenchCommandState)

export function workbenchCommandReducer(state: WorkbenchCommandState, action: WorkbenchCommandAction): WorkbenchCommandState {
  if (action.type === 'replace-run') return initialWorkbenchCommandState
  const current = state[action.command]
  if (action.type === 'availability') return { ...state, [action.command]: { ...current, status: action.available ? 'idle' : 'unavailable', error: undefined } }
  if (action.type === 'submit') {
    if (current.status === 'pending' || current.status === 'unavailable') return state
    return { ...state, [action.command]: { status: 'pending', correlation: action.correlation } }
  }
  if (current.correlation !== action.correlation || current.status !== 'pending') return state
  return { ...state, [action.command]: { status: action.succeeded ? 'succeeded' : 'failed', correlation: action.correlation, error: action.succeeded ? undefined : action.error ?? 'Command failed' } }
}
