import {
  buildYeonjangTargetSelectorSchemaProperty,
  normalizeYeonjangTargetSelector,
  serializeYeonjangTargetSelector,
  type YeonjangTargetSelector,
  type YeonjangTargetSelectorType,
  validateYeonjangTargetSelector,
} from "../../contracts/yeonjang-target.js"
import { normalizeYeonjangCallName } from "../../yeonjang/registry.js"
import {
  buildYeonjangFleetProjection,
  type YeonjangDefaultTargetSelection,
  type YeonjangFleetProjectionInput,
  type YeonjangProjectedInstance,
  type YeonjangTrustState,
  type YeonjangSupportProfile,
} from "../../yeonjang/topology.js"
import { recordYeonjangGovernanceAudit } from "../../yeonjang/registry.js"
import type { ToolContext } from "../types.js"

export interface YeonjangTargetResolutionCandidate {
  instanceId: string
  extensionId: string
  instanceAlias: string
  displayName: string
  normalizedAlias: string
  normalizedDisplayName: string
  normalizedCallName: string
  location: YeonjangProjectedInstance["location"]
  supportProfile: YeonjangSupportProfile
  trustState: YeonjangTrustState
  scopeAccess: YeonjangProjectedInstance["scopeAccess"]
  state: YeonjangProjectedInstance["state"]
}

export interface YeonjangTargetValidationResults {
  selector: "pass" | "fail" | "not_applicable"
  selectorMode: "pass" | "fail" | "not_applicable"
  availability: "pass" | "fail" | "not_applicable"
  supportProfile: "pass" | "fail" | "not_applicable"
  sessionBinding: "pass" | "fail" | "not_available" | "not_applicable"
  trust: "pass" | "fail" | "not_evaluated"
}

export interface YeonjangTargetResolutionProof {
  policyVersion: "2026-05-15.yeonjang-target-selector.v1"
  explicitTarget: boolean
  selectorSource: "default_target_policy" | "structured_target_selector" | "legacy_extension_id"
  selectorInput: YeonjangTargetSelector | null
  selectorSerialized: string | null
  legacyRequestedExtensionId: string | null
  selectionStatus: YeonjangTargetSelection["status"]
  matchedField: string | null
  matchedValue: string | null
  matchedInstanceId: string | null
  matchedExtensionId: string | null
  matchedSessionId: string | null
  expectedTargetSessionId: string | null
  candidateList: YeonjangTargetResolutionCandidate[]
  validationResults: YeonjangTargetValidationResults
  reasonCodes: string[]
}

export interface YeonjangTargetSelection {
  ok: boolean
  explicitTarget: boolean
  selector: YeonjangTargetSelector | null
  extensionId?: string
  instanceId?: string
  targetSessionId?: string | null
  status:
    | "exact_match"
    | "auto_selected_local_interactive"
    | "auto_selected_pinned_remote"
    | "selection_required"
    | "ambiguous_state"
    | "invalid_selector"
    | "unsupported_selector_mode"
    | "target_unavailable"
    | "stale_target"
  reasonCodes: string[]
  uiAction: "none" | "ask_user" | "ui_selection"
  proof: YeonjangTargetResolutionProof
}

export interface YeonjangTargetedToolParams {
  extensionId?: string
  targetSelector?: YeonjangTargetSelector
  targetSessionId?: string
}

interface RequestedSelectorInput {
  explicitTarget: boolean
  selectorSource: YeonjangTargetResolutionProof["selectorSource"]
  selector: YeonjangTargetSelector | null
  legacyRequestedExtensionId: string | null
}

interface ResolutionContext {
  input: RequestedSelectorInput
  expectedTargetSessionId: string | null
  requiredSupportProfiles: YeonjangSupportProfile[] | null
}

function normalize(value: string | null | undefined): string {
  return value?.trim() ?? ""
}

function defaultValidationResults(): YeonjangTargetValidationResults {
  return {
    selector: "not_applicable",
    selectorMode: "not_applicable",
    availability: "not_applicable",
    supportProfile: "not_applicable",
    sessionBinding: "not_applicable",
    trust: "not_evaluated",
  }
}

