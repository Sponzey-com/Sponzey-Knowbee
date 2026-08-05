import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import type { SetupChecksResponse } from "../api/adapters/types"
import { type MemoryInspectorSnapshot, api } from "../api/client"
import { discoverModelsFromEndpoint } from "../api/modelDiscovery"
import { ResourceReadStatusNotice } from "../components/ResourceReadStatusNotice"
import { useSettingsNavigationGuard } from "../components/settings/SettingsNavigationGuard"
import { MemorySettingsOverviewPanel } from "../components/setup/MemorySettingsOverviewPanel"
import { PersonalSettingsForm } from "../components/setup/PersonalSettingsForm"
import { SecuritySettingsForm } from "../components/setup/SecuritySettingsForm"
import { SetupSyncStatus } from "../components/setup/SetupSyncStatus"
import { SingleSettingsWorkspaceShell } from "../components/setup/SingleSettingsWorkspaceShell"
import {
  type AIProviderType,
  AI_PROVIDER_OPTIONS,
  getAIProviderDefaultEndpoint,
  getAIProviderSuggestedModels,
} from "../contracts/ai"
import type { SetupDraft } from "../contracts/setup"
import {
  type BeginnerConnectionStatus,
  type BeginnerSetupStepId,
  buildBeginnerConnectionCards,
  buildBeginnerSetupSmokeResult,
  getBeginnerActiveAiBackend,
  sanitizeBeginnerSetupError,
  upsertBeginnerAiBackend,
} from "../lib/beginner-setup"
import { defaultMainAgentNameForLanguage } from "../lib/main-agent-copy"
import { uiCatalogText } from "../lib/message-catalog"
import {
  type ResourceReadState,
  initialResourceReadState,
  reduceResourceReadState,
} from "../lib/resource-read-state"
import { resolveSettingsSectionId, settingsSectionPath } from "../lib/settings-route"
import { settingsSectionDraftMatches } from "../lib/settings-section-ownership"
import {
  buildSetupSectionLifecycles,
  resolveSetupSectionBodyOwner,
} from "../lib/setup-section-body-mapping"
import { mergeSetupStepDraft, revertSetupStepDraft, validateSetupStep } from "../lib/setupFlow"
import type { UnifiedSettingsSectionId } from "../lib/unified-settings-ownership"
import { buildSingleSettingsWorkspaceForSetup } from "../lib/unified-settings-workspace-view"
import { projectUserRecovery } from "../lib/user-recovery"
import { type SetupCoreSnapshot, useSetupStore } from "../stores/setup"
import { type UiLanguage, pickUiText, useUiLanguageStore } from "../stores/uiLanguage"
import { useUiModeStore } from "../stores/uiMode"

function cloneDraft(draft: SetupDraft): SetupDraft {
  return JSON.parse(JSON.stringify(draft)) as SetupDraft
}

export function SetupReadStatusNotices({
  coreReadState,
  checksReadState,
  text,
  onRefreshCore,
  onRefreshChecks,
}: {
  coreReadState: ResourceReadState<SetupCoreSnapshot>
  checksReadState: ResourceReadState<SetupChecksResponse>
  text: (ko: string, en: string) => string
  onRefreshCore: () => void
  onRefreshChecks: () => void
}) {
  if (
    coreReadState.status === "stale" ||
    (coreReadState.status === "loading" && coreReadState.data !== null)
  ) {
    return (
      <ResourceReadStatusNotice
        state={coreReadState}
        subject="settings"
        text={text}
        onRefresh={onRefreshCore}
      />
    )
  }
  if (
    checksReadState.status === "failed" ||
    checksReadState.status === "stale" ||
    (checksReadState.status === "loading" && checksReadState.data !== null)
  ) {
    return (
      <ResourceReadStatusNotice
        state={checksReadState}
        subject="settings"
        text={text}
        onRefresh={onRefreshChecks}
      />
    )
  }
  return null
}

