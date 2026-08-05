import { createHash } from "node:crypto"

export const YEONJANG_BROWSER_FOCUS_CONTRACT = {
  method: "browser.focus",
  group: "browser",
  riskLevel: "moderate",
  sideEffectClass: "process_control",
  permissionSetting: "allow_browser_control",
  requiresApproval: true,
  requiresInteractiveDesktop: true,
  defaultLiveSmokeAllowed: false,
  rawPayloadVisibility: "audit_only",
  postCheckMode: "focused_target_observation_required",
} as const

export interface YeonjangBrowserFocusTargetInput {
  targetAlias?: string | undefined
  processName?: string | undefined
  title?: string | undefined
  url?: string | undefined
  pid?: number | undefined
  windowId?: string | undefined
  tabId?: string | undefined
}

export interface YeonjangBrowserFocusTargetProjection {
  schemaVersion: "yeonjang-browser-focus-target-v1"
  targetKind: "browser_window_or_tab"
  targetAlias?: string | undefined
  displayName: string
  processName?: string | undefined
  titleHash?: string | undefined
  titleLength?: number | undefined
  urlScheme?: "http" | "https" | undefined
  urlHash?: string | undefined
  urlLength?: number | undefined
  publicEvidenceFields: string[]
  auditOnlyFields: string[]
}

export type YeonjangBrowserFocusTargetProjectionResult =
  | { ok: true; projection: YeonjangBrowserFocusTargetProjection }
  | {
      ok: false
      reasonCode:
        | "target_identity_missing"
        | "target_alias_invalid"
        | "process_name_invalid"
        | "title_invalid"
        | "url_invalid"
    }

export type YeonjangBrowserFocusPostCheckDecision =
  | {
      state: "VERIFIED"
      reasonCode: "focused_target_matched"
      evidence: YeonjangBrowserFocusPostCheckEvidence
    }
  | {
      state: "MANUAL_INTERVENTION"
      reasonCode: "target_observation_required" | "focused_target_mismatch"
      evidence: YeonjangBrowserFocusPostCheckEvidence
    }
  | {
      state: "FAILED"
      reasonCode: "browser_focus_command_failed"
      evidence: YeonjangBrowserFocusPostCheckEvidence
    }

export interface YeonjangBrowserFocusPostCheckEvidence {
  commandAccepted: boolean
  expectedTarget: YeonjangBrowserFocusTargetProjection
  observedFocusedTarget?: YeonjangBrowserFocusTargetProjection | undefined
}

export type YeonjangBrowserFocusPreflightDecision =
  | {
      status: "blocked"
      reasonCode: "capability_not_supported" | "side_effect_authorization_required"
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      target: YeonjangBrowserFocusTargetProjection
    }
  | {
      status: "ready"
      reasonCode: "browser_focus_preflight_ready"
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      target: YeonjangBrowserFocusTargetProjection
    }

export type YeonjangFocusedBrowserObservationStatus =
  | "available"
  | "permission_required"
  | "unsupported"
  | "headless_unavailable"
  | "unknown"

export type YeonjangBrowserFocusReadinessPlatform =
  | "macos"
  | "windows"
  | "linux"
  | "unknown"

export type YeonjangBrowserFocusReadinessStatus =
  | "ready"
  | "target_identity_required"
  | "unsupported"
  | "permission_required"
  | "command_backend_required"
  | "observation_backend_required"
  | "headless_unavailable"

export type YeonjangBrowserFocusMissingRequirement =
  | "public_target_name"
  | "browser_focus_capability"
  | "browser_control_permission"
  | "browser_focus_command_backend"
  | "focused_target_observation_backend"
  | "interactive_desktop_session"

export type YeonjangBrowserFocusReadinessUserAction =
  | "ready_to_request_focus_approval"
  | "select_exact_yeonjang_target"
  | "install_supported_yeonjang"
  | "enable_browser_control_permission"
  | "update_or_reinstall_yeonjang"
  | "start_interactive_desktop_session"

export interface YeonjangBrowserFocusReadinessObservation {
  publicTargetName: string
  internalInstanceId?: string | undefined
  platform: YeonjangBrowserFocusReadinessPlatform
  desktopSession: "available" | "headless" | "unknown"
  capabilitySupported: boolean
  permissionGranted: boolean
  commandBackendAvailable: boolean
  observationBackendAvailable: boolean
  rawFocusedTarget?: YeonjangBrowserFocusTargetInput | undefined
}

