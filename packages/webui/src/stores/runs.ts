import { create } from "zustand"
import { api } from "../api/client"
import type { OperationsSummary, StaleRunCleanupResult } from "../contracts/operations"
import type { RequestExecutionOutcome, RootRun } from "../contracts/runs"
import type { TaskModel } from "../contracts/tasks"
import {
  type ResourceReadState,
  initialResourceReadState,
  reduceResourceReadState,
} from "../lib/resource-read-state"
import { projectUserRecovery } from "../lib/user-recovery"

type WorkSnapshotMarker = { snapshot: true }

interface RunsState {
  initialized: boolean
  loading: boolean
  readState: ResourceReadState<WorkSnapshotMarker>
  runs: RootRun[]
  executionOutcomes: Record<string, RequestExecutionOutcome>
  tasks: TaskModel[]
  operationsSummary: OperationsSummary | null
  selectedRunId: string | null
  ensureInitialized: (force?: boolean) => Promise<void>
  refresh: () => Promise<void>
  refreshOperations: () => Promise<void>
  selectRun: (runId: string) => void
  createRun: (
    message: string,
    sessionId?: string,
    focusThreadId?: string,
  ) => ReturnType<typeof api.createRun>
  cancelRun: (runId: string) => Promise<void>
  deleteRunHistory: (runId: string) => Promise<{ deletedRunCount: number }>
  clearHistoricalRunHistory: () => Promise<{ deletedRunCount: number }>
  cleanupStaleRuns: () => Promise<StaleRunCleanupResult>
  upsertRun: (run: RootRun) => void
  replaceRun: (run: RootRun) => void
}

function sortRuns(runs: RootRun[]): RootRun[] {
  return [...runs].sort((a, b) => b.createdAt - a.createdAt || b.updatedAt - a.updatedAt)
}

function sortTasks(tasks: TaskModel[]): TaskModel[] {
  return [...tasks].sort((a, b) => b.createdAt - a.createdAt || b.updatedAt - a.updatedAt)
}

function resolveSelectedRunId(params: {
  currentSelectedRunId: string | null
  tasks: TaskModel[]
  runs: RootRun[]
}): string | null {
  const { currentSelectedRunId, tasks, runs } = params
  if (!currentSelectedRunId) return tasks[0]?.id ?? runs[0]?.id ?? null

  const hasMatchingTask = tasks.some(
    (task) => task.id === currentSelectedRunId || task.latestAttemptId === currentSelectedRunId,
  )
  if (hasMatchingTask) return currentSelectedRunId

  const hasMatchingRun = runs.some((run) => run.id === currentSelectedRunId)
  if (hasMatchingRun) return currentSelectedRunId

  return tasks[0]?.id ?? runs[0]?.id ?? null
}

