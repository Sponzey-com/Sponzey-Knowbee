import { create } from "zustand"
import type { SetupChecksResponse } from "../api/adapters/types"
import { api } from "../api/client"
import {
  type AIBackendCard,
  type NewAIBackendInput,
  type RoutingProfile,
  isBuiltinBackendId,
} from "../contracts/ai"
import type { SetupDraft, SetupState, SetupStepId } from "../contracts/setup"
import {
  type ResourceReadState,
  initialResourceReadState,
  reduceResourceReadState,
} from "../lib/resource-read-state"
import { type UserRecoveryProjection, projectUserRecovery } from "../lib/user-recovery"
import { useCapabilitiesStore } from "./capabilities"
import { useConnectionStore } from "./connection"

export interface SetupCoreSnapshot {
  state: SetupState
  draft: SetupDraft
}

interface SetupStore {
  state: SetupState
  draft: SetupDraft
  checks: SetupChecksResponse | null
  coreReadState: ResourceReadState<SetupCoreSnapshot>
  checksReadState: ResourceReadState<SetupChecksResponse>
  initialized: boolean
  loading: boolean
  saving: boolean
  checksLoading: boolean
  lastSavedAt: number | null
  lastError: string
  saveRecovery: UserRecoveryProjection | null
  initialize: (force?: boolean) => Promise<void>
  refreshChecks: (force?: boolean) => Promise<void>
  setStep: (step: SetupStepId) => void
  nextStep: () => void
  prevStep: () => void
  completeSetup: () => Promise<void>
  resetSetup: () => Promise<void>
  addBackend: (input: NewAIBackendInput) => void
  removeBackend: (backendId: string) => void
  updateBackend: (backendId: string, patch: Partial<AIBackendCard>) => void
  moveRoutingTarget: (profileId: RoutingProfile["id"], from: number, to: number) => void
  setRoutingTargetEnabled: (
    profileId: RoutingProfile["id"],
    backendId: string,
    enabled: boolean,
  ) => void
  patchSecurity: (patch: Partial<SetupDraft["security"]>) => void
  patchChannels: (patch: Partial<SetupDraft["channels"]>) => void
  patchRemoteAccess: (patch: Partial<SetupDraft["remoteAccess"]>) => void
  saveDraftSnapshot: (
    draft: SetupDraft,
    options?: { syncChannelRuntime?: boolean },
  ) => Promise<boolean>
  setSaveRecovery: (recovery: UserRecoveryProjection | null) => void
}

const STEP_ORDER: SetupStepId[] = [
  "welcome",
  "personal",
  "ai_backends",
  "mcp",
  "skills",
  "security",
  "channels",
  "remote_access",
  "review",
  "done",
]

let persistTimer: ReturnType<typeof setTimeout> | null = null
let pendingChannelRuntimeSync = false
let saveSequence = 0

function normalizeSetupStep(step: SetupStepId): SetupStepId {
  if (step === "ai_routing") return "mcp"
  return step
}

function toBackendSlug(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "custom_backend"
  )
}

function createBackendId(kind: AIBackendCard["kind"], label: string, existingIds: string[]) {
  const base = `${kind}:${toBackendSlug(label)}`
  if (!existingIds.includes(base)) return base

  let index = 2
  while (existingIds.includes(`${base}_${index}`)) {
    index += 1
  }
  return `${base}_${index}`
}