export interface YeonjangBrowserFocusReadinessTargetProjection {
  publicTargetName: string
  platform: YeonjangBrowserFocusReadinessPlatform
  readinessStatus: YeonjangBrowserFocusReadinessStatus
  missingRequirementCount: number
  missingRequirements: YeonjangBrowserFocusMissingRequirement[]
  userAction: YeonjangBrowserFocusReadinessUserAction
}

export interface YeonjangBrowserFocusReadinessProjection {
  schemaVersion: "yeonjang-browser-focus-readiness-v1"
  method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
  permissionSetting: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.permissionSetting
  requiresApproval: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval
  requiresInteractiveDesktop: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.requiresInteractiveDesktop
  readyCount: number
  blockedCount: number
  targets: YeonjangBrowserFocusReadinessTargetProjection[]
}

export interface YeonjangBrowserFocusReadyTarget {
  publicTargetName: string
  platform: YeonjangBrowserFocusReadinessPlatform
  method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
  requiresApproval: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval
  permissionSetting: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.permissionSetting
}

export type YeonjangBrowserFocusToolAdmissionDecision =
  | {
      status: "blocked"
      reasonCode: "target_not_selectable" | "side_effect_authorization_required" | "capability_not_ready"
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      publicCandidateCount: number
    }
  | {
      status: "admitted"
      reasonCode: "browser_focus_admission_ready"
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      publicCandidateCount: number
      selectableTargets: YeonjangBrowserFocusReadyTarget[]
    }

export type YeonjangBrowserFocusCommandContractDecision =
  | {
      status: "blocked"
      reasonCode:
        | "admission_not_ready"
        | "command_backend_required"
        | "focused_target_observation_backend_required"
        | "headless_unavailable"
        | "platform_unsupported"
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      platform: YeonjangBrowserFocusReadinessPlatform
      requiresFocusedTargetObservation: true
    }
  | {
      status: "accepted"
      reasonCode: "browser_focus_command_contract_ready"
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      platform: Exclude<YeonjangBrowserFocusReadinessPlatform, "unknown">
      requiresFocusedTargetObservation: true
      target: YeonjangBrowserFocusTargetProjection
    }

export type YeonjangBrowserFocusLedgerBridgeReasonCode =
  | "side_effect_authorization_required"
  | "capability_not_ready"
  | "target_not_selectable"
  | "admission_not_ready"
  | "command_backend_required"
  | "focused_target_observation_backend_required"
  | "headless_unavailable"
  | "platform_unsupported"
  | "browser_focus_command_failed"
  | "target_observation_required"

export type YeonjangBrowserFocusLedgerBridgeResult =
  | {
      success: false
      error: "SIDE_EFFECT_OPERATION_BLOCKED"
      invokeAllowed: false
      details: {
        kind: "browser_focus_ledger_bridge"
        reasonCode: Exclude<
          YeonjangBrowserFocusLedgerBridgeReasonCode,
          "browser_focus_command_failed" | "target_observation_required"
        >
        method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      }
    }
  | {
      success: false
      error: "SIDE_EFFECT_MANUAL_INTERVENTION"
      invokeAllowed: true
      details: {
        kind: "browser_focus_ledger_bridge"
        reasonCode: "browser_focus_command_failed" | "target_observation_required"
        method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
        goalValidationCandidate: false
      }
    }

export type YeonjangBrowserFocusBindingGate =
  | "readiness_projection"
  | "side_effect_method_contract"
  | "approval_preflight"
  | "tool_admission"
  | "command_contract"
  | "focused_target_observation_backend"

export type YeonjangBrowserFocusBindingReadinessReasonCode =
  | "browser_focus_binding_ready"
  | "target_not_selectable"
  | "side_effect_method_contract_missing"
  | "side_effect_authorization_required"
  | "capability_not_ready"
  | "command_backend_required"
  | "focused_target_observation_backend_required"
  | "headless_unavailable"
  | "platform_unsupported"
  | "admission_not_ready"