function buildProof(params: {
  input: RequestedSelectorInput
  expectedTargetSessionId: string | null
  selectionStatus: YeonjangTargetSelection["status"]
  matchedField?: string | null
  matchedValue?: string | null
  matchedInstanceId?: string | null
  matchedExtensionId?: string | null
  matchedSessionId?: string | null
  candidateList?: YeonjangTargetResolutionCandidate[]
  validationResults?: Partial<YeonjangTargetValidationResults>
  reasonCodes: string[]
}): YeonjangTargetResolutionProof {
  const selectorSerialized = params.input.selector ? serializeYeonjangTargetSelector(params.input.selector) : null
  const validationResults = {
    ...defaultValidationResults(),
    ...(params.input.explicitTarget ? { selector: "pass" as const } : {}),
    ...(params.validationResults ?? {}),
  }
  return {
    policyVersion: "2026-05-15.yeonjang-target-selector.v1",
    explicitTarget: params.input.explicitTarget,
    selectorSource: params.input.selectorSource,
    selectorInput: params.input.selector,
    selectorSerialized,
    legacyRequestedExtensionId: params.input.legacyRequestedExtensionId,
    selectionStatus: params.selectionStatus,
    matchedField: params.matchedField ?? null,
    matchedValue: params.matchedValue ?? null,
    matchedInstanceId: params.matchedInstanceId ?? null,
    matchedExtensionId: params.matchedExtensionId ?? null,
    matchedSessionId: params.matchedSessionId ?? null,
    expectedTargetSessionId: params.expectedTargetSessionId,
    candidateList: params.candidateList ?? [],
    validationResults,
    reasonCodes: [...params.reasonCodes],
  }
}

function selectionFromDefault(
  selection: YeonjangDefaultTargetSelection,
  input: RequestedSelectorInput,
): YeonjangTargetSelection {
  return {
    ok: selection.ok,
    explicitTarget: false,
    selector: null,
    status: selection.status,
    reasonCodes: [...selection.reasonCodes],
    uiAction: selection.uiAction,
    ...(selection.extensionId ? { extensionId: selection.extensionId } : {}),
    ...(selection.instanceId ? { instanceId: selection.instanceId } : {}),
    ...(selection.targetSessionId !== undefined ? { targetSessionId: selection.targetSessionId } : {}),
    proof: buildProof({
      input,
      expectedTargetSessionId: null,
      selectionStatus: selection.status,
      matchedField: selection.ok ? "default_target_policy" : null,
      matchedValue: selection.extensionId ?? selection.instanceId ?? null,
      matchedInstanceId: selection.instanceId ?? null,
      matchedExtensionId: selection.extensionId ?? null,
      matchedSessionId: selection.targetSessionId ?? null,
      validationResults: {
        selector: "not_applicable",
        selectorMode: "not_applicable",
        availability: selection.ok ? "pass" : "not_applicable",
        sessionBinding: "not_applicable",
      },
      reasonCodes: selection.reasonCodes,
    }),
  }
}

function buildCandidate(instance: YeonjangProjectedInstance): YeonjangTargetResolutionCandidate {
  return {
    instanceId: instance.instanceId,
    extensionId: instance.nodeId,
    instanceAlias: instance.instanceAlias,
    displayName: instance.displayName,
    normalizedAlias: normalizeYeonjangCallName(instance.instanceAlias),
    normalizedDisplayName: normalizeYeonjangCallName(instance.displayName),
    normalizedCallName: normalizeYeonjangCallName(instance.normalizedCallName),
    location: instance.location,
    supportProfile: instance.supportProfile,
    trustState: instance.trustState,
    scopeAccess: instance.scopeAccess,
    state: instance.state,
  }
}

