import { beforeEach, describe, expect, it, vi } from "vitest"
import { UiRequestFailure } from "../packages/webui/src/api/request-failure.ts"

const { mockApi, mockRefreshCapabilities, mockRefreshConnection, mockSetDisconnected } = vi.hoisted(
  () => ({
    mockApi: {
      saveSetupDraft: vi.fn(),
      setupChecks: vi.fn(),
      restartChannels: vi.fn(),
    },
    mockRefreshCapabilities: vi.fn(),
    mockRefreshConnection: vi.fn(),
    mockSetDisconnected: vi.fn(),
  }),
)

vi.mock("../packages/webui/src/api/client", () => ({ api: mockApi }))
vi.mock("../packages/webui/src/stores/connection", () => ({
  useConnectionStore: {
    getState: () => ({
      refresh: mockRefreshConnection,
      setDisconnected: mockSetDisconnected,
    }),
  },
}))
vi.mock("../packages/webui/src/stores/capabilities", () => ({
  useCapabilitiesStore: {
    getState: () => ({ refresh: mockRefreshCapabilities }),
  },
}))

import { useSetupStore } from "../packages/webui/src/stores/setup.ts"

describe("task047 setup save lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const current = useSetupStore.getState()
    useSetupStore.setState({
      ...current,
      draft: structuredClone(current.draft),
      saving: false,
      lastError: "",
      lastSavedAt: null,
      saveRecovery: null,
    })
  })

  it("restores the authoritative snapshot and exposes only structured recovery", async () => {
    const persisted = structuredClone(useSetupStore.getState().draft)
    persisted.personal.profileName = "persisted"
    persisted.personal.displayName = "persisted"
    useSetupStore.setState({ draft: persisted })
    const attempted = structuredClone(persisted)
    attempted.personal.profileName = "unsaved"
    attempted.personal.displayName = "unsaved"
    mockApi.saveSetupDraft.mockRejectedValueOnce(
      new UiRequestFailure({
        status: 503,
        reasonCode: "private_save_adapter_503",
        safeMessage: null,
      }),
    )

    const success = await useSetupStore.getState().saveDraftSnapshot(attempted)

    expect(success).toBe(false)
    expect(useSetupStore.getState().draft.personal.profileName).toBe("persisted")
    expect(useSetupStore.getState().saving).toBe(false)
    expect(useSetupStore.getState().lastError).toBe("")
    expect(useSetupStore.getState().saveRecovery).toMatchObject({
      kind: "unavailable",
      action: "refresh_state",
    })
    expect(mockSetDisconnected).not.toHaveBeenCalled()
  })

  it("uses the server response as the stored snapshot before the page revalidates it", async () => {
    const attempted = structuredClone(useSetupStore.getState().draft)
    attempted.personal.profileName = "requested"
    attempted.personal.displayName = "requested"
    const normalized = structuredClone(attempted)
    normalized.personal.profileName = "normalized"
    normalized.personal.displayName = "normalized"
    mockApi.saveSetupDraft.mockResolvedValueOnce({
      draft: normalized,
      state: useSetupStore.getState().state,
    })
    mockApi.setupChecks.mockResolvedValueOnce(null)

    const success = await useSetupStore.getState().saveDraftSnapshot(attempted)

    expect(success).toBe(true)
    expect(useSetupStore.getState().draft.personal.profileName).toBe("normalized")
    expect(useSetupStore.getState().lastSavedAt).not.toBeNull()
  })

  it("discards an obsolete save completion that resolves after the latest command", async () => {
    const initial = structuredClone(useSetupStore.getState().draft)
    const firstAttempt = structuredClone(initial)
    firstAttempt.personal.profileName = "first"
    firstAttempt.personal.displayName = "first"
    const secondAttempt = structuredClone(initial)
    secondAttempt.personal.profileName = "second"
    secondAttempt.personal.displayName = "second"
    let resolveFirst: ((value: unknown) => void) | undefined
    let resolveSecond: ((value: unknown) => void) | undefined
    mockApi.saveSetupDraft
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve
          }),
      )
    mockApi.setupChecks.mockResolvedValue(null)

    const first = useSetupStore.getState().saveDraftSnapshot(firstAttempt)
    const second = useSetupStore.getState().saveDraftSnapshot(secondAttempt)
    resolveSecond?.({ draft: secondAttempt, state: useSetupStore.getState().state })
    expect(await second).toBe(true)
    resolveFirst?.({ draft: firstAttempt, state: useSetupStore.getState().state })
    expect(await first).toBe(false)

    expect(useSetupStore.getState().draft.personal.profileName).toBe("second")
    expect(useSetupStore.getState().saveRecovery).toBeNull()
  })
})