export type YeonjangBrowserFocusBindingReadinessDecision =
  | {
      status: "ready_for_binding"
      reasonCode: "browser_focus_binding_ready"
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      publicCandidateCount: number
      requiredGates: YeonjangBrowserFocusBindingGate[]
    }
  | {
      status: "binding_blocked"
      reasonCode: Exclude<YeonjangBrowserFocusBindingReadinessReasonCode, "browser_focus_binding_ready">
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      publicCandidateCount: number
      requiredGates: YeonjangBrowserFocusBindingGate[]
    }

export type YeonjangBrowserFocusProductionBindingStep =
  | "rust_dispatch"
  | "tool_descriptor"
  | "tool_mapping"
  | "skill_catalog"
  | "dispatcher_integration"

export type YeonjangBrowserFocusProductionBindingIntegrationTest =
  | "dispatch_without_approval_blocks_before_invoke"
  | "dispatch_without_ready_capability_blocks_before_invoke"
  | "accepted_without_focused_observation_stays_manual"
  | "focused_observation_mismatch_stays_manual"
  | "focused_observation_match_verifies"
  | "raw_target_and_automation_internals_not_exposed"

export type YeonjangBrowserFocusProductionBindingDesignReasonCode =
  | "browser_focus_binding_design_ready"
  | "release_gate_not_ready"
  | "rust_dispatch_not_ready"
  | "focused_target_observation_backend_required"
  | "binding_readiness_not_ready"

export type YeonjangBrowserFocusProductionBindingDesign =
  | {
      status: "binding_design_ready"
      reasonCode: "browser_focus_binding_design_ready"
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      toolName: "yeonjang_browser_focus"
      addProductionBindingNow: false
      bindingOrder: YeonjangBrowserFocusProductionBindingStep[]
      requiredIntegrationTests: YeonjangBrowserFocusProductionBindingIntegrationTest[]
    }
  | {
      status: "binding_design_blocked"
      reasonCode: Exclude<
        YeonjangBrowserFocusProductionBindingDesignReasonCode,
        "browser_focus_binding_design_ready"
      >
      method: typeof YEONJANG_BROWSER_FOCUS_CONTRACT.method
      toolName: "yeonjang_browser_focus"
      addProductionBindingNow: false
      bindingOrder: YeonjangBrowserFocusProductionBindingStep[]
      requiredIntegrationTests: YeonjangBrowserFocusProductionBindingIntegrationTest[]
    }

const BROWSER_FOCUS_BINDING_GATES: YeonjangBrowserFocusBindingGate[] = [
  "readiness_projection",
  "side_effect_method_contract",
  "approval_preflight",
  "tool_admission",
  "command_contract",
  "focused_target_observation_backend",
]

const BROWSER_FOCUS_BINDING_ORDER: YeonjangBrowserFocusProductionBindingStep[] = [
  "rust_dispatch",
  "tool_descriptor",
  "tool_mapping",
  "skill_catalog",
  "dispatcher_integration",
]

const BROWSER_FOCUS_REQUIRED_INTEGRATION_TESTS: YeonjangBrowserFocusProductionBindingIntegrationTest[] = [
  "dispatch_without_approval_blocks_before_invoke",
  "dispatch_without_ready_capability_blocks_before_invoke",
  "accepted_without_focused_observation_stays_manual",
  "focused_observation_mismatch_stays_manual",
  "focused_observation_match_verifies",
  "raw_target_and_automation_internals_not_exposed",
]

export interface YeonjangFocusedBrowserObservationInput {
  platform: "macos" | "windows" | "linux" | "unknown"
  desktopSession: "available" | "headless" | "unknown"
  permissionGranted: boolean
  rawTarget?: YeonjangBrowserFocusTargetInput | undefined
  backendAvailable: boolean
}

export type YeonjangFocusedBrowserObservationResult =
  | {
      status: "available"
      platform: YeonjangFocusedBrowserObservationInput["platform"]
      focusedTarget: YeonjangBrowserFocusTargetProjection
    }
  | {
      status: Exclude<YeonjangFocusedBrowserObservationStatus, "available">
      platform: YeonjangFocusedBrowserObservationInput["platform"]
      reasonCode:
        | "desktop_session_headless"
        | "browser_focus_observation_permission_required"
        | "browser_focus_observation_unsupported"
        | "browser_focus_observation_unknown"
        | "browser_focus_target_unavailable"
    }

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/gu, " ")
  return normalized ? normalized : undefined
}