function buildRequestedSelectorInput(params: {
  requestedExtensionId?: string | undefined
  targetSelector?: unknown
}): RequestedSelectorInput | YeonjangTargetSelection {
  const requested = normalize(params.requestedExtensionId)
  if (params.targetSelector != null && requested) {
    const input: RequestedSelectorInput = {
      explicitTarget: true,
      selectorSource: "structured_target_selector",
      selector: null,
      legacyRequestedExtensionId: requested,
    }
    return {
      ok: false,
      explicitTarget: true,
      selector: null,
      status: "invalid_selector",
      reasonCodes: ["conflicting_target_selector_and_extension_id"],
      uiAction: "ask_user",
      proof: buildProof({
        input,
        expectedTargetSessionId: null,
        selectionStatus: "invalid_selector",
        validationResults: {
          selector: "fail",
        },
        reasonCodes: ["conflicting_target_selector_and_extension_id"],
      }),
    }
  }

  if (params.targetSelector != null) {
    const validation = validateYeonjangTargetSelector(params.targetSelector)
    if (!validation.ok) {
      const input: RequestedSelectorInput = {
        explicitTarget: true,
        selectorSource: "structured_target_selector",
        selector: null,
        legacyRequestedExtensionId: null,
      }
      return {
        ok: false,
        explicitTarget: true,
        selector: null,
        status: "invalid_selector",
        reasonCodes: ["invalid_target_selector"],
        uiAction: "ask_user",
        proof: buildProof({
          input,
          expectedTargetSessionId: null,
          selectionStatus: "invalid_selector",
          validationResults: {
            selector: "fail",
          },
          reasonCodes: validation.issues.map((issue) => `selector_validation:${issue.path}`),
        }),
      }
    }
    return {
      explicitTarget: true,
      selectorSource: "structured_target_selector",
      selector: normalizeYeonjangTargetSelector(validation.value),
      legacyRequestedExtensionId: null,
    }
  }

  if (requested) {
    return {
      explicitTarget: true,
      selectorSource: "legacy_extension_id",
      selector: null,
      legacyRequestedExtensionId: requested,
    }
  }

  return {
    explicitTarget: false,
    selectorSource: "default_target_policy",
    selector: null,
    legacyRequestedExtensionId: null,
  }
}

function selectStructuredCandidates(
  selector: YeonjangTargetSelector,
  instances: YeonjangProjectedInstance[],
): {
  candidates: YeonjangProjectedInstance[]
  matchedField: string
  matchedValue: string
  reasonCode: string
  selectorType: YeonjangTargetSelectorType
} | YeonjangTargetSelection {
  switch (selector.type) {
    case "local": {
      return {
        candidates: instances.filter((instance) => instance.location === "local"),
        matchedField: "location",
        matchedValue: "local",
        reasonCode: "explicit_local_selector",
        selectorType: "local",
      }
    }
    case "instance_id": {
      return {
        candidates: instances.filter((instance) => instance.instanceId === selector.instanceId),
        matchedField: "instance_id",
        matchedValue: selector.instanceId,
        reasonCode: "exact_instance_id_match",
        selectorType: "instance_id",
      }
    }
    case "instance_alias": {
      const normalizedAlias = normalizeYeonjangCallName(selector.instanceAlias)
      return {
        candidates: instances.filter((instance) => normalizeYeonjangCallName(instance.instanceAlias) === normalizedAlias),
        matchedField: "instance_alias",
        matchedValue: normalizedAlias,
        reasonCode: "exact_instance_alias_match",
        selectorType: "instance_alias",
      }
    }
    case "call_name": {
      const normalizedCallName = normalizeYeonjangCallName(selector.callName)
      return {
        candidates: instances.filter((instance) => {
          const alias = normalizeYeonjangCallName(instance.instanceAlias)
          const display = normalizeYeonjangCallName(instance.displayName)
          const callName = normalizeYeonjangCallName(instance.normalizedCallName)
          return alias === normalizedCallName || display === normalizedCallName || callName === normalizedCallName
        }),
        matchedField: "call_name",
        matchedValue: normalizedCallName,
        reasonCode: "exact_call_name_match",
        selectorType: "call_name",
      }
    }
    case "all_online":
    case "filtered_group": {
      const input: RequestedSelectorInput = {
        explicitTarget: true,
        selectorSource: "structured_target_selector",
        selector,
        legacyRequestedExtensionId: null,
      }
      return {
        ok: false,
        explicitTarget: true,
        selector,
        status: "unsupported_selector_mode",
        reasonCodes: ["broadcast_selector_not_supported_in_single_target_tool"],
        uiAction: "ask_user",
        proof: buildProof({
          input,
          expectedTargetSessionId: null,
          selectionStatus: "unsupported_selector_mode",
          validationResults: {
            selectorMode: "fail",
          },
          reasonCodes: ["broadcast_selector_not_supported_in_single_target_tool"],
        }),
      }
    }
  }
}