export function SetupPage({ mode = "settings" }: { mode?: "initial" | "settings" }) {
  const navigate = useNavigate()
  const { sectionId: routeSectionId } = useParams<{ sectionId?: string }>()
  const [localDraft, setLocalDraft] = useState<SetupDraft | null>(null)
  const [showValidation, setShowValidation] = useState(false)
  const uiLanguage = useUiLanguageStore((state) => state.language)
  const uiShell = useUiModeStore((state) => state.shell)
  const [beginnerStepId, setBeginnerStepId] = useState<BeginnerSetupStepId>("ai")
  const [beginnerAiInput, setBeginnerAiInput] = useState<{
    providerType: AIProviderType
    authMode: "api_key" | "chatgpt_oauth"
    endpoint: string
    defaultModel: string
    apiKey: string
    oauthAuthFilePath: string
  }>({
    providerType: "ollama" as AIProviderType,
    authMode: "api_key",
    endpoint: getAIProviderDefaultEndpoint("ollama"),
    defaultModel: getAIProviderSuggestedModels("ollama")[0] ?? "",
    apiKey: "",
    oauthAuthFilePath: "",
  })
  const [beginnerAiTestOk, setBeginnerAiTestOk] = useState<boolean | null>(null)
  const [beginnerTestingAi, setBeginnerTestingAi] = useState(false)
  const [beginnerLoadingModels, setBeginnerLoadingModels] = useState(false)
  const [beginnerDiscoveredModels, setBeginnerDiscoveredModels] = useState<string[]>([])
  const modelDiscoveryKeyRef = useRef("")
  const [beginnerNotice, setBeginnerNotice] = useState("")
  const [selectedSettingsSectionId, setSelectedSettingsSectionId] =
    useState<UnifiedSettingsSectionId>(() => resolveSettingsSectionId(routeSectionId))
  const [memoryOverviewReadState, setMemoryOverviewReadState] =
    useState<ResourceReadState<MemoryInspectorSnapshot>>(initialResourceReadState)
  const memoryOverviewController = useRef<AbortController | null>(null)
  const memoryOverviewSequence = useRef(0)
  const settingsGuard = useSettingsNavigationGuard()
  const {
    draft,
    checks,
    coreReadState,
    checksReadState,
    checksLoading,
    saving,
    lastSavedAt,
    lastError,
    saveRecovery,
    setSaveRecovery,
    completeSetup,
    refreshChecks,
    saveDraftSnapshot,
    initialize,
  } = useSetupStore()
  const setupText = useCallback(
    (ko: string, en: string) => pickUiText(uiLanguage, ko, en),
    [uiLanguage],
  )
  const setupReadStatusNotices = (
    <SetupReadStatusNotices
      coreReadState={coreReadState}
      checksReadState={checksReadState}
      text={setupText}
      onRefreshCore={() => void initialize(true)}
      onRefreshChecks={() => void refreshChecks(true)}
    />
  )

  useEffect(() => {
    if (
      mode === "settings" &&
      ["dirty", "confirming", "saving", "save_failed"].includes(settingsGuard.session.status)
    )
      return
    setLocalDraft(cloneDraft(draft))
  }, [draft, mode, settingsGuard.session.status])

  useEffect(() => {
    if (mode !== "settings") return
    const resolved = resolveSettingsSectionId(routeSectionId)
    setSelectedSettingsSectionId(resolved)
    if (routeSectionId !== resolved) navigate(settingsSectionPath(resolved), { replace: true })
  }, [mode, navigate, routeSectionId])

  const activeDraft = localDraft ?? draft
  const activeBeginnerBackend = getBeginnerActiveAiBackend(activeDraft)
  const beginnerModelOptions = useMemo(
    () =>
      beginnerDiscoveredModels.length > 0
        ? beginnerDiscoveredModels
        : [
        ...new Set([
          ...getAIProviderSuggestedModels(
            beginnerAiInput.providerType,
            beginnerAiInput.authMode,
          ),
          ...(activeBeginnerBackend?.providerType === beginnerAiInput.providerType
            ? activeBeginnerBackend.availableModels
            : []),
        ]),
      ],
    [
      activeBeginnerBackend,
      beginnerAiInput.authMode,
      beginnerAiInput.providerType,
      beginnerDiscoveredModels,
    ],
  )
  const aiInputDirty =
    Boolean(
      beginnerAiInput.defaultModel.trim() ||
        beginnerAiInput.apiKey.trim() ||
        beginnerAiInput.oauthAuthFilePath.trim(),
    ) &&
    (!activeBeginnerBackend ||
      beginnerAiInput.providerType !== activeBeginnerBackend.providerType ||
      beginnerAiInput.authMode !== activeBeginnerBackend.authMode ||
      beginnerAiInput.endpoint.trim() !==
        (
          activeBeginnerBackend.endpoint ??
          getAIProviderDefaultEndpoint(activeBeginnerBackend.providerType)
        ).trim() ||
      beginnerAiInput.defaultModel.trim() !== activeBeginnerBackend.defaultModel.trim() ||
      beginnerAiInput.apiKey.trim() !== (activeBeginnerBackend.credentials.apiKey ?? "").trim() ||
      beginnerAiInput.oauthAuthFilePath.trim() !==
        (activeBeginnerBackend.credentials.oauthAuthFilePath ?? "").trim())
  const singleSettingsLifecycle = buildSetupSectionLifecycles({
    draft: activeDraft,
    persisted: draft,
    shell: uiShell,
    aiInputDirty,
    automationAvailable: false,
    memoryAvailable: memoryOverviewReadState.data !== null,
  })
  const singleSettingsView = buildSingleSettingsWorkspaceForSetup({
    draft: activeDraft,
    shell: uiShell,
    language: uiLanguage,
    adminEnabled: uiShell?.mode.adminEnabled ?? false,
    selectedSectionId: selectedSettingsSectionId,
    lifecycleBySection: singleSettingsLifecycle,
  })
  const settingsDirty =
    mode === "settings" &&
    Object.values(singleSettingsLifecycle).some((lifecycle) => lifecycle === "unsaved")
  const discardSettingsDraft = useCallback(() => {
    setLocalDraft(cloneDraft(useSetupStore.getState().draft))
    setShowValidation(false)
  }, [])

  useEffect(() => {
    if (mode !== "settings") return
    settingsGuard.register({ dirty: settingsDirty, discard: discardSettingsDraft })
  }, [discardSettingsDraft, mode, settingsDirty, settingsGuard.register])

  useEffect(() => {
    if (mode !== "settings") return
    return () => settingsGuard.register(null)
  }, [mode, settingsGuard.register])

  async function completeSettingsSave(expectedDraft: SetupDraft, success: boolean) {
    if (mode !== "settings") return success
    if (!success) {
      settingsGuard.saveFailed()
      return false
    }
    // The command response acknowledges persisted desired state; runtime reads stay at the startup snapshot until restart.
    const acknowledgedDraft = useSetupStore.getState().draft
    const matches = settingsSectionDraftMatches(
      selectedSettingsSectionId,
      expectedDraft,
      acknowledgedDraft,
    )
    settingsGuard.authoritativeReloaded(matches)
    if (matches) {
      setSaveRecovery(null)
      setLocalDraft(cloneDraft(acknowledgedDraft))
    } else {
      setSaveRecovery({
        kind: "conflict",
        reasonCode: "save_acknowledgement_mismatch",
        messageKey: "conflict",
        action: "refresh_state",
        actionLabelKey: "refresh_state",
      })
    }
    return matches
  }

  function recoverSettingsSave() {
    setSaveRecovery(null)
    void initialize(true)
  }

  function requestSettingsSave(): boolean {
    return mode !== "settings" || settingsGuard.saveRequested()
  }

  const loadMemoryOverview = useCallback(async () => {
    memoryOverviewController.current?.abort()
    const controller = new AbortController()
    memoryOverviewController.current = controller
    const sequence = ++memoryOverviewSequence.current
    setMemoryOverviewReadState((current) =>
      reduceResourceReadState(current, { type: "load_started" }),
    )
    try {
      const result = await api.memoryInspector({ limit: 12 }, controller.signal)
      if (controller.signal.aborted || sequence !== memoryOverviewSequence.current) return
      setMemoryOverviewReadState((current) =>
        reduceResourceReadState(current, {
          type: "load_succeeded",
          data: result.snapshot,
          observedAt: result.snapshot.generatedAt,
        }),
      )
    } catch (cause) {
      if (controller.signal.aborted || sequence !== memoryOverviewSequence.current) return
      setMemoryOverviewReadState((current) =>
        reduceResourceReadState(current, {
          type: "load_failed",
          failure: projectUserRecovery(cause, "read"),
        }),
      )
    }
  }, [])

  useEffect(() => {
    if (mode !== "settings" || selectedSettingsSectionId !== "memory") {
      memoryOverviewController.current?.abort()
      memoryOverviewSequence.current += 1
      return
    }
    void loadMemoryOverview()
    return () => {
      memoryOverviewController.current?.abort()
      memoryOverviewSequence.current += 1
    }
  }, [loadMemoryOverview, mode, selectedSettingsSectionId])

  useEffect(() => {
    const backend = getBeginnerActiveAiBackend(activeDraft)
    if (!backend) return
    setBeginnerAiInput({
      providerType: backend.providerType,
      authMode: backend.authMode,
      endpoint: backend.endpoint ?? getAIProviderDefaultEndpoint(backend.providerType),
      defaultModel: backend.defaultModel,
      apiKey: backend.credentials.apiKey ?? "",
      oauthAuthFilePath: backend.credentials.oauthAuthFilePath ?? "",
    })
    setBeginnerDiscoveredModels(backend.availableModels)
  }, [activeDraft])

  useEffect(() => {
    const aiSectionVisible =
      mode === "initial"
        ? beginnerStepId === "ai"
        : selectedSettingsSectionId === "ai"
    if (
      !aiSectionVisible ||
      beginnerAiInput.providerType !== "openai" ||
      beginnerAiInput.authMode !== "chatgpt_oauth" ||
      !beginnerAiInput.endpoint.trim()
    ) return
    const key = [
      beginnerAiInput.providerType,
      beginnerAiInput.authMode,
      beginnerAiInput.endpoint.trim(),
      beginnerAiInput.oauthAuthFilePath.trim(),
    ].join("|")
    if (modelDiscoveryKeyRef.current === key) return
    modelDiscoveryKeyRef.current = key
    void handleRefreshBeginnerModels(true)
  }, [
    beginnerAiInput.authMode,
    beginnerAiInput.endpoint,
    beginnerAiInput.oauthAuthFilePath,
    beginnerAiInput.providerType,
    beginnerStepId,
    mode,
    selectedSettingsSectionId,
  ])

  const beginnerConnections = useMemo(
    () =>
      buildBeginnerConnectionCards({
        draft: activeDraft,
        checks,
        shell: uiShell,
        language: uiLanguage,
      }),
    [activeDraft, checks, uiLanguage, uiShell],
  )
  const beginnerSmoke = useMemo(
    () =>
      buildBeginnerSetupSmokeResult({
        draft: activeDraft,
        checks,
        shell: uiShell,
        language: uiLanguage,
      }),
    [activeDraft, checks, uiLanguage, uiShell],
  )

  const personalValidation = useMemo(
    () => validateSetupStep("personal", activeDraft),
    [activeDraft],
  )
  const defaultMainAgentName = defaultMainAgentNameForLanguage(uiLanguage)
  function patchDraft<K extends keyof SetupDraft>(key: K, value: SetupDraft[K]) {
    setLocalDraft((current) => {
      const base = cloneDraft(current ?? draft)
      return { ...base, [key]: value }
    })
  }

  function patchBeginnerAiInput(patch: Partial<typeof beginnerAiInput>) {
    if (
      Object.prototype.hasOwnProperty.call(patch, "providerType") ||
      Object.prototype.hasOwnProperty.call(patch, "authMode")
    ) {
      modelDiscoveryKeyRef.current = ""
      setBeginnerDiscoveredModels([])
    }
    setBeginnerAiInput((current) => {
      const nextProvider = patch.providerType ?? current.providerType
      const nextAuthMode =
        nextProvider === "openai"
          ? (patch.authMode ?? current.authMode)
          : ("api_key" as const)
      const connectionTypeChanged =
        nextProvider !== current.providerType || nextAuthMode !== current.authMode
      const endpointPatch = Object.prototype.hasOwnProperty.call(patch, "providerType")
        ? getAIProviderDefaultEndpoint(nextProvider)
        : patch.endpoint
      const suggestedModel = getAIProviderSuggestedModels(nextProvider, nextAuthMode)[0] ?? ""
      return {
        ...current,
        ...patch,
        providerType: nextProvider,
        authMode: nextAuthMode,
        ...(endpointPatch !== undefined ? { endpoint: endpointPatch } : {}),
        ...(connectionTypeChanged && patch.defaultModel === undefined
          ? { defaultModel: suggestedModel }
          : {}),
      }
    })
    setBeginnerNotice("")
  }

  async function handleRefreshBeginnerModels(silent = false) {
    if (!beginnerAiInput.endpoint.trim()) {
      if (!silent) {
        setBeginnerNotice(
          pickUiText(
            uiLanguage,
            "모델 목록을 불러올 연결 주소를 먼저 입력하세요.",
            "Enter the connection endpoint before loading models.",
          ),
        )
      }
      return
    }
    setBeginnerLoadingModels(true)
    if (!silent) {
      setBeginnerNotice("")
      setBeginnerAiTestOk(null)
    }
    try {
      const result = await discoverModelsFromEndpoint(
        beginnerAiInput.endpoint,
        beginnerAiInput.providerType,
        {
          ...(beginnerAiInput.apiKey.trim()
            ? { apiKey: beginnerAiInput.apiKey.trim() }
            : {}),
          ...(beginnerAiInput.oauthAuthFilePath.trim()
            ? { oauthAuthFilePath: beginnerAiInput.oauthAuthFilePath.trim() }
            : {}),
        },
        beginnerAiInput.authMode,
      )
      setBeginnerDiscoveredModels(result.models)
      setBeginnerAiInput((current) => ({
        ...current,
        defaultModel: result.models.includes(current.defaultModel)
          ? current.defaultModel
          : (result.models[0] ?? current.defaultModel),
      }))
      if (!silent) {
        setBeginnerNotice(
          pickUiText(
            uiLanguage,
            `사용 가능한 모델 ${result.models.length}개를 불러왔습니다.`,
            `Loaded ${result.models.length} available models.`,
          ),
        )
      }
    } catch (error) {
      modelDiscoveryKeyRef.current = ""
      if (!silent) {
        setBeginnerAiTestOk(false)
        setBeginnerNotice(sanitizeBeginnerSetupError(error, uiLanguage))
      }
    } finally {
      setBeginnerLoadingModels(false)
    }
  }

  async function handleSaveBeginnerAi() {
    setBeginnerNotice("")
    setBeginnerAiTestOk(null)
    const nextDraft = upsertBeginnerAiBackend(activeDraft, {
      providerType: beginnerAiInput.providerType,
      authMode: beginnerAiInput.authMode,
      endpoint: beginnerAiInput.endpoint,
      defaultModel: beginnerAiInput.defaultModel,
      availableModels: beginnerDiscoveredModels,
      credentials: {
        ...(beginnerAiInput.apiKey.trim() ? { apiKey: beginnerAiInput.apiKey.trim() } : {}),
        ...(beginnerAiInput.oauthAuthFilePath.trim()
          ? { oauthAuthFilePath: beginnerAiInput.oauthAuthFilePath.trim() }
          : {}),
      },
    })
    if (!requestSettingsSave()) return
    setLocalDraft(nextDraft)
    const saved = await saveDraftSnapshot(nextDraft)
    if (!saved) {
      await completeSettingsSave(nextDraft, false)
      setBeginnerNotice(sanitizeBeginnerSetupError(lastError || "save failed", uiLanguage))
      return
    }

    const confirmed = await completeSettingsSave(nextDraft, true)
    setBeginnerNotice(
      confirmed
        ? pickUiText(
            uiLanguage,
            "저장되었습니다. 연결 테스트로 실제 응답을 확인하세요.",
            "Saved. Use Test connection to verify a live response.",
          )
        : sanitizeBeginnerSetupError(lastError || "save verification failed", uiLanguage),
    )
  }

  async function handleTestSavedBeginnerAi() {
    setBeginnerNotice("")
    setBeginnerAiTestOk(null)
    if (!beginnerAiInput.defaultModel.trim()) {
      setBeginnerAiTestOk(false)
      setBeginnerNotice(
        pickUiText(
          uiLanguage,
          "테스트할 기본 모델을 선택하거나 입력하세요.",
          "Select or enter a default model to test.",
        ),
      )
      return
    }

    setBeginnerTestingAi(true)
    try {
      const result = await api.testAi({
        providerType: beginnerAiInput.providerType,
        authMode: beginnerAiInput.authMode,
        endpoint: beginnerAiInput.endpoint,
        defaultModel: beginnerAiInput.defaultModel,
        credentials: {
          ...(beginnerAiInput.apiKey.trim()
            ? { apiKey: beginnerAiInput.apiKey.trim() }
            : {}),
          ...(beginnerAiInput.oauthAuthFilePath.trim()
            ? { oauthAuthFilePath: beginnerAiInput.oauthAuthFilePath.trim() }
            : {}),
        },
      })
      setBeginnerAiTestOk(result.ok)
      setBeginnerNotice(
        result.ok
          ? result.model
            ? pickUiText(
                uiLanguage,
                `연결되었습니다. 응답 모델: ${result.model}`,
                `Connected. Response model: ${result.model}`,
              )
            : pickUiText(uiLanguage, "AI 연결에 성공했습니다.", "AI connection succeeded.")
          : sanitizeBeginnerSetupError(result.error ?? "AI test failed", uiLanguage),
      )
    } catch (error) {
      setBeginnerAiTestOk(false)
      setBeginnerNotice(sanitizeBeginnerSetupError(error, uiLanguage))
    } finally {
      setBeginnerTestingAi(false)
    }
  }

  async function handleSaveBeginnerChannels() {
    setBeginnerNotice("")
    if (!requestSettingsSave()) return
    const success = await saveDraftSnapshot(activeDraft, { syncChannelRuntime: true })
    await completeSettingsSave(activeDraft, success)
    setBeginnerNotice(
      success
        ? uiCatalogText(uiLanguage, "beginner.setup.saved")
        : sanitizeBeginnerSetupError(lastError || "save failed", uiLanguage),
    )
  }

  async function handleSaveBeginnerComputer() {
    setBeginnerNotice("")
    if (!requestSettingsSave()) return
    const success = await saveDraftSnapshot(activeDraft)
    await completeSettingsSave(activeDraft, success)
    setBeginnerNotice(
      success
        ? uiCatalogText(uiLanguage, "beginner.setup.saved")
        : sanitizeBeginnerSetupError(lastError || "save failed", uiLanguage),
    )
  }

  async function handleFinishBeginnerSetup() {
    setBeginnerNotice("")
    await saveDraftSnapshot(activeDraft)
    await completeSetup()
    setBeginnerNotice(
      lastError
        ? sanitizeBeginnerSetupError(lastError, uiLanguage)
        : uiCatalogText(uiLanguage, "beginner.setup.saved"),
    )
  }

  function beginnerConnectionTone(status: BeginnerConnectionStatus): string {
    switch (status) {
      case "ready":
        return "border-emerald-200 bg-emerald-50 text-emerald-800"
      case "needs_attention":
        return "border-amber-200 bg-amber-50 text-amber-800"
      case "idle":
        return "border-stone-200 bg-stone-50 text-stone-700"
    }
  }

  function renderBeginnerSetupBody(stepId: BeginnerSetupStepId = beginnerStepId) {
    switch (stepId) {
      case "ai":
        return (
          <div id="setup-ai" className="space-y-6">
            <section className="rounded-[1.75rem] border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-stone-900">
                    {uiCatalogText(uiLanguage, "beginner.setup.aiTitle")}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {uiCatalogText(uiLanguage, "beginner.setup.step.aiDesc")}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-stone-700">
                  {uiCatalogText(uiLanguage, "beginner.setup.provider")}
                  <select
                    value={beginnerAiInput.providerType}
                    onChange={(event) =>
                      patchBeginnerAiInput({ providerType: event.target.value as AIProviderType })
                    }
                    className="rounded-2xl border border-stone-200 px-4 py-3 text-sm font-normal text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                  >
                    {AI_PROVIDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-semibold text-stone-700">
                  {beginnerAiInput.providerType === "openai" &&
                  beginnerAiInput.authMode === "chatgpt_oauth"
                    ? uiCatalogText(uiLanguage, "beginner.setup.authFile")
                    : uiCatalogText(uiLanguage, "beginner.setup.apiKey")}
                  <input
                    value={
                      beginnerAiInput.providerType === "openai" &&
                      beginnerAiInput.authMode === "chatgpt_oauth"
                        ? beginnerAiInput.oauthAuthFilePath
                        : beginnerAiInput.apiKey
                    }
                    onChange={(event) =>
                      beginnerAiInput.providerType === "openai" &&
                      beginnerAiInput.authMode === "chatgpt_oauth"
                        ? patchBeginnerAiInput({ oauthAuthFilePath: event.target.value })
                        : patchBeginnerAiInput({ apiKey: event.target.value })
                    }
                    type={
                      beginnerAiInput.providerType === "openai" &&
                      beginnerAiInput.authMode === "chatgpt_oauth"
                        ? "text"
                        : "password"
                    }
                    placeholder={
                      beginnerAiInput.providerType === "openai" &&
                      beginnerAiInput.authMode === "chatgpt_oauth"
                        ? "~/.codex/auth.json"
                        : "optional"
                    }
                    className="rounded-2xl border border-stone-200 px-4 py-3 text-sm font-normal text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                  />
                </label>
              </div>
              {beginnerAiInput.providerType === "openai" ? (
                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                  {(["api_key", "chatgpt_oauth"] as const).map((authMode) => (
                    <button
                      key={authMode}
                      type="button"
                      onClick={() => patchBeginnerAiInput({ authMode })}
                      className={`rounded-full border px-3 py-1.5 font-semibold ${beginnerAiInput.authMode === authMode ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-700"}`}
                    >
                      {authMode === "api_key" ? "API Key" : "ChatGPT OAuth"}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="mt-5 grid gap-2 text-sm font-semibold text-stone-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="ai-default-model">
                    {uiCatalogText(uiLanguage, "beginner.setup.defaultModel")}
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleRefreshBeginnerModels()}
                    disabled={beginnerLoadingModels || !beginnerAiInput.endpoint.trim()}
                    className="min-h-9 border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {beginnerLoadingModels
                      ? pickUiText(uiLanguage, "불러오는 중...", "Loading...")
                      : pickUiText(uiLanguage, "모델 목록 새로고침", "Refresh model list")}
                  </button>
                </div>
                <input
                  id="ai-default-model"
                  value={beginnerAiInput.defaultModel}
                  list="ai-default-model-options"
                  onChange={(event) =>
                    patchBeginnerAiInput({ defaultModel: event.target.value })
                  }
                  placeholder={pickUiText(
                    uiLanguage,
                    "모델 선택 또는 ID 입력",
                    "Select or enter a model ID",
                  )}
                  className="rounded-2xl border border-stone-200 px-4 py-3 text-sm font-normal text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                />
                <datalist id="ai-default-model-options">
                  {beginnerModelOptions.map((model) => (
                    <option key={model} value={model} />
                  ))}
                </datalist>
              </div>
              {beginnerModelOptions.length > 0 ? (
                <div
                  className="mt-3 flex flex-wrap gap-2"
                  aria-label={pickUiText(
                    uiLanguage,
                    beginnerDiscoveredModels.length > 0 ? "사용 가능한 모델" : "추천 모델",
                    beginnerDiscoveredModels.length > 0 ? "Available models" : "Suggested models",
                  )}
                >
                  {beginnerModelOptions.map((model) => (
                    <button
                      key={model}
                      type="button"
                      onClick={() => patchBeginnerAiInput({ defaultModel: model })}
                      aria-pressed={beginnerAiInput.defaultModel === model}
                      className={`min-h-9 border px-3 py-1.5 text-xs font-semibold ${
                        beginnerAiInput.defaultModel === model
                          ? "border-stone-900 bg-stone-900 text-white"
                          : "border-stone-200 bg-white text-stone-700"
                      }`}
                    >
                      {model}
                    </button>
                  ))}
                </div>
              ) : null}
              <details className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-stone-800">
                  {uiCatalogText(uiLanguage, "beginner.setup.advancedOptions")}
                </summary>
                <div className="mt-4">
                  <label className="grid gap-2 text-sm font-semibold text-stone-700">
                    {uiCatalogText(uiLanguage, "beginner.setup.endpoint")}
                    <input
                      value={beginnerAiInput.endpoint}
                      onChange={(event) => patchBeginnerAiInput({ endpoint: event.target.value })}
                      className="rounded-2xl border border-stone-200 px-4 py-3 text-sm font-normal text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900/10"
                    />
                  </label>
                </div>
              </details>
              {beginnerNotice ? (
                <div
                  role="status"
                  aria-live="polite"
                  className={`mt-5 border px-4 py-3 text-sm leading-6 ${
                    beginnerAiTestOk === true
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : beginnerAiTestOk === false
                        ? "border-red-200 bg-red-50 text-red-700"
                        : "border-stone-200 bg-stone-50 text-stone-700"
                  }`}
                >
                  {beginnerNotice}
                </div>
              ) : null}
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleSaveBeginnerAi()}
                  disabled={saving || beginnerTestingAi || !beginnerAiInput.defaultModel.trim()}
                  className="min-h-11 bg-stone-900 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving
                    ? pickUiText(uiLanguage, "저장 중...", "Saving...")
                    : pickUiText(uiLanguage, "저장", "Save")}
                </button>
                <button
                  type="button"
                  onClick={() => void handleTestSavedBeginnerAi()}
                  disabled={
                    saving ||
                    beginnerTestingAi ||
                    !beginnerAiInput.defaultModel.trim()
                  }
                  className="min-h-11 border border-stone-900 bg-white px-5 py-2 text-sm font-semibold text-stone-900 disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-400"
                >
                  {beginnerTestingAi
                    ? pickUiText(uiLanguage, "연결 테스트 중...", "Testing connection...")
                    : pickUiText(uiLanguage, "연결 테스트", "Test connection")}
                </button>
                <button
                  type="button"
                  onClick={() => setBeginnerStepId("channels")}
                  className="min-h-11 border border-stone-200 px-5 py-2 text-sm font-semibold text-stone-700"
                >
                  {pickUiText(uiLanguage, "다음", "Next")}
                </button>
              </div>
            </section>
          </div>
        )
      case "channels":
        return (
          <section
            id="setup-channels"
            className="rounded-[1.75rem] border border-stone-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-xl font-semibold text-stone-900">
              {uiCatalogText(uiLanguage, "beginner.setup.channelTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {uiCatalogText(uiLanguage, "beginner.setup.step.channelsDesc")}
            </p>
            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-stone-800">
                  <input
                    type="checkbox"
                    checked={activeDraft.channels.telegramEnabled}
                    onChange={(event) =>
                      patchDraft("channels", {
                        ...activeDraft.channels,
                        telegramEnabled: event.target.checked,
                      })
                    }
                  />
                  {uiCatalogText(uiLanguage, "beginner.setup.enableTelegram")}
                </label>
                <label className="mt-4 grid gap-2 text-sm font-semibold text-stone-700">
                  {uiCatalogText(uiLanguage, "beginner.setup.telegramToken")}
                  <input
                    value={activeDraft.channels.botToken}
                    onChange={(event) =>
                      patchDraft("channels", {
                        ...activeDraft.channels,
                        botToken: event.target.value,
                      })
                    }
                    type="password"
                    className="rounded-2xl border border-stone-200 px-4 py-3 text-sm font-normal text-stone-900"
                  />
                </label>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-stone-800">
                  <input
                    type="checkbox"
                    checked={activeDraft.channels.slackEnabled}
                    onChange={(event) =>
                      patchDraft("channels", {
                        ...activeDraft.channels,
                        slackEnabled: event.target.checked,
                      })
                    }
                  />
                  {uiCatalogText(uiLanguage, "beginner.setup.enableSlack")}
                </label>
                <div className="mt-4 grid gap-4">
                  <label className="grid gap-2 text-sm font-semibold text-stone-700">
                    {uiCatalogText(uiLanguage, "beginner.setup.slackBotToken")}
                    <input
                      value={activeDraft.channels.slackBotToken}
                      onChange={(event) =>
                        patchDraft("channels", {
                          ...activeDraft.channels,
                          slackBotToken: event.target.value,
                        })
                      }
                      type="password"
                      className="rounded-2xl border border-stone-200 px-4 py-3 text-sm font-normal text-stone-900"
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold text-stone-700">
                    {uiCatalogText(uiLanguage, "beginner.setup.slackAppToken")}
                    <input
                      value={activeDraft.channels.slackAppToken}
                      onChange={(event) =>
                        patchDraft("channels", {
                          ...activeDraft.channels,
                          slackAppToken: event.target.value,
                        })
                      }
                      type="password"
                      className="rounded-2xl border border-stone-200 px-4 py-3 text-sm font-normal text-stone-900"
                    />
                  </label>
                </div>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleSaveBeginnerChannels()}
                disabled={saving}
                className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {uiCatalogText(uiLanguage, "beginner.setup.saveChannel")}
              </button>
              <button
                type="button"
                onClick={() => setBeginnerStepId("computer")}
                className="rounded-2xl border border-stone-200 px-5 py-3 text-sm font-semibold text-stone-700"
              >
                {pickUiText(uiLanguage, "다음", "Next")}
              </button>
            </div>
          </section>
        )
      case "computer":
        return (
          <section
            id="setup-computer"
            className="rounded-[1.75rem] border border-stone-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-xl font-semibold text-stone-900">
              {uiCatalogText(uiLanguage, "beginner.setup.computerTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {uiCatalogText(uiLanguage, "beginner.setup.step.computerDesc")}
            </p>
            <div className="mt-5 rounded-2xl border border-stone-200 bg-stone-50 p-4">
              <label className="flex items-center gap-2 text-sm font-semibold text-stone-800">
                <input
                  type="checkbox"
                  checked={activeDraft.mqtt.enabled}
                  onChange={(event) =>
                    patchDraft("mqtt", { ...activeDraft.mqtt, enabled: event.target.checked })
                  }
                />
                {uiCatalogText(uiLanguage, "beginner.setup.enableComputer")}
              </label>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-semibold text-stone-700">
                  {uiCatalogText(uiLanguage, "beginner.setup.computerHost")}
                  <input
                    value={activeDraft.mqtt.host}
                    onChange={(event) =>
                      patchDraft("mqtt", { ...activeDraft.mqtt, host: event.target.value })
                    }
                    className="rounded-2xl border border-stone-200 px-4 py-3 text-sm font-normal text-stone-900"
                  />
                </label>
                <label className="grid gap-2 text-sm font-semibold text-stone-700">
                  {uiCatalogText(uiLanguage, "beginner.setup.computerPort")}
                  <input
                    value={activeDraft.mqtt.port}
                    onChange={(event) =>
                      patchDraft("mqtt", {
                        ...activeDraft.mqtt,
                        port: Number(event.target.value) || 1883,
                      })
                    }
                    type="number"
                    min={1}
                    max={65535}
                    className="rounded-2xl border border-stone-200 px-4 py-3 text-sm font-normal text-stone-900"
                  />
                </label>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleSaveBeginnerComputer()}
                disabled={saving}
                className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {uiCatalogText(uiLanguage, "beginner.setup.saveComputer")}
              </button>
              <button
                type="button"
                onClick={() => setBeginnerStepId("test")}
                className="rounded-2xl border border-stone-200 px-5 py-3 text-sm font-semibold text-stone-700"
              >
                {pickUiText(uiLanguage, "다음", "Next")}
              </button>
            </div>
          </section>
        )
      case "test":
        return (
          <section
            id="setup-test"
            className="rounded-[1.75rem] border border-stone-200 bg-white p-5 shadow-sm"
          >
            <h2 className="text-xl font-semibold text-stone-900">
              {uiCatalogText(uiLanguage, "beginner.setup.testTitle")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-stone-600">{beginnerSmoke.summary}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {beginnerConnections.map((card) => (
                <a
                  key={card.id}
                  href={card.href}
                  onClick={() =>
                    setBeginnerStepId(
                      card.id === "ai"
                        ? "ai"
                        : card.id === "channels"
                          ? "channels"
                          : card.id === "yeonjang"
                            ? "computer"
                            : "test",
                    )
                  }
                  className="rounded-2xl border border-stone-200 bg-stone-50 p-4 hover:bg-stone-100"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-stone-900">{card.title}</div>
                      <div className="mt-2 text-sm leading-6 text-stone-600">{card.summary}</div>
                    </div>
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${beginnerConnectionTone(card.status)}`}
                    >
                      {card.statusLabel}
                    </span>
                  </div>
                  <div className="mt-3 text-xs font-semibold text-stone-500">
                    {card.actionLabel}
                  </div>
                </a>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void refreshChecks(true)}
                disabled={checksLoading}
                className="rounded-2xl border border-stone-200 px-5 py-3 text-sm font-semibold text-stone-700 disabled:opacity-50"
              >
                {uiCatalogText(uiLanguage, "beginner.setup.refreshStatus")}
              </button>
              <button
                type="button"
                onClick={() => void handleFinishBeginnerSetup()}
                disabled={saving || !beginnerSmoke.ok}
                className="rounded-2xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uiCatalogText(uiLanguage, "beginner.setup.finish")}
              </button>
            </div>
          </section>
        )
    }
  }

  async function saveBasicsSection() {
    const validation = validateSetupStep("personal", activeDraft)
    if (!validation.valid) {
      setShowValidation(true)
      return
    }
    const nextDraft = mergeSetupStepDraft(draft, activeDraft, "personal")
    if (!requestSettingsSave()) return
    const success = await saveDraftSnapshot(nextDraft)
    const confirmed = await completeSettingsSave(nextDraft, success)
    if (confirmed) {
      setShowValidation(false)
    }
  }

  async function savePermissionsSection() {
    const validation = validateSetupStep("security", activeDraft)
    if (!validation.valid) {
      setShowValidation(true)
      return
    }
    const nextDraft = mergeSetupStepDraft(draft, activeDraft, "security")
    if (!requestSettingsSave()) return
    const success = await saveDraftSnapshot(nextDraft)
    const confirmed = await completeSettingsSave(nextDraft, success)
    if (confirmed) {
      setShowValidation(false)
    }
  }

  function renderSingleSettingsBody() {
    const owner = resolveSetupSectionBodyOwner(selectedSettingsSectionId)
    if (!owner || owner.source === "unavailable") {
      return (
        <div className="border border-dashed border-stone-300 bg-white px-5 py-8 text-sm leading-6 text-stone-600">
          {pickUiText(
            uiLanguage,
            "이 설정은 단일 화면으로 이전 중입니다. 현재 저장된 값은 유지됩니다.",
            "This setting is being moved into the single workspace. Existing saved values are preserved.",
          )}
        </div>
      )
    }
    if (owner.source === "setup_step") {
      if (selectedSettingsSectionId === "permissions" && owner.setupStepId === "security") {
        const dirty = singleSettingsLifecycle.permissions === "unsaved"
        const validation = validateSetupStep("security", activeDraft)
        return (
          <div className="space-y-4">
            <SectionIntro
              title={pickUiText(uiLanguage, "권한과 승인", "Permissions and approvals")}
              description={pickUiText(
                uiLanguage,
                "위험 작업의 승인 방식과 서브 에이전트 위임 깊이를 정합니다.",
                "Set approval behavior for risky work and the delegation depth for sub-agents.",
              )}
            />
            {showValidation && validation.summary.length > 0 ? (
              <ValidationNotice messages={validation.summary} />
            ) : null}
            <SecuritySettingsForm
              value={activeDraft.security}
              onChange={(patch) => patchDraft("security", { ...activeDraft.security, ...patch })}
              errors={
                showValidation
                  ? {
                      approvalTimeout: validation.fieldErrors.approvalTimeout,
                      maxDelegationTurns: validation.fieldErrors.maxDelegationTurns,
                    }
                  : undefined
              }
            />
            <SetupSyncStatus
              saving={saving}
              lastSavedAt={lastSavedAt}
              saveRecovery={saveRecovery}
              onRecover={recoverSettingsSave}
            />
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                disabled={!dirty || saving}
                onClick={() => {
                  setLocalDraft(revertSetupStepDraft(activeDraft, draft, "security"))
                  setShowValidation(false)
                }}
                className="min-h-11 border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-40"
              >
                {pickUiText(uiLanguage, "취소", "Cancel")}
              </button>
              <button
                type="button"
                disabled={!dirty || saving}
                onClick={() => void savePermissionsSection()}
                className="min-h-11 bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {saving
                  ? pickUiText(uiLanguage, "저장 중...", "Saving...")
                  : pickUiText(uiLanguage, "저장", "Save")}
              </button>
            </div>
          </div>
        )
      }
      const dirty = singleSettingsLifecycle.basics === "unsaved"
      return (
        <div className="space-y-4">
          <PersonalSettingsForm
            value={activeDraft.personal}
            mainAgentName={activeDraft.mainAgent?.name ?? defaultMainAgentName}
            onChange={(patch) => patchDraft("personal", { ...activeDraft.personal, ...patch })}
            onMainAgentNameChange={(name) => patchDraft("mainAgent", { name })}
            errors={showValidation ? personalValidation.fieldErrors : undefined}
          />
          <SetupSyncStatus
            saving={saving}
            lastSavedAt={lastSavedAt}
            saveRecovery={saveRecovery}
            onRecover={recoverSettingsSave}
          />
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => {
                setLocalDraft((current) => {
                  const base = cloneDraft(current ?? draft)
                  return {
                    ...base,
                    personal: cloneDraft(draft).personal,
                    mainAgent: cloneDraft(draft).mainAgent,
                  }
                })
                setShowValidation(false)
              }}
              className="min-h-11 border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 disabled:opacity-40"
            >
              {pickUiText(uiLanguage, "취소", "Cancel")}
            </button>
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => void saveBasicsSection()}
              className="min-h-11 bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {saving
                ? pickUiText(uiLanguage, "저장 중...", "Saving...")
                : pickUiText(uiLanguage, "저장", "Save")}
            </button>
          </div>
        </div>
      )
    }
    if (owner.source === "sub_agent_view") {
      return (
        <SettingsDestinationPanel
          title={pickUiText(uiLanguage, "서브 에이전트", "Sub-agents")}
          description={pickUiText(
            uiLanguage,
            "에이전트 생성, 역할, 기능과 위임 관계는 전용 화면에서 관리합니다.",
            "Manage agent creation, roles, capabilities, and delegation in the dedicated workspace.",
          )}
          to="/agents"
          action={pickUiText(uiLanguage, "서브 에이전트 열기", "Open sub-agents")}
        />
      )
    }
    if (owner.simpleBodyId === "channels") {
      return (
        <div className="space-y-5">
          {renderBeginnerSetupBody("channels")}
          {renderBeginnerSetupBody("computer")}
        </div>
      )
    }
    if (owner.simpleBodyId === "memory") {
      return (
        <MemorySettingsOverviewPanel
          readState={memoryOverviewReadState}
          onRefresh={() => void loadMemoryOverview()}
        />
      )
    }
    if (owner.simpleBodyId === "schedules") {
      return (
        <SettingsDestinationPanel
          title={pickUiText(uiLanguage, "일정", "Schedules")}
          description={pickUiText(
            uiLanguage,
            "예약 작업의 생성, 실행 상태와 기록은 작업 화면에서 관리합니다.",
            "Manage scheduled jobs, execution state, and history in Work.",
          )}
          to="/work/schedules"
          action={pickUiText(uiLanguage, "일정 열기", "Open schedules")}
        />
      )
    }
    return renderBeginnerSetupBody(owner.simpleBodyId)
  }

  if (mode === "initial") {
    return (
      <div className="h-full min-h-0 overflow-y-auto bg-stone-100 p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-5">
          <BetaWarningNotice language={uiLanguage} />
          <header className="border-b border-stone-200 pb-5">
            <h1 className="text-2xl font-semibold text-stone-950">
              {pickUiText(uiLanguage, "초기 설정", "Initial setup")}
            </h1>
          </header>
          {setupReadStatusNotices}
          <nav
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            aria-label={pickUiText(uiLanguage, "초기 설정 단계", "Initial setup steps")}
          >
            {(["ai", "channels", "computer", "test"] as const).map((stepId) => (
              <button
                key={stepId}
                type="button"
                aria-current={beginnerStepId === stepId ? "step" : undefined}
                onClick={() => setBeginnerStepId(stepId)}
                className={`min-h-11 border px-3 py-2 text-sm font-semibold ${beginnerStepId === stepId ? "border-stone-900 bg-stone-900 text-white" : "border-stone-200 bg-white text-stone-700"}`}
              >
                {stepId === "ai"
                  ? "AI"
                  : stepId === "channels"
                    ? pickUiText(uiLanguage, "채널", "Channels")
                    : stepId === "computer"
                      ? pickUiText(uiLanguage, "컴퓨터", "Computer")
                      : pickUiText(uiLanguage, "확인", "Review")}
              </button>
            ))}
          </nav>
          {renderBeginnerSetupBody()}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-0 overflow-y-auto bg-stone-100 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <BetaWarningNotice language={uiLanguage} />
        <header className="border-b border-stone-200 pb-5">
          <h1 className="text-2xl font-semibold text-stone-950">
            {singleSettingsView.workspace.title}
          </h1>
        </header>
        {setupReadStatusNotices}
        <SingleSettingsWorkspaceShell
          workspace={singleSettingsView.workspace}
          onSelectSection={(sectionId) =>
            settingsGuard.requestNavigation(settingsSectionPath(sectionId))
          }
          emptyMessage={pickUiText(
            uiLanguage,
            "표시할 설정이 없습니다.",
            "No settings to display.",
          )}
        >
          {renderSingleSettingsBody()}
        </SingleSettingsWorkspaceShell>
      </div>
    </div>
  )
}

function SettingsDestinationPanel({
  title,
  description,
  to,
  action,
}: {
  title: string
  description: string
  to: string
  action: string
}) {
  const { interceptLink } = useSettingsNavigationGuard()
  return (
    <section className="border border-stone-200 bg-white p-5">
      <h2 className="text-xl font-semibold text-stone-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">{description}</p>
      <Link
        to={to}
        onClick={(event) => interceptLink(event, to)}
        className="mt-5 inline-flex min-h-11 items-center border border-stone-900 bg-stone-900 px-4 py-2 text-sm font-semibold text-white"
      >
        {action}
      </Link>
    </section>
  )
}

function SectionIntro({ title, description = "" }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="text-2xl font-semibold text-stone-900">{title}</h2>
      {description.trim() ? (
        <p className="mt-2 text-sm leading-7 text-stone-600">{description}</p>
      ) : null}
    </div>
  )
}

function ValidationNotice({ messages }: { messages: string[] }) {
  if (messages.length === 0) return null

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
      <div className="font-semibold">필수 입력을 먼저 확인해 주세요</div>
      <ul className="mt-2 space-y-1 leading-6">
        {messages.map((message) => (
          <li key={message}>- {message}</li>
        ))}
      </ul>
    </div>
  )
}

function BetaWarningNotice({ language }: { language: UiLanguage }) {
  return (
    <section
      role="alert"
      aria-live="polite"
      className="rounded-[1.75rem] border border-amber-300 bg-amber-50 px-5 py-4 text-amber-950 shadow-sm"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-amber-200 text-base font-black text-amber-900"
          aria-hidden="true"
        >
          !
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">
            {pickUiText(language, "베타 사용 경고", "Beta use warning")}
          </div>
          <p className="mt-1 text-sm leading-6">
            {pickUiText(
              language,
              "이 프로그램은 아직 베타입니다. 사용 방식에 따라 파일 변경, 외부 서비스 호출, 화면 제어 같은 위험이 생길 수 있습니다. 중요한 작업은 실행 내용을 확인하고, 승인 요청을 신중하게 처리해 주세요.",
              "This program is still in beta. Depending on how you use it, it may change files, call external services, or control the screen. Review actions carefully and handle approval requests with caution.",
            )}
          </p>
        </div>
      </div>
    </section>
  )
}