function hasControlCharacter(value: string): boolean {
  return /[\u0000-\u001f\u007f]/u.test(value)
}

function hashPublicEvidence(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

function parsePublicUrlSummary(url: string): {
  urlScheme: "http" | "https"
  urlHash: string
  urlLength: number
} | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    return {
      urlScheme: parsed.protocol === "https:" ? "https" : "http",
      urlHash: hashPublicEvidence(url),
      urlLength: url.length,
    }
  } catch {
    return null
  }
}

export function projectYeonjangBrowserFocusTarget(
  input: YeonjangBrowserFocusTargetInput,
): YeonjangBrowserFocusTargetProjectionResult {
  const targetAlias = normalizeOptionalText(input.targetAlias)
  const processName = normalizeOptionalText(input.processName)
  const title = normalizeOptionalText(input.title)
  const url = normalizeOptionalText(input.url)

  if (targetAlias && hasControlCharacter(targetAlias)) return { ok: false, reasonCode: "target_alias_invalid" }
  if (processName && hasControlCharacter(processName)) return { ok: false, reasonCode: "process_name_invalid" }
  if (title && hasControlCharacter(title)) return { ok: false, reasonCode: "title_invalid" }
  if (url && hasControlCharacter(url)) return { ok: false, reasonCode: "url_invalid" }
  if (!targetAlias && !processName && !title && !url) return { ok: false, reasonCode: "target_identity_missing" }

  const urlSummary = url ? parsePublicUrlSummary(url) : null
  if (url && !urlSummary) return { ok: false, reasonCode: "url_invalid" }

  return {
    ok: true,
    projection: {
      schemaVersion: "yeonjang-browser-focus-target-v1",
      targetKind: "browser_window_or_tab",
      ...(targetAlias ? { targetAlias } : {}),
      displayName: targetAlias ?? processName ?? "Browser target",
      ...(processName ? { processName } : {}),
      ...(title
        ? {
            titleHash: hashPublicEvidence(title),
            titleLength: title.length,
          }
        : {}),
      ...(urlSummary ?? {}),
      publicEvidenceFields: [
        "targetAlias",
        "displayName",
        "processName",
        "titleHash",
        "titleLength",
        "urlScheme",
        "urlHash",
        "urlLength",
      ],
      auditOnlyFields: [
        "rawTitle",
        "rawUrl",
        "pid",
        "windowId",
        "tabId",
      ],
    },
  }
}

export function evaluateYeonjangBrowserFocusPostCheck(input: {
  commandAccepted: boolean
  expectedTarget: YeonjangBrowserFocusTargetProjection
  observedFocusedTarget?: YeonjangBrowserFocusTargetProjection | undefined
}): YeonjangBrowserFocusPostCheckDecision {
  const evidence: YeonjangBrowserFocusPostCheckEvidence = {
    commandAccepted: input.commandAccepted,
    expectedTarget: input.expectedTarget,
    ...(input.observedFocusedTarget ? { observedFocusedTarget: input.observedFocusedTarget } : {}),
  }

  if (!input.commandAccepted) {
    return {
      state: "FAILED",
      reasonCode: "browser_focus_command_failed",
      evidence,
    }
  }

  if (!input.observedFocusedTarget) {
    return {
      state: "MANUAL_INTERVENTION",
      reasonCode: "target_observation_required",
      evidence,
    }
  }

  if (focusTargetsMatch(input.expectedTarget, input.observedFocusedTarget)) {
    return {
      state: "VERIFIED",
      reasonCode: "focused_target_matched",
      evidence,
    }
  }

  return {
    state: "MANUAL_INTERVENTION",
    reasonCode: "focused_target_mismatch",
    evidence,
  }
}

export function evaluateYeonjangBrowserFocusPreflight(input: {
  capabilitySupported: boolean
  approvalGranted: boolean
  target: YeonjangBrowserFocusTargetProjection
}): YeonjangBrowserFocusPreflightDecision {
  if (!input.capabilitySupported) {
    return {
      status: "blocked",
      reasonCode: "capability_not_supported",
      method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
      target: input.target,
    }
  }
  if (!input.approvalGranted) {
    return {
      status: "blocked",
      reasonCode: "side_effect_authorization_required",
      method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
      target: input.target,
    }
  }
  return {
    status: "ready",
    reasonCode: "browser_focus_preflight_ready",
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    target: input.target,
  }
}