function selectLegacyCandidates(
  requested: string,
  instances: YeonjangProjectedInstance[],
): {
  candidates: YeonjangProjectedInstance[]
  matchedField: string
  matchedValue: string
  reasonCode: string
} {
  const exactNode = instances.find((instance) => normalize(instance.nodeId) === requested)
  if (exactNode) {
    return {
      candidates: [exactNode],
      matchedField: "extension_id",
      matchedValue: requested,
      reasonCode: "exact_extension_id_match",
    }
  }

  const exactInstance = instances.find((instance) => normalize(instance.instanceId) === requested)
  if (exactInstance) {
    return {
      candidates: [exactInstance],
      matchedField: "instance_id",
      matchedValue: requested,
      reasonCode: "exact_instance_id_match",
    }
  }

  const normalizedRequested = normalizeYeonjangCallName(requested)
  const candidates = instances.filter((instance) => {
    const normalizedAlias = normalizeYeonjangCallName(instance.instanceAlias)
    const normalizedDisplay = normalizeYeonjangCallName(instance.displayName)
    const normalizedCallName = normalizeYeonjangCallName(instance.normalizedCallName)
    return normalizedAlias === normalizedRequested
      || normalizedDisplay === normalizedRequested
      || normalizedCallName === normalizedRequested
  })
  return {
    candidates,
    matchedField: "call_name",
    matchedValue: normalizedRequested,
    reasonCode: "exact_call_name_match",
  }
}