export const useRunsStore = create<RunsState>((set, get) => {
  let refreshTasksTimer: ReturnType<typeof setTimeout> | null = null
  let latestWorkSnapshotToken = 0
  let latestOperationsSnapshotToken = 0

  async function refreshOperationsSnapshot(): Promise<void> {
    const operationsSnapshotToken = ++latestOperationsSnapshotToken
    const response = await api.runOperationsSummary()
    if (operationsSnapshotToken !== latestOperationsSnapshotToken) return
    set({ operationsSummary: response.summary })
  }

  async function refreshTasksSnapshot(): Promise<void> {
    const workSnapshotToken = ++latestWorkSnapshotToken
    set((state) => ({
      readState: reduceResourceReadState(state.readState, { type: "load_started" }),
    }))
    try {
      const response = await api.workSnapshot()
      if (workSnapshotToken !== latestWorkSnapshotToken) return
      set((state) => ({
        runs: sortRuns(response.runs),
        executionOutcomes: response.executionOutcomes ?? {},
        tasks: sortTasks(response.tasks),
        operationsSummary: response.operationsSummary,
        selectedRunId: resolveSelectedRunId({
          currentSelectedRunId: state.selectedRunId,
          tasks: response.tasks,
          runs: response.runs,
        }),
        readState: reduceResourceReadState(state.readState, {
          type: "load_succeeded",
          data: { snapshot: true },
          observedAt: response.observedAt,
        }),
      }))
    } catch (error) {
      if (workSnapshotToken !== latestWorkSnapshotToken) return
      const failure = projectUserRecovery(error, "read")
      set((state) => ({
        readState: reduceResourceReadState(state.readState, { type: "load_failed", failure }),
      }))
    }
  }

  function queueTasksRefresh(): void {
    if (refreshTasksTimer) clearTimeout(refreshTasksTimer)
    refreshTasksTimer = setTimeout(() => {
      refreshTasksTimer = null
      void refreshTasksSnapshot()
    }, 50)
  }

  return {
    initialized: false,
    loading: false,
    readState: initialResourceReadState<WorkSnapshotMarker>(),
    runs: [],
    executionOutcomes: {},
    tasks: [],
    operationsSummary: null,
    selectedRunId: null,
    ensureInitialized: async (force = false) => {
      if (!force && (get().initialized || get().loading)) return
      const workSnapshotToken = ++latestWorkSnapshotToken
      set((state) => ({
        loading: true,
        readState: reduceResourceReadState(state.readState, { type: "load_started" }),
      }))
      try {
        const response = await api.workSnapshot()
        if (workSnapshotToken !== latestWorkSnapshotToken) return
        set({
          runs: sortRuns(response.runs),
          executionOutcomes: response.executionOutcomes ?? {},
          tasks: sortTasks(response.tasks),
          operationsSummary: response.operationsSummary,
          selectedRunId: resolveSelectedRunId({
            currentSelectedRunId: get().selectedRunId,
            tasks: response.tasks,
            runs: response.runs,
          }),
          initialized: true,
          loading: false,
          readState: reduceResourceReadState(get().readState, {
            type: "load_succeeded",
            data: { snapshot: true },
            observedAt: response.observedAt,
          }),
        })
      } catch (error) {
        if (workSnapshotToken !== latestWorkSnapshotToken) return
        const failure = projectUserRecovery(error, "read")
        set((state) => ({
          loading: false,
          initialized: true,
          readState: reduceResourceReadState(state.readState, { type: "load_failed", failure }),
        }))
      }
    },
    refresh: async () => {
      await get().ensureInitialized(true)
    },
    refreshOperations: async () => {
      await refreshOperationsSnapshot()
    },
    selectRun: (runId) => set({ selectedRunId: runId }),
    createRun: async (message, sessionId, focusThreadId) => {
      const response = await api.createRun(message, sessionId, focusThreadId)
      set({ selectedRunId: response.runId })
      void get().refresh()
      return response
    },
    cancelRun: async (runId) => {
      const response = await api.cancelRun(runId)
      get().replaceRun(response.run)
    },
    deleteRunHistory: async (runId) => {
      const response = await api.deleteRunHistory(runId)
      set((state) => ({
        selectedRunId: state.selectedRunId === runId ? null : state.selectedRunId,
      }))
      await get().refresh()
      return { deletedRunCount: response.deletedRunCount }
    },
    clearHistoricalRunHistory: async () => {
      const response = await api.clearHistoricalRunHistory()
      await get().refresh()
      return { deletedRunCount: response.deletedRunCount }
    },
    cleanupStaleRuns: async () => {
      const response = await api.cleanupStaleRuns()
      set({ operationsSummary: response.summary })
      await get().refresh()
      return response.cleanup
    },
    upsertRun: (run) =>
      set((state) => {
        const exists = state.runs.some((item) => item.id === run.id)
        const runs = exists
          ? state.runs.map((item) => (item.id === run.id ? run : item))
          : [run, ...state.runs]
        const isNewRootTask = !exists && run.id === run.requestGroupId
        if (state.initialized) queueTasksRefresh()
        return {
          runs: sortRuns(runs),
          selectedRunId: isNewRootTask ? run.requestGroupId : (state.selectedRunId ?? run.id),
        }
      }),
    replaceRun: (run) =>
      set((state) => {
        if (state.initialized) queueTasksRefresh()
        return {
          runs: sortRuns(state.runs.map((item) => (item.id === run.id ? run : item))),
          selectedRunId: state.selectedRunId ?? run.id,
        }
      }),
  }
})

export function getSelectedRun(): RootRun | null {
  const state = useRunsStore.getState()
  return state.runs.find((run) => run.id === state.selectedRunId) ?? null
}