export function observeYeonjangFocusedBrowserTargetContract(
  input: YeonjangFocusedBrowserObservationInput,
): YeonjangFocusedBrowserObservationResult {
  if (input.desktopSession === "headless") {
    return {
      status: "headless_unavailable",
      platform: input.platform,
      reasonCode: "desktop_session_headless",
    }
  }
  if (!input.permissionGranted) {
    return {
      status: "permission_required",
      platform: input.platform,
      reasonCode: "browser_focus_observation_permission_required",
    }
  }
  if (!input.backendAvailable) {
    return {
      status: input.platform === "unknown" ? "unknown" : "unsupported",
      platform: input.platform,
      reasonCode: input.platform === "unknown"
        ? "browser_focus_observation_unknown"
        : "browser_focus_observation_unsupported",
    }
  }
  if (!input.rawTarget) {
    return {
      status: "unknown",
      platform: input.platform,
      reasonCode: "browser_focus_target_unavailable",
    }
  }
  const projection = projectYeonjangBrowserFocusTarget(input.rawTarget)
  if (!projection.ok) {
    return {
      status: "unknown",
      platform: input.platform,
      reasonCode: "browser_focus_target_unavailable",
    }
  }
  return {
    status: "available",
    platform: input.platform,
    focusedTarget: projection.projection,
  }
}

export function buildYeonjangBrowserFocusReadinessProjection(input: {
  observations: readonly YeonjangBrowserFocusReadinessObservation[]
}): YeonjangBrowserFocusReadinessProjection {
  const targets = input.observations.map(projectBrowserFocusReadinessTarget)
  return {
    schemaVersion: "yeonjang-browser-focus-readiness-v1",
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    permissionSetting: YEONJANG_BROWSER_FOCUS_CONTRACT.permissionSetting,
    requiresApproval: YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval,
    requiresInteractiveDesktop: YEONJANG_BROWSER_FOCUS_CONTRACT.requiresInteractiveDesktop,
    readyCount: targets.filter((target) => target.readinessStatus === "ready").length,
    blockedCount: targets.filter((target) => target.readinessStatus !== "ready").length,
    targets,
  }
}

export function selectYeonjangBrowserFocusReadyTargets(
  projection: YeonjangBrowserFocusReadinessProjection,
): YeonjangBrowserFocusReadyTarget[] {
  return projection.targets
    .filter((target) => target.readinessStatus === "ready")
    .map((target) => ({
      publicTargetName: target.publicTargetName,
      platform: target.platform,
      method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
      requiresApproval: YEONJANG_BROWSER_FOCUS_CONTRACT.requiresApproval,
      permissionSetting: YEONJANG_BROWSER_FOCUS_CONTRACT.permissionSetting,
    }))
}

export function evaluateYeonjangBrowserFocusToolAdmission(input: {
  readyTargets: readonly YeonjangBrowserFocusReadyTarget[]
  approvalGranted: boolean
  preflight: YeonjangBrowserFocusPreflightDecision
}): YeonjangBrowserFocusToolAdmissionDecision {
  const publicCandidateCount = input.readyTargets.length
  if (publicCandidateCount === 0) {
    return {
      status: "blocked",
      reasonCode: "target_not_selectable",
      method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
      publicCandidateCount,
    }
  }
  if (!input.approvalGranted || input.preflight.reasonCode === "side_effect_authorization_required") {
    return {
      status: "blocked",
      reasonCode: "side_effect_authorization_required",
      method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
      publicCandidateCount,
    }
  }
  if (input.preflight.status !== "ready") {
    return {
      status: "blocked",
      reasonCode: "capability_not_ready",
      method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
      publicCandidateCount,
    }
  }
  return {
    status: "admitted",
    reasonCode: "browser_focus_admission_ready",
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    publicCandidateCount,
    selectableTargets: input.readyTargets.map((target) => ({ ...target })),
  }
}