function validateMatchedTarget(
  instance: YeonjangProjectedInstance,
  context: ResolutionContext,
  matchedField: string,
  matchedValue: string,
  reasonCode: string,
): YeonjangTargetSelection {
  const reasonCodes = [reasonCode]
  const targetSessionId = instance.session?.sessionId ?? null
  const validationResults: Partial<YeonjangTargetValidationResults> = {
    selectorMode: context.input.explicitTarget ? "pass" : "not_applicable",
    availability: "pass",
    supportProfile: "not_applicable",
    sessionBinding: "not_applicable",
    trust: "not_evaluated",
  }

  if (instance.state !== "online" && instance.state !== "degraded") {
    validationResults.availability = "fail"
    reasonCodes.push(`target_state_${instance.state}`)
    return {
      ok: false,
      explicitTarget: context.input.explicitTarget,
      selector: context.input.selector,
      extensionId: instance.nodeId,
      instanceId: instance.instanceId,
      targetSessionId,
      status: "target_unavailable",
      reasonCodes,
      uiAction: "none",
      proof: buildProof({
        input: context.input,
        expectedTargetSessionId: context.expectedTargetSessionId,
        selectionStatus: "target_unavailable",
        matchedField,
        matchedValue,
        matchedInstanceId: instance.instanceId,
        matchedExtensionId: instance.nodeId,
        matchedSessionId: targetSessionId,
        candidateList: [buildCandidate(instance)],
        validationResults,
        reasonCodes,
      }),
    }
  }

  if (instance.trustState === "pending" || instance.trustState === "revoked" || instance.trustState === "quarantined") {
    validationResults.trust = "fail"
    reasonCodes.push(
      instance.trustState === "pending"
        ? "target_trust_pending"
        : instance.trustState === "quarantined"
          ? "target_trust_quarantined"
          : "target_trust_revoked",
    )
    return {
      ok: false,
      explicitTarget: context.input.explicitTarget,
      selector: context.input.selector,
      extensionId: instance.nodeId,
      instanceId: instance.instanceId,
      targetSessionId,
      status: "target_unavailable",
      reasonCodes,
      uiAction: "none",
      proof: buildProof({
        input: context.input,
        expectedTargetSessionId: context.expectedTargetSessionId,
        selectionStatus: "target_unavailable",
        matchedField,
        matchedValue,
        matchedInstanceId: instance.instanceId,
        matchedExtensionId: instance.nodeId,
        matchedSessionId: targetSessionId,
        candidateList: [buildCandidate(instance)],
        validationResults,
        reasonCodes,
      }),
    }
  }

  if (instance.trustState === "trusted") {
    validationResults.trust = "pass"
  }

  if (instance.scopeAccess === "foreign" || instance.scopeAccess === "unassigned") {
    validationResults.availability = "fail"
    reasonCodes.push(
      instance.scopeAccess === "foreign"
        ? "workspace_scope_forbidden"
        : "workspace_scope_unassigned",
    )
    return {
      ok: false,
      explicitTarget: context.input.explicitTarget,
      selector: context.input.selector,
      extensionId: instance.nodeId,
      instanceId: instance.instanceId,
      targetSessionId,
      status: "target_unavailable",
      reasonCodes,
      uiAction: "none",
      proof: buildProof({
        input: context.input,
        expectedTargetSessionId: context.expectedTargetSessionId,
        selectionStatus: "target_unavailable",
        matchedField,
        matchedValue,
        matchedInstanceId: instance.instanceId,
        matchedExtensionId: instance.nodeId,
        matchedSessionId: targetSessionId,
        candidateList: [buildCandidate(instance)],
        validationResults,
        reasonCodes,
      }),
    }
  }

  if (context.requiredSupportProfiles && !context.requiredSupportProfiles.includes(instance.supportProfile)) {
    validationResults.supportProfile = "fail"
    reasonCodes.push("target_unsupported_profile")
    return {
      ok: false,
      explicitTarget: context.input.explicitTarget,
      selector: context.input.selector,
      extensionId: instance.nodeId,
      instanceId: instance.instanceId,
      targetSessionId,
      status: "target_unavailable",
      reasonCodes,
      uiAction: "none",
      proof: buildProof({
        input: context.input,
        expectedTargetSessionId: context.expectedTargetSessionId,
        selectionStatus: "target_unavailable",
        matchedField,
        matchedValue,
        matchedInstanceId: instance.instanceId,
        matchedExtensionId: instance.nodeId,
        matchedSessionId: targetSessionId,
        candidateList: [buildCandidate(instance)],
        validationResults,
        reasonCodes,
      }),
    }
  }

  if (context.requiredSupportProfiles) {
    validationResults.supportProfile = "pass"
  }

  if (context.expectedTargetSessionId) {
    if (!targetSessionId || targetSessionId !== context.expectedTargetSessionId) {
      validationResults.sessionBinding = "fail"
      reasonCodes.push("stale_target_session_mismatch")
      return {
        ok: false,
        explicitTarget: context.input.explicitTarget,
        selector: context.input.selector,
        extensionId: instance.nodeId,
        instanceId: instance.instanceId,
        targetSessionId,
        status: "stale_target",
        reasonCodes,
        uiAction: "none",
        proof: buildProof({
          input: context.input,
          expectedTargetSessionId: context.expectedTargetSessionId,
          selectionStatus: "stale_target",
          matchedField,
          matchedValue,
          matchedInstanceId: instance.instanceId,
          matchedExtensionId: instance.nodeId,
          matchedSessionId: targetSessionId,
          candidateList: [buildCandidate(instance)],
          validationResults,
          reasonCodes,
        }),
      }
    }
    validationResults.sessionBinding = "pass"
  } else {
    validationResults.sessionBinding = targetSessionId ? "pass" : "not_available"
  }

  return {
    ok: true,
    explicitTarget: context.input.explicitTarget,
    selector: context.input.selector,
    extensionId: instance.nodeId,
    instanceId: instance.instanceId,
    targetSessionId,
    status: "exact_match",
    reasonCodes,
    uiAction: "none",
    proof: buildProof({
      input: context.input,
      expectedTargetSessionId: context.expectedTargetSessionId,
      selectionStatus: "exact_match",
      matchedField,
      matchedValue,
      matchedInstanceId: instance.instanceId,
      matchedExtensionId: instance.nodeId,
      matchedSessionId: targetSessionId,
      candidateList: [buildCandidate(instance)],
      validationResults,
      reasonCodes,
    }),
  }
}

