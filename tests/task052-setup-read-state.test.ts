import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockApi, mockSetDisconnected } = vi.hoisted(() => ({
  mockApi: {
    setupStatus: vi.fn(),
    setupDraft: vi.fn(),
    setupChecks: vi.fn(),
  },
  mockSetDisconnected: vi.fn(),
}))

vi.mock("../packages/webui/src/api/client", () => ({ api: mockApi }))
vi.mock("../packages/webui/src/stores/connection", () => ({
  useConnectionStore: {
    getState: () => ({ refresh: vi.fn(), setDisconnected: mockSetDisconnected }),
  },
}))
vi.mock("../packages/webui/src/stores/capabilities", () => ({
  useCapabilitiesStore: { getState: () => ({ refresh: vi.fn() }) },
}))

import { initialResourceReadState } from "../packages/webui/src/lib/resource-read-state.ts"
import { useSetupStore } from "../packages/webui/src/stores/setup.ts"

function serverDraft(profileName: string) {
  const draft = structuredClone(useSetupStore.getState().draft)
  draft.personal.profileName = profileName
  draft.personal.displayName = profileName
  return draft
}

function serverState(completed = true) {
  return {
    ...useSetupStore.getState().state,
    completed,
    currentStep: completed ? "done" : "welcome",
  }
}

const checks = { setupCompleted: true, schedulerEnabled: true }

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

describe("Task052 setup read states", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const current = useSetupStore.getState()
    useSetupStore.setState({
      state: { ...current.state, completed: false, currentStep: "welcome" },
      draft: serverDraft("preserved"),
      checks: null,
      coreReadState: initialResourceReadState(),
      checksReadState: initialResourceReadState(),
      initialized: false,
      loading: false,
      checksLoading: false,
      lastError: "command_failure_must_survive",
    })
  })

  it("accepts the atomic core while checks fail independently", async () => {
    mockApi.setupStatus.mockResolvedValueOnce(serverState())
    mockApi.setupDraft.mockResolvedValueOnce(serverDraft("authoritative"))
    mockApi.setupChecks.mockRejectedValueOnce(new Error("stack /private/checks"))

    await useSetupStore.getState().initialize(true)

    const result = useSetupStore.getState()
    expect(result.coreReadState.status).toBe("ready")
    expect(result.checksReadState.status).toBe("failed")
    expect(result.draft.personal.profileName).toBe("authoritative")
    expect(result.checks).toBeNull()
    expect(result.lastError).toBe("command_failure_must_survive")
    expect(mockSetDisconnected).not.toHaveBeenCalled()
  })

  it("preserves existing core fields when one atomic core request fails", async () => {
    mockApi.setupStatus.mockRejectedValueOnce(new Error("token=secret /private/status"))
    mockApi.setupDraft.mockResolvedValueOnce(serverDraft("must-not-apply"))
    mockApi.setupChecks.mockResolvedValueOnce(checks)

    await useSetupStore.getState().initialize(true)

    const result = useSetupStore.getState()
    expect(result.coreReadState.status).toBe("failed")
    expect(result.checksReadState.status).toBe("ready")
    expect(result.draft.personal.profileName).toBe("preserved")
    expect(result.checks).toEqual(checks)
    expect(result.coreReadState.failure?.reasonCode).toBe("request_failed")
    expect(mockSetDisconnected).not.toHaveBeenCalled()
  })

  it("keeps verified core and checks snapshots stale after refresh failure", async () => {
    mockApi.setupStatus.mockResolvedValueOnce(serverState())
    mockApi.setupDraft.mockResolvedValueOnce(serverDraft("verified"))
    mockApi.setupChecks.mockResolvedValueOnce(checks)
    await useSetupStore.getState().initialize(true)

    mockApi.setupStatus.mockRejectedValueOnce(new Error("core unavailable"))
    mockApi.setupDraft.mockResolvedValueOnce(serverDraft("discarded"))
    mockApi.setupChecks.mockRejectedValueOnce(new Error("checks unavailable"))
    await useSetupStore.getState().initialize(true)

    const result = useSetupStore.getState()
    expect(result.coreReadState.status).toBe("stale")
    expect(result.checksReadState.status).toBe("stale")
    expect(result.draft.personal.profileName).toBe("verified")
    expect(result.coreReadState.data?.draft.personal.profileName).toBe("verified")
    expect(result.checks).toEqual(checks)
    expect(result.checksReadState.data).toEqual(checks)
    expect(mockSetDisconnected).not.toHaveBeenCalled()
  })

  it("refreshes checks without changing command errors or the core", async () => {
    const preservedCore = useSetupStore.getState().coreReadState
    mockApi.setupChecks.mockRejectedValueOnce(new Error("checks unavailable"))

    await useSetupStore.getState().refreshChecks(true)

    const result = useSetupStore.getState()
    expect(result.coreReadState).toBe(preservedCore)
    expect(result.checksReadState.status).toBe("failed")
    expect(result.lastError).toBe("command_failure_must_survive")
    expect(mockSetDisconnected).not.toHaveBeenCalled()
  })

  it("rejects obsolete core and checks responses from an older forced read", async () => {
    const oldStatus = deferred<ReturnType<typeof serverState>>()
    const oldDraft = deferred<ReturnType<typeof serverDraft>>()
    const oldChecks = deferred<typeof checks>()
    const latestStatus = deferred<ReturnType<typeof serverState>>()
    const latestDraft = deferred<ReturnType<typeof serverDraft>>()
    const latestChecks = deferred<typeof checks>()
    mockApi.setupStatus
      .mockReturnValueOnce(oldStatus.promise)
      .mockReturnValueOnce(latestStatus.promise)
    mockApi.setupDraft
      .mockReturnValueOnce(oldDraft.promise)
      .mockReturnValueOnce(latestDraft.promise)
    mockApi.setupChecks
      .mockReturnValueOnce(oldChecks.promise)
      .mockReturnValueOnce(latestChecks.promise)

    const olderRead = useSetupStore.getState().initialize(true)
    const latestRead = useSetupStore.getState().initialize(true)
    latestStatus.resolve(serverState(true))
    latestDraft.resolve(serverDraft("latest"))
    latestChecks.resolve({ setupCompleted: true, schedulerEnabled: true })
    await latestRead
    oldStatus.resolve(serverState(false))
    oldDraft.resolve(serverDraft("obsolete"))
    oldChecks.resolve({ setupCompleted: false, schedulerEnabled: false })
    await olderRead

    const result = useSetupStore.getState()
    expect(result.draft.personal.profileName).toBe("latest")
    expect(result.state.completed).toBe(true)
    expect(result.checks).toEqual({ setupCompleted: true, schedulerEnabled: true })
    expect(result.coreReadState.status).toBe("ready")
    expect(result.checksReadState.status).toBe("ready")
  })
})