export function buildYeonjangBrowserFocusCommandContract(input: {
  platform: YeonjangBrowserFocusReadinessPlatform
  desktopSession: "available" | "headless" | "unknown"
  commandBackendAvailable: boolean
  observationBackendAvailable: boolean
  admission: YeonjangBrowserFocusToolAdmissionDecision
  target: YeonjangBrowserFocusTargetProjection
  automationPlan?: string | undefined
}): YeonjangBrowserFocusCommandContractDecision {
  if (input.platform === "unknown") {
    return blockedBrowserFocusCommandContract("platform_unsupported", input.platform)
  }
  if (input.desktopSession === "headless") {
    return blockedBrowserFocusCommandContract("headless_unavailable", input.platform)
  }
  if (input.admission.status !== "admitted") {
    return blockedBrowserFocusCommandContract("admission_not_ready", input.platform)
  }
  if (!input.commandBackendAvailable) {
    return blockedBrowserFocusCommandContract("command_backend_required", input.platform)
  }
  if (!input.observationBackendAvailable) {
    return blockedBrowserFocusCommandContract("focused_target_observation_backend_required", input.platform)
  }
  return {
    status: "accepted",
    reasonCode: "browser_focus_command_contract_ready",
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    platform: input.platform,
    requiresFocusedTargetObservation: true,
    target: input.target,
  }
}

export function buildYeonjangBrowserFocusLedgerBridgeResult(input: {
  approvalGranted: boolean
  preflight: YeonjangBrowserFocusPreflightDecision
  admission: YeonjangBrowserFocusToolAdmissionDecision
  commandContract: YeonjangBrowserFocusCommandContractDecision
  commandAccepted: boolean
}): YeonjangBrowserFocusLedgerBridgeResult {
  if (!input.approvalGranted || input.preflight.reasonCode === "side_effect_authorization_required") {
    return blockedBrowserFocusLedgerBridge("side_effect_authorization_required")
  }
  if (input.preflight.status !== "ready") {
    return blockedBrowserFocusLedgerBridge("capability_not_ready")
  }
  if (input.admission.status !== "admitted") {
    return blockedBrowserFocusLedgerBridge(input.admission.reasonCode)
  }
  if (input.commandContract.status !== "accepted") {
    return blockedBrowserFocusLedgerBridge(input.commandContract.reasonCode)
  }
  return {
    success: false,
    error: "SIDE_EFFECT_MANUAL_INTERVENTION",
    invokeAllowed: true,
    details: {
      kind: "browser_focus_ledger_bridge",
      reasonCode: input.commandAccepted ? "target_observation_required" : "browser_focus_command_failed",
      method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
      goalValidationCandidate: false,
    },
  }
}

export function evaluateYeonjangBrowserFocusBindingReadiness(input: {
  readiness: YeonjangBrowserFocusReadinessProjection
  sideEffectMethodContractReady: boolean
  preflight: YeonjangBrowserFocusPreflightDecision
  admission: YeonjangBrowserFocusToolAdmissionDecision
  commandContract: YeonjangBrowserFocusCommandContractDecision
  observationBackendReady: boolean
}): YeonjangBrowserFocusBindingReadinessDecision {
  const publicCandidateCount = input.readiness.readyCount
  if (!input.observationBackendReady) {
    return blockedBrowserFocusBinding("focused_target_observation_backend_required", publicCandidateCount)
  }
  if (publicCandidateCount === 0) return blockedBrowserFocusBinding("target_not_selectable", publicCandidateCount)
  if (!input.sideEffectMethodContractReady) {
    return blockedBrowserFocusBinding("side_effect_method_contract_missing", publicCandidateCount)
  }
  if (input.preflight.reasonCode === "side_effect_authorization_required") {
    return blockedBrowserFocusBinding("side_effect_authorization_required", publicCandidateCount)
  }
  if (input.preflight.status !== "ready") {
    return blockedBrowserFocusBinding("capability_not_ready", publicCandidateCount)
  }
  if (input.admission.status !== "admitted") {
    return blockedBrowserFocusBinding(bindingReasonFromAdmission(input.admission.reasonCode), publicCandidateCount)
  }
  if (input.commandContract.status !== "accepted") {
    return blockedBrowserFocusBinding(bindingReasonFromCommandContract(input.commandContract.reasonCode), publicCandidateCount)
  }
  return {
    status: "ready_for_binding",
    reasonCode: "browser_focus_binding_ready",
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    publicCandidateCount,
    requiredGates: [...BROWSER_FOCUS_BINDING_GATES],
  }
}