export function resolveYeonjangTargetSelection(params: {
  requestedExtensionId?: string | undefined
  targetSelector?: unknown
  expectedTargetSessionId?: string | undefined
  userMessage?: string | undefined
  pinnedDefaultRemoteInstanceId?: string | undefined
  requiredSupportProfiles?: YeonjangSupportProfile[] | undefined
  snapshots?: YeonjangFleetProjectionInput["snapshots"]
  instances?: YeonjangFleetProjectionInput["instances"]
  now?: number | undefined
}): YeonjangTargetSelection {
  const requestedInput = buildRequestedSelectorInput({
    requestedExtensionId: params.requestedExtensionId,
    targetSelector: params.targetSelector,
  })
  if ("ok" in requestedInput) {
    return requestedInput
  }

  const fleet = buildYeonjangFleetProjection({
    ...(params.snapshots ? { snapshots: params.snapshots } : {}),
    ...(params.instances ? { instances: params.instances } : {}),
    ...(params.now != null ? { now: params.now } : {}),
    ...(params.pinnedDefaultRemoteInstanceId
      ? { pinnedDefaultRemoteInstanceId: params.pinnedDefaultRemoteInstanceId }
      : {}),
  })
  const instances = fleet.instances
  if (!requestedInput.explicitTarget) {
    return selectionFromDefault(fleet.summary.defaultTarget, requestedInput)
  }

  const context: ResolutionContext = {
    input: requestedInput,
    expectedTargetSessionId: normalize(params.expectedTargetSessionId) || null,
    requiredSupportProfiles: params.requiredSupportProfiles?.length ? [...new Set(params.requiredSupportProfiles)] : null,
  }

  let selected:
    | {
      candidates: YeonjangProjectedInstance[]
      matchedField: string
      matchedValue: string
      reasonCode: string
    }
    | YeonjangTargetSelection

  if (requestedInput.selector) {
    selected = selectStructuredCandidates(requestedInput.selector, instances)
  } else {
    selected = selectLegacyCandidates(requestedInput.legacyRequestedExtensionId ?? "", instances)
  }

  if ("ok" in selected) {
    return selected
  }

  if (selected.candidates.length === 0) {
    const reasonCodes = ["requested_selector_not_found"]
    return {
      ok: false,
      explicitTarget: true,
      selector: requestedInput.selector,
      status: "selection_required",
      reasonCodes,
      uiAction: "ask_user",
      proof: buildProof({
        input: requestedInput,
        expectedTargetSessionId: context.expectedTargetSessionId,
        selectionStatus: "selection_required",
        matchedField: selected.matchedField,
        matchedValue: selected.matchedValue,
        validationResults: {
          selectorMode: requestedInput.selector ? "pass" : "not_applicable",
        },
        reasonCodes,
      }),
    }
  }

  if (selected.candidates.length > 1) {
    const reasonCodes = ["requested_selector_ambiguous"]
    return {
      ok: false,
      explicitTarget: true,
      selector: requestedInput.selector,
      status: "ambiguous_state",
      reasonCodes,
      uiAction: "ui_selection",
      proof: buildProof({
        input: requestedInput,
        expectedTargetSessionId: context.expectedTargetSessionId,
        selectionStatus: "ambiguous_state",
        matchedField: selected.matchedField,
        matchedValue: selected.matchedValue,
        candidateList: selected.candidates.map(buildCandidate),
        validationResults: {
          selectorMode: requestedInput.selector ? "pass" : "not_applicable",
        },
        reasonCodes,
      }),
    }
  }

  return validateMatchedTarget(
    selected.candidates[0]!,
    context,
    selected.matchedField,
    selected.matchedValue,
    selected.reasonCode,
  )
}