async function persistSetupSnapshot(snapshot?: {
  draft?: SetupDraft
  state?: SetupState
  syncChannelRuntime?: boolean
}): Promise<boolean> {
  const currentSaveSequence = ++saveSequence
  const current = useSetupStore.getState()
  const previousDraft = current.draft
  const draft = snapshot?.draft ?? current.draft
  const state = snapshot?.state ?? current.state
  if (snapshot?.draft) {
    useSetupStore.setState({ draft })
  }
  useSetupStore.setState({ saving: true, lastError: "", saveRecovery: null })
  try {
    const response = await api.saveSetupDraft({ draft, state })
    if (currentSaveSequence !== saveSequence) return false
    let runtimeRecovery: UserRecoveryProjection | null = null
    const shouldSyncChannelRuntime = snapshot?.syncChannelRuntime ?? pendingChannelRuntimeSync
    if (shouldSyncChannelRuntime) {
      pendingChannelRuntimeSync = false
      try {
        await api.restartChannels()
      } catch (error) {
        runtimeRecovery = projectUserRecovery(error, "mutation")
      }
    }
    let checks: SetupChecksResponse | null = useSetupStore.getState().checks
    try {
      checks = await api.setupChecks()
    } catch {
      // Keep the previous checks snapshot when the save succeeded but the refresh did not.
    }
    if (currentSaveSequence !== saveSequence) return false
    useSetupStore.setState({
      draft: response.draft,
      state: response.state,
      checks,
      initialized: true,
      saving: false,
      lastSavedAt: Date.now(),
      lastError: "",
      saveRecovery: runtimeRecovery,
    })
    void useConnectionStore.getState().refresh()
    void useCapabilitiesStore.getState().refresh()
    return true
  } catch (error) {
    if (currentSaveSequence !== saveSequence) return false
    useSetupStore.setState({
      draft: previousDraft,
      saving: false,
      lastError: "",
      saveRecovery: projectUserRecovery(error, "mutation"),
    })
    return false
  }
}

function queuePersist() {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    void persistSetupSnapshot()
  }, 250)
}

function setDraftAndPersist(draft: SetupDraft) {
  useSetupStore.setState({ draft })
  queuePersist()
}

function setStateAndPersist(state: SetupState) {
  useSetupStore.setState({ state })
  queuePersist()
}

function createInitialSetupState(): SetupState {
  return {
    version: 1,
    completed: false,
    currentStep: "welcome",
    skipped: {
      telegram: false,
      remoteAccess: false,
    },
  }
}

function createInitialSetupDraft(): SetupDraft {
  return {
    personal: {
      profileName: "",
      displayName: "",
      language: "ko",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      workspace: "",
    },
    mainAgent: {
      name: "노비",
    },
    aiBackends: [],
    routingProfiles: [],
    mcp: {
      servers: [],
    },
    skills: {
      items: [],
    },
    security: {
      approvalMode: "on-miss",
      approvalTimeout: 60,
      approvalTimeoutFallback: "deny",
      maxDelegationTurns: 0,
    },
    channels: {
      telegramEnabled: false,
      botToken: "",
      allowedUserIds: "",
      allowedGroupIds: "",
      slackEnabled: false,
      slackBotToken: "",
      slackAppToken: "",
      slackAllowedUserIds: "",
      slackAllowedChannelIds: "",
      discordEnabled: false,
      discordBotToken: "",
      discordApplicationId: "",
      discordPublicKey: "",
      discordAllowedUserIds: "",
      discordAllowedGuildIds: "",
      discordAllowedChannelIds: "",
      discordGrantedIntents: "",
      discordBotPermissions: "",
      discordInstalledGuildIds: "",
      discordLargeGuildMode: false,
      googleChatEnabled: false,
      googleChatProjectId: "",
      googleChatAppCredentialJson: "",
      googleChatServiceAccountEmail: "",
      googleChatWebhookUrl: "",
      googleChatVerificationToken: "",
      googleChatAllowedUserIds: "",
      googleChatAllowedSpaceIds: "",
      googleChatDeployedSpaceIds: "",
      googleChatGrantedScopes: "",
      googleChatAppPublished: false,
      googleChatDomainWideDelegation: false,
      imessageEnabled: false,
      imessageMode: "manual_confirm",
      imessageLocalBridgeEnabled: false,
      imessageYeonjangBridgeEnabled: false,
      imessageRiskAcknowledged: false,
      imessageMessagesAppAvailable: false,
      imessageUserSessionActive: false,
      imessageAutomationPermissionGranted: false,
      imessageAllowedRecipientIds: "",
      imessageManualConfirmationRequired: true,
      kakaoTalkEnabled: false,
      kakaoTalkMode: "local_bridge",
      kakaoTalkBusinessApiEnabled: false,
      kakaoTalkBusinessApiKey: "",
      kakaoTalkChannelId: "",
      kakaoTalkLocalBridgeEnabled: false,
      kakaoTalkYeonjangBridgeEnabled: false,
      kakaoTalkRiskAcknowledged: false,
      kakaoTalkAppAvailable: false,
      kakaoTalkUserSessionActive: false,
      kakaoTalkAutomationPermissionGranted: false,
      kakaoTalkAllowedUserIds: "",
      kakaoTalkAllowedRoomIds: "",
      kakaoTalkManualConfirmationRequired: true,
      kakaoTalkRateLimitPerMinute: 6,
    },
    mqtt: {
      enabled: false,
      host: "0.0.0.0",
      port: 1883,
      username: "",
      password: "",
    },
    remoteAccess: {
      authEnabled: false,
      authToken: "",
      host: "127.0.0.1",
      port: 18888,
    },
    subAgents: {
      orchestrationEnabled: false,
      items: [],
      runtimeActiveAgentIds: [],
      lastRuntimeSeenAtByAgentId: {},
    },
  }
}