function blockedBrowserFocusBinding(
  reasonCode: Exclude<YeonjangBrowserFocusBindingReadinessReasonCode, "browser_focus_binding_ready">,
  publicCandidateCount: number,
): Extract<YeonjangBrowserFocusBindingReadinessDecision, { status: "binding_blocked" }> {
  return {
    status: "binding_blocked",
    reasonCode,
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    publicCandidateCount,
    requiredGates: [...BROWSER_FOCUS_BINDING_GATES],
  }
}

function bindingReasonFromAdmission(
  reasonCode: Extract<YeonjangBrowserFocusToolAdmissionDecision, { status: "blocked" }>["reasonCode"],
): Exclude<YeonjangBrowserFocusBindingReadinessReasonCode, "browser_focus_binding_ready"> {
  if (reasonCode === "target_not_selectable") return "target_not_selectable"
  if (reasonCode === "side_effect_authorization_required") return "side_effect_authorization_required"
  return "capability_not_ready"
}

function bindingReasonFromCommandContract(
  reasonCode: Extract<YeonjangBrowserFocusCommandContractDecision, { status: "blocked" }>["reasonCode"],
): Exclude<YeonjangBrowserFocusBindingReadinessReasonCode, "browser_focus_binding_ready"> {
  switch (reasonCode) {
    case "command_backend_required":
      return "command_backend_required"
    case "focused_target_observation_backend_required":
      return "focused_target_observation_backend_required"
    case "headless_unavailable":
      return "headless_unavailable"
    case "platform_unsupported":
      return "platform_unsupported"
    case "admission_not_ready":
      return "admission_not_ready"
  }
}

export function buildYeonjangBrowserFocusProductionBindingDesign(input: {
  bindingReadiness: YeonjangBrowserFocusBindingReadinessDecision
  releaseGateReady: boolean
  rustDispatchReady: boolean
  focusedTargetObservationBackendReady: boolean
}): YeonjangBrowserFocusProductionBindingDesign {
  if (!input.releaseGateReady) return blockedBrowserFocusProductionBindingDesign("release_gate_not_ready")
  if (!input.rustDispatchReady) return blockedBrowserFocusProductionBindingDesign("rust_dispatch_not_ready")
  if (!input.focusedTargetObservationBackendReady) {
    return blockedBrowserFocusProductionBindingDesign("focused_target_observation_backend_required")
  }
  if (input.bindingReadiness.status !== "ready_for_binding") {
    return blockedBrowserFocusProductionBindingDesign("binding_readiness_not_ready")
  }
  return {
    status: "binding_design_ready",
    reasonCode: "browser_focus_binding_design_ready",
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    toolName: "yeonjang_browser_focus",
    addProductionBindingNow: false,
    bindingOrder: [...BROWSER_FOCUS_BINDING_ORDER],
    requiredIntegrationTests: [...BROWSER_FOCUS_REQUIRED_INTEGRATION_TESTS],
  }
}

function blockedBrowserFocusProductionBindingDesign(
  reasonCode: Extract<YeonjangBrowserFocusProductionBindingDesign, { status: "binding_design_blocked" }>["reasonCode"],
): Extract<YeonjangBrowserFocusProductionBindingDesign, { status: "binding_design_blocked" }> {
  return {
    status: "binding_design_blocked",
    reasonCode,
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    toolName: "yeonjang_browser_focus",
    addProductionBindingNow: false,
    bindingOrder: [...BROWSER_FOCUS_BINDING_ORDER],
    requiredIntegrationTests: [...BROWSER_FOCUS_REQUIRED_INTEGRATION_TESTS],
  }
}

function blockedBrowserFocusLedgerBridge(
  reasonCode: Extract<YeonjangBrowserFocusLedgerBridgeResult, { error: "SIDE_EFFECT_OPERATION_BLOCKED" }>["details"]["reasonCode"],
): Extract<YeonjangBrowserFocusLedgerBridgeResult, { error: "SIDE_EFFECT_OPERATION_BLOCKED" }> {
  return {
    success: false,
    error: "SIDE_EFFECT_OPERATION_BLOCKED",
    invokeAllowed: false,
    details: {
      kind: "browser_focus_ledger_bridge",
      reasonCode,
      method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    },
  }
}