export function revalidateYeonjangTargetSelection(params: {
  selection: YeonjangTargetSelection
  requiredSupportProfiles?: YeonjangSupportProfile[] | undefined
  pinnedDefaultRemoteInstanceId?: string | undefined
  snapshots?: YeonjangFleetProjectionInput["snapshots"]
  instances?: YeonjangFleetProjectionInput["instances"]
  now?: number | undefined
}): YeonjangTargetSelection {
  if (!params.selection.ok || !params.selection.explicitTarget) {
    return params.selection
  }
  return resolveYeonjangTargetSelection({
    ...(params.selection.proof.legacyRequestedExtensionId
      ? { requestedExtensionId: params.selection.proof.legacyRequestedExtensionId }
      : {}),
    ...(params.selection.selector ? { targetSelector: params.selection.selector } : {}),
    ...(params.selection.targetSessionId ? { expectedTargetSessionId: params.selection.targetSessionId } : {}),
    ...(params.requiredSupportProfiles ? { requiredSupportProfiles: params.requiredSupportProfiles } : {}),
    ...(params.snapshots ? { snapshots: params.snapshots } : {}),
    ...(params.instances ? { instances: params.instances } : {}),
    ...(params.now != null ? { now: params.now } : {}),
    ...(params.pinnedDefaultRemoteInstanceId
      ? { pinnedDefaultRemoteInstanceId: params.pinnedDefaultRemoteInstanceId }
      : {}),
  })
}

export function buildYeonjangTargetResolutionDetails(selection: YeonjangTargetSelection): Record<string, unknown> {
  return {
    selectionStatus: selection.status,
    explicitTarget: selection.explicitTarget,
    ...(selection.selector ? { targetSelector: selection.selector } : {}),
    ...(selection.extensionId ? { extensionId: selection.extensionId } : {}),
    ...(selection.instanceId ? { instanceId: selection.instanceId } : {}),
    ...(selection.targetSessionId !== undefined ? { targetSessionId: selection.targetSessionId } : {}),
    targetResolutionProof: selection.proof,
  }
}

export function recordYeonjangRemoteExecutionApproval(params: {
  selection: YeonjangTargetSelection
  toolName: string
  ctx: Pick<ToolContext, "sessionId" | "runId" | "requestGroupId" | "source">
}): void {
  if (!params.selection.ok || !params.selection.instanceId) return
  const candidate = params.selection.proof.candidateList[0]
  if (!candidate || candidate.location !== "remote") return
  recordYeonjangGovernanceAudit({
    action: "yeonjang_remote_execution_approved",
    actor: `runtime:${params.ctx.source}`,
    instanceId: params.selection.instanceId,
    instanceAlias: candidate.instanceAlias,
    displayName: candidate.displayName,
    trustState: candidate.trustState,
    reason: params.selection.explicitTarget ? "explicit_remote_target" : "default_remote_target",
    detail: {
      toolName: params.toolName,
      extensionId: params.selection.extensionId ?? null,
      targetSessionId: params.selection.targetSessionId ?? null,
      requestGroupId: params.ctx.requestGroupId ?? params.ctx.runId,
      runId: params.ctx.runId,
      sessionId: params.ctx.sessionId,
      scopeAccess: candidate.scopeAccess,
      proof: params.selection.proof,
    },
  })
}

export function buildYeonjangTargetParameterProperties(defaultExtensionId: string): Record<string, unknown> {
  return {
    extensionId: {
      type: "string",
      description: `대상 Yeonjang 연장 ID. 기존 호환용 필드이며, 새 요청에서는 targetSelector 사용을 우선합니다. 기본값: ${defaultExtensionId}`,
    },
    targetSelector: buildYeonjangTargetSelectorSchemaProperty(),
    targetSessionId: {
      type: "string",
      description: "이전 선택 결과의 target session ID. 세션이 바뀌면 stale target으로 실패시킵니다.",
    },
  }
}

