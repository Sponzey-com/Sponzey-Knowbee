import { afterEach, describe, expect, it, vi } from "vitest"
import { api } from "../packages/webui/src/api/client"
import { initialResourceReadState } from "../packages/webui/src/lib/resource-read-state"
import { useRunsStore } from "../packages/webui/src/stores/runs"

const originalWorkSnapshot = api.workSnapshot

afterEach(() => {
  api.workSnapshot = originalWorkSnapshot
  vi.restoreAllMocks()
})

function resetStore(): void {
  useRunsStore.setState({
    initialized: false,
    loading: false,
    readState: initialResourceReadState(),
    runs: [],
    executionOutcomes: {},
    tasks: [],
    operationsSummary: null,
    selectedRunId: null,
  })
}

function snapshot(observedAt: number) {
  return {
    observedAt,
    runs: [],
    executionOutcomes: {
      "run:verified": {
        executionStatus: "blocked",
        deliveryStatus: "delivered",
      },
    },
    activeRunProjections: [],
    tasks: [],
    operationsSummary: {
      generatedAt: observedAt,
      totalRuns: 0,
      stale: { total: 0, queued: 0, running: 0, awaitingApproval: 0, awaitingUser: 0 },
    },
  } as Awaited<ReturnType<typeof api.workSnapshot>>
}

describe("Task050 Runs store read state", () => {
  it("preserves a verified snapshot and marks it stale after refresh failure", async () => {
    resetStore()
    api.workSnapshot = vi
      .fn()
      .mockResolvedValueOnce(snapshot(100))
      .mockRejectedValueOnce(new Error("stack /Users/private token=secret"))

    await useRunsStore.getState().ensureInitialized(true)
    const verifiedRuns = useRunsStore.getState().runs
    expect(useRunsStore.getState().readState.status).toBe("ready")
    expect(useRunsStore.getState().executionOutcomes).toEqual({
      "run:verified": {
        executionStatus: "blocked",
        deliveryStatus: "delivered",
      },
    })

    await useRunsStore.getState().refresh()
    const state = useRunsStore.getState()
    expect(state.readState.status).toBe("stale")
    expect(state.readState.observedAt).toBe(100)
    expect(state.runs).toBe(verifiedRuns)
    expect(JSON.stringify(state.readState)).not.toMatch(/Users|private|secret|stack/u)
  })

  it("marks the first failed read as failed instead of empty ready data", async () => {
    resetStore()
    api.workSnapshot = vi.fn().mockRejectedValue(new Error("network raw body"))
    await useRunsStore.getState().ensureInitialized(true)
    expect(useRunsStore.getState().readState).toMatchObject({
      status: "failed",
      data: null,
      observedAt: null,
    })
  })
})
