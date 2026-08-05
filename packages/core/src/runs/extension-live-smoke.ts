export type ExtensionLiveCapability = "skill" | "mcp"
export type ExtensionLiveSmokeMode = "dry-run" | "live-run"
export type ExtensionLiveSmokeStatus = "passed" | "failed" | "skipped"
export type ExtensionLiveSmokeState =
  | "prepared"
  | "executing"
  | "observed"
  | "verified"
  | "rejected"
export type ExtensionLiveSmokeEvent = "START" | "OBSERVE" | "VERIFY" | "REJECT"

export interface ExtensionLiveSmokeScenario {
  id: string
  capability: ExtensionLiveCapability
  expectedAgentId: string
  expectedBindingId: string
  expectedCatalogId: string
  expectedToolName: string
  readOnly: boolean
}

export interface ExtensionLiveToolExecutionReceipt {
  runId: string
  requestGroupId: string
  capability: ExtensionLiveCapability
  agentId: string
  bindingId: string
  catalogId: string
  toolName: string
  status: "succeeded" | "failed" | "denied"
  executionObserved: boolean
  evidenceRef: string
}

export interface ExtensionLiveResultDiagnosisReceipt {
  diagnosedBy: "llm"
  status: "complete" | "followup" | "ask_user"
  contextFingerprint: `sha256:${string}`
  criterionKeys: readonly string[]
  evidenceRefs: readonly string[]
}

export interface ExtensionLiveSmokeTrace {
  requestGroupId: string
  selectedCapability: ExtensionLiveCapability
  selectedAgentId: string
  selectedBindingId: string
  selectedCatalogId: string
  discoveryOnly: boolean
  toolExecution?: ExtensionLiveToolExecutionReceipt | null
  resultDiagnosis?: ExtensionLiveResultDiagnosisReceipt | null
  auditEventId?: string | null
  redactionStatus: "verified" | "unverified"
}

export interface ExtensionLiveSmokeResult {
  scenario: ExtensionLiveSmokeScenario
  state: ExtensionLiveSmokeState
  status: ExtensionLiveSmokeStatus
  trace?: ExtensionLiveSmokeTrace | null
  reasonCode?: string
  startedAt: number
  finishedAt: number
}

export interface ExtensionLiveSmokeSummary {
  kind: "extension.live_smoke"
  mode: ExtensionLiveSmokeMode
  runId: string
  status: ExtensionLiveSmokeStatus
  startedAt: number
  finishedAt: number
  results: readonly ExtensionLiveSmokeResult[]
}

export type ExtensionLiveSmokeTransitionResult =
  | { ok: true; state: ExtensionLiveSmokeState }
  | { ok: false; state: ExtensionLiveSmokeState; reasonCode: "extension_smoke_transition_invalid" }

const TRANSITIONS: Record<
  Exclude<ExtensionLiveSmokeState, "verified" | "rejected">,
  Partial<Record<ExtensionLiveSmokeEvent, ExtensionLiveSmokeState>>
> = {
  prepared: { START: "executing", REJECT: "rejected" },
  executing: { OBSERVE: "observed", REJECT: "rejected" },
  observed: { VERIFY: "verified", REJECT: "rejected" },
}

export function transitionExtensionLiveSmokeState(
  state: ExtensionLiveSmokeState,
  event: ExtensionLiveSmokeEvent,
): ExtensionLiveSmokeTransitionResult {
  const next = state === "verified" || state === "rejected" ? undefined : TRANSITIONS[state][event]
  return next
    ? { ok: true, state: next }
    : { ok: false, state, reasonCode: "extension_smoke_transition_invalid" }
}