function blockedBrowserFocusCommandContract(
  reasonCode: Extract<YeonjangBrowserFocusCommandContractDecision, { status: "blocked" }>["reasonCode"],
  platform: YeonjangBrowserFocusReadinessPlatform,
): Extract<YeonjangBrowserFocusCommandContractDecision, { status: "blocked" }> {
  return {
    status: "blocked",
    reasonCode,
    method: YEONJANG_BROWSER_FOCUS_CONTRACT.method,
    platform,
    requiresFocusedTargetObservation: true,
  }
}

function projectBrowserFocusReadinessTarget(
  observation: YeonjangBrowserFocusReadinessObservation,
): YeonjangBrowserFocusReadinessTargetProjection {
  const publicTargetName = normalizeOptionalText(observation.publicTargetName) ?? "Yeonjang target"
  const missingRequirements = collectBrowserFocusMissingRequirements(observation)
  const readinessStatus = browserFocusReadinessStatus(missingRequirements)
  return {
    publicTargetName,
    platform: observation.platform,
    readinessStatus,
    missingRequirementCount: missingRequirements.length,
    missingRequirements,
    userAction: browserFocusReadinessUserAction(readinessStatus),
  }
}

function collectBrowserFocusMissingRequirements(
  observation: YeonjangBrowserFocusReadinessObservation,
): YeonjangBrowserFocusMissingRequirement[] {
  if (!normalizeOptionalText(observation.publicTargetName)) return ["public_target_name"]
  if (observation.desktopSession === "headless") return ["interactive_desktop_session"]

  const missing: YeonjangBrowserFocusMissingRequirement[] = []
  if (!observation.capabilitySupported) missing.push("browser_focus_capability")
  if (!observation.permissionGranted) missing.push("browser_control_permission")
  if (!observation.commandBackendAvailable) missing.push("browser_focus_command_backend")
  if (!observation.observationBackendAvailable) missing.push("focused_target_observation_backend")
  return missing
}

function browserFocusReadinessStatus(
  missingRequirements: readonly YeonjangBrowserFocusMissingRequirement[],
): YeonjangBrowserFocusReadinessStatus {
  if (missingRequirements.length === 0) return "ready"
  if (missingRequirements.includes("public_target_name")) return "target_identity_required"
  if (missingRequirements.includes("interactive_desktop_session")) return "headless_unavailable"
  if (missingRequirements.includes("browser_focus_capability")) return "unsupported"
  if (missingRequirements.includes("browser_control_permission")) return "permission_required"
  if (missingRequirements.includes("browser_focus_command_backend")) return "command_backend_required"
  return "observation_backend_required"
}

function browserFocusReadinessUserAction(
  status: YeonjangBrowserFocusReadinessStatus,
): YeonjangBrowserFocusReadinessUserAction {
  switch (status) {
    case "ready":
      return "ready_to_request_focus_approval"
    case "target_identity_required":
      return "select_exact_yeonjang_target"
    case "unsupported":
      return "install_supported_yeonjang"
    case "permission_required":
      return "enable_browser_control_permission"
    case "headless_unavailable":
      return "start_interactive_desktop_session"
    case "command_backend_required":
    case "observation_backend_required":
      return "update_or_reinstall_yeonjang"
  }
}

function focusTargetsMatch(
  expected: YeonjangBrowserFocusTargetProjection,
  observed: YeonjangBrowserFocusTargetProjection,
): boolean {
  const checks: boolean[] = []
  // An alias is chosen by the caller and is not observable from the OS. It is
  // evidence only when it is the sole requested identity.
  if (
    expected.targetAlias &&
    !expected.processName &&
    !expected.titleHash &&
    !expected.urlHash
  ) {
    checks.push(observed.targetAlias === expected.targetAlias)
  }
  if (expected.processName) checks.push(observed.processName === expected.processName)
  if (expected.titleHash) checks.push(observed.titleHash === expected.titleHash)
  if (expected.urlHash) checks.push(observed.urlHash === expected.urlHash)
  return checks.length > 0 && checks.every(Boolean)
}