export function resolvePreferredYeonjangExtensionId(params: {
  requestedExtensionId?: string | undefined
  targetSelector?: unknown
  expectedTargetSessionId?: string | undefined
  userMessage?: string | undefined
  pinnedDefaultRemoteInstanceId?: string | undefined
  requiredSupportProfiles?: YeonjangSupportProfile[] | undefined
}): string | undefined {
  const selection = resolveYeonjangTargetSelection(params)
  return selection.ok ? selection.extensionId : undefined
}

export function buildYeonjangTargetSelectionFailure(selection: YeonjangTargetSelection): {
  output: string
  error: string
  details: Record<string, unknown>
} {
  const message = (() => {
    switch (selection.status) {
      case "invalid_selector":
        return "대상 연장 selector 형식이 잘못되어 실행할 수 없습니다. 구조화된 target selector를 다시 확인해 주세요."
      case "unsupported_selector_mode":
        return "현재 도구는 단일 연장만 대상으로 실행할 수 있습니다. 정확한 인스턴스를 하나만 지정해 주세요."
      case "ambiguous_state":
        return "대상 연장이 모호해서 실행할 수 없습니다. 정확한 인스턴스를 선택해 주세요."
      case "target_unavailable":
        if (selection.reasonCodes.includes("target_trust_revoked")) {
          return "지정한 연장은 신뢰가 철회되어 실행할 수 없습니다. 다른 연장으로 자동 전환하지 않고 중단합니다."
        }
        if (selection.reasonCodes.includes("target_trust_quarantined")) {
          return "지정한 연장은 격리 상태여서 실행할 수 없습니다. 다른 연장으로 자동 전환하지 않고 중단합니다."
        }
        if (selection.reasonCodes.includes("target_trust_pending")) {
          return "지정한 연장은 아직 신뢰 승인 대기 상태여서 실행할 수 없습니다. 다른 연장으로 자동 전환하지 않고 중단합니다."
        }
        if (selection.reasonCodes.includes("workspace_scope_forbidden")) {
          return "지정한 연장은 현재 workspace scope 밖에 있어서 실행할 수 없습니다. 다른 연장으로 자동 전환하지 않고 중단합니다."
        }
        if (selection.reasonCodes.includes("workspace_scope_unassigned")) {
          return "지정한 연장은 아직 workspace scope가 확정되지 않아 실행할 수 없습니다. 다른 연장으로 자동 전환하지 않고 중단합니다."
        }
        return "지정한 연장을 지금 사용할 수 없습니다. 다른 연장으로 자동 전환하지 않고 중단합니다."
      case "stale_target":
        return "지정한 연장의 세션이 바뀌어 실행을 중단했습니다. 최신 세션 기준으로 다시 선택해 주세요."
      case "selection_required":
      default:
        return "대상 연장을 자동으로 고를 수 없습니다. 정확한 인스턴스를 지정해 주세요."
    }
  })()

  const error = (() => {
    switch (selection.status) {
      case "invalid_selector":
        return "YEONJANG_TARGET_SELECTOR_INVALID"
      case "unsupported_selector_mode":
        return "YEONJANG_TARGET_SELECTOR_MODE_UNSUPPORTED"
      case "target_unavailable":
        return "YEONJANG_TARGET_UNAVAILABLE"
      case "stale_target":
        return "YEONJANG_TARGET_STALE"
      case "ambiguous_state":
      case "selection_required":
      default:
        return "YEONJANG_TARGET_SELECTION_REQUIRED"
    }
  })()

  return {
    output: `${message}\nreasonCodes: ${selection.reasonCodes.join(", ") || "unknown"}`,
    error,
    details: {
      requiredExecutor: "yeonjang",
      reasonCodes: selection.reasonCodes,
      uiAction: selection.uiAction,
      ...buildYeonjangTargetResolutionDetails(selection),
    },
  }
}