interface SetupStoreClock {
  now(): number
}

function createSetupStore(clock: SetupStoreClock) {
  let coreReadSequence = 0
  let checksReadSequence = 0
  return create<SetupStore>((set, get) => ({
    state: createInitialSetupState(),
    draft: createInitialSetupDraft(),
    checks: null,
    coreReadState: initialResourceReadState(),
    checksReadState: initialResourceReadState(),
    initialized: false,
    loading: false,
    saving: false,
    checksLoading: false,
    lastSavedAt: null,
    lastError: "",
    saveRecovery: null,
    setSaveRecovery: (recovery) => set({ saveRecovery: recovery }),
    initialize: async (force = false) => {
      if (!force && (get().initialized || get().loading)) return
      const currentCoreSequence = ++coreReadSequence
      const currentChecksSequence = ++checksReadSequence
      set((current) => ({
        loading: true,
        checksLoading: true,
        coreReadState: reduceResourceReadState(current.coreReadState, { type: "load_started" }),
        checksReadState: reduceResourceReadState(current.checksReadState, {
          type: "load_started",
        }),
      }))
      const [coreResult, checksResult] = await Promise.allSettled([
        Promise.all([api.setupStatus(), api.setupDraft()]),
        api.setupChecks(),
      ])
      const observedAt = clock.now()
      if (currentCoreSequence === coreReadSequence) {
        if (coreResult.status === "fulfilled") {
          const [state, draft] = coreResult.value
          const normalizedState = {
            ...state,
            currentStep: normalizeSetupStep(state.currentStep),
          }
          const snapshot = { state: normalizedState, draft }
          set((current) => ({
            state: normalizedState,
            draft,
            coreReadState: reduceResourceReadState(current.coreReadState, {
              type: "load_succeeded",
              data: snapshot,
              observedAt,
            }),
            initialized: true,
            loading: false,
          }))
        } else {
          set((current) => ({
            coreReadState: reduceResourceReadState(current.coreReadState, {
              type: "load_failed",
              failure: projectUserRecovery(coreResult.reason, "read"),
            }),
            initialized: true,
            loading: false,
          }))
        }
      }
      if (currentChecksSequence === checksReadSequence) {
        if (checksResult.status === "fulfilled") {
          const checks = checksResult.value
          set((current) => ({
            checks,
            checksReadState: reduceResourceReadState(current.checksReadState, {
              type: "load_succeeded",
              data: checks,
              observedAt,
            }),
            checksLoading: false,
          }))
        } else {
          set((current) => ({
            checksReadState: reduceResourceReadState(current.checksReadState, {
              type: "load_failed",
              failure: projectUserRecovery(checksResult.reason, "read"),
            }),
            checksLoading: false,
          }))
        }
      }
    },
    refreshChecks: async (force = false) => {
      if (!force && (get().checks !== null || get().checksLoading)) return
      const currentSequence = ++checksReadSequence
      set((current) => ({
        checksLoading: true,
        checksReadState: reduceResourceReadState(current.checksReadState, {
          type: "load_started",
        }),
      }))
      try {
        const checks = await api.setupChecks()
        if (currentSequence !== checksReadSequence) return
        set((current) => ({
          checks,
          checksLoading: false,
          checksReadState: reduceResourceReadState(current.checksReadState, {
            type: "load_succeeded",
            data: checks,
            observedAt: clock.now(),
          }),
        }))
      } catch (cause) {
        if (currentSequence !== checksReadSequence) return
        set((current) => ({
          checksLoading: false,
          checksReadState: reduceResourceReadState(current.checksReadState, {
            type: "load_failed",
            failure: projectUserRecovery(cause, "read"),
          }),
        }))
      }
    },
    setStep: (step) => {
      const normalized = normalizeSetupStep(step)
      const nextStep = normalized === "done" && !get().state.completed ? "review" : normalized
      setStateAndPersist({ ...get().state, currentStep: nextStep })
    },
    nextStep: () => {
      const currentIndex = STEP_ORDER.indexOf(normalizeSetupStep(get().state.currentStep))
      const nextStep = STEP_ORDER[Math.min(currentIndex + 1, STEP_ORDER.length - 1)] ?? "done"
      setStateAndPersist({ ...get().state, currentStep: nextStep })
    },
    prevStep: () => {
      const currentIndex = STEP_ORDER.indexOf(normalizeSetupStep(get().state.currentStep))
      const nextStep = STEP_ORDER[Math.max(currentIndex - 1, 0)] ?? "welcome"
      setStateAndPersist({ ...get().state, currentStep: nextStep })
    },
    completeSetup: async () => {
      await persistSetupSnapshot()
      try {
        const state = await api.completeSetup()
        let checks: SetupChecksResponse | null = get().checks
        try {
          checks = await api.setupChecks()
        } catch {
          // Preserve the last known checks snapshot on post-complete refresh failure.
        }
        set({ state: { ...state, currentStep: "done" }, checks, lastError: "", saveRecovery: null })
        void useConnectionStore.getState().refresh()
        void useCapabilitiesStore.getState().refresh()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        useConnectionStore.getState().setDisconnected(message)
        set({ lastError: message })
      }
    },
    resetSetup: async () => {
      set({ saving: true, lastError: "", saveRecovery: null })
      try {
        const response = await api.resetSetup()
        set({
          state: response.state,
          draft: response.draft,
          checks: response.checks,
          initialized: true,
          saving: false,
          checksLoading: false,
          lastSavedAt: Date.now(),
          lastError: "",
          saveRecovery: null,
        })
        void useConnectionStore.getState().refresh()
        void useCapabilitiesStore.getState().refresh()
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        useConnectionStore.getState().setDisconnected(message)
        set({ saving: false, lastError: message })
      }
    },
    addBackend: (input) => {
      const draft = get().draft
      const backendId = createBackendId(
        input.kind,
        input.label,
        draft.aiBackends.map((backend) => backend.id),
      )
      const backend: AIBackendCard = {
        id: backendId,
        label: input.label.trim(),
        kind: input.kind,
        providerType: input.providerType,
        authMode: input.authMode ?? "api_key",
        credentials: { ...input.credentials },
        local: input.local,
        enabled: false,
        availableModels: input.availableModels,
        defaultModel: input.defaultModel.trim(),
        status: "disabled",
        summary: input.summary.trim(),
        tags: input.tags,
        endpoint: input.endpoint?.trim() || undefined,
      }

      setDraftAndPersist({
        ...draft,
        aiBackends: [...draft.aiBackends, backend],
        routingProfiles: draft.routingProfiles.map((profile) =>
          profile.id === "default"
            ? { ...profile, targets: [...profile.targets, backendId] }
            : profile,
        ),
      })
    },
    removeBackend: (backendId) => {
      if (isBuiltinBackendId(backendId)) return
      const draft = get().draft
      setDraftAndPersist({
        ...draft,
        aiBackends: draft.aiBackends.filter((backend) => backend.id !== backendId),
        routingProfiles: draft.routingProfiles.map((profile) => ({
          ...profile,
          targets: profile.targets.filter((target) => target !== backendId),
        })),
      })
    },
    updateBackend: (backendId, patch) => {
      const draft = get().draft
      setDraftAndPersist({
        ...draft,
        aiBackends: draft.aiBackends.map((backend) =>
          backend.id === backendId ? { ...backend, ...patch } : backend,
        ),
      })
    },
    moveRoutingTarget: (profileId, from, to) => {
      const draft = get().draft
      setDraftAndPersist({
        ...draft,
        routingProfiles: draft.routingProfiles.map((profile) => {
          if (profile.id !== profileId) return profile
          const nextTargets = [...profile.targets]
          const source = nextTargets[from]
          if (source === undefined || to < 0 || to >= nextTargets.length) return profile
          nextTargets.splice(from, 1)
          nextTargets.splice(to, 0, source)
          return { ...profile, targets: nextTargets }
        }),
      })
    },
    setRoutingTargetEnabled: (profileId, backendId, enabled) => {
      const draft = get().draft
      setDraftAndPersist({
        ...draft,
        routingProfiles: draft.routingProfiles.map((profile) => {
          if (profile.id !== profileId) return profile
          const hasTarget = profile.targets.includes(backendId)
          if (enabled && !hasTarget) {
            return { ...profile, targets: [...profile.targets, backendId] }
          }
          if (!enabled && hasTarget) {
            return { ...profile, targets: profile.targets.filter((target) => target !== backendId) }
          }
          return profile
        }),
      })
    },
    patchSecurity: (patch) => {
      const draft = get().draft
      setDraftAndPersist({
        ...draft,
        security: { ...draft.security, ...patch },
      })
    },
    patchChannels: (patch) => {
      const draft = get().draft
      if (Object.prototype.hasOwnProperty.call(patch, "telegramEnabled")) {
        pendingChannelRuntimeSync = true
      }
      if (Object.prototype.hasOwnProperty.call(patch, "slackEnabled")) {
        pendingChannelRuntimeSync = true
      }
      if (Object.prototype.hasOwnProperty.call(patch, "discordEnabled")) {
        pendingChannelRuntimeSync = true
      }
      if (Object.prototype.hasOwnProperty.call(patch, "googleChatEnabled")) {
        pendingChannelRuntimeSync = true
      }
      if (Object.prototype.hasOwnProperty.call(patch, "imessageEnabled")) {
        pendingChannelRuntimeSync = true
      }
      if (Object.prototype.hasOwnProperty.call(patch, "kakaoTalkEnabled")) {
        pendingChannelRuntimeSync = true
      }
      setDraftAndPersist({
        ...draft,
        channels: { ...draft.channels, ...patch },
      })
    },
    patchRemoteAccess: (patch) => {
      const draft = get().draft
      setDraftAndPersist({
        ...draft,
        remoteAccess: { ...draft.remoteAccess, ...patch },
      })
    },
    saveDraftSnapshot: async (draft, options) => {
      return await persistSetupSnapshot({
        draft,
        syncChannelRuntime: options?.syncChannelRuntime,
      })
    },
  }))
}

export const useSetupStore = createSetupStore({ now: () => Date.now() })

export function isSetupCompleted() {
  return useSetupStore.getState().state.completed
}
