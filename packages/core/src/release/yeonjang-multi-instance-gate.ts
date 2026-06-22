import { createYeonjangCommandDispatch } from "../yeonjang/mqtt-client.js"
import { planYeonjangBroadcastRun } from "../yeonjang/broadcast.js"
import type { YeonjangRegistryInstanceView } from "../yeonjang/registry.js"
import {
  buildYeonjangFleetProjection,
  type YeonjangProjectionSummary,
} from "../yeonjang/topology.js"
import { resolveYeonjangTargetSelection } from "../tools/builtin/yeonjang-target.js"

export type YeonjangMultiInstanceReleaseGateStatus = "passed" | "warning" | "failed"

export interface YeonjangMultiInstanceReleaseGateCheck {
  id:
    | "exact_target_regression"
    | "ambiguous_target_fail_guard"
    | "revoked_target_block_guard"
    | "broadcast_approval_guard"
    | "idempotency_delivery_guard"
    | "duplicate_session_guard"
  status: YeonjangMultiInstanceReleaseGateStatus
  summary: string
  detail: Record<string, unknown>
}

export interface YeonjangManualSmokeChecklistItem {
  id: "macos" | "windows" | "linux_desktop" | "linux_headless"
  profile: "desktop_interactive" | "headless_managed"
  status: "manual_required"
  title: string
  steps: string[]
}

export interface YeonjangMultiInstanceReleaseGateSummary {
  kind: "knowbee.release.yeonjang_multi_instance"
  generatedAt: string
  policyVersion: "2026-05-18.yeonjang-multi-instance.release-gate.v1"
  gateStatus: YeonjangMultiInstanceReleaseGateStatus
  liveFleetSummary: YeonjangProjectionSummary
  checks: YeonjangMultiInstanceReleaseGateCheck[]
  manualSmoke: YeonjangManualSmokeChecklistItem[]
  warnings: string[]
  blockingFailures: string[]
}

function makeRegistryInstance(
  input: Partial<YeonjangRegistryInstanceView> & Pick<
    YeonjangRegistryInstanceView,
    "instanceId" | "instanceAlias" | "displayName" | "normalizedCallName" | "nodeId"
  >,
): YeonjangRegistryInstanceView {
  const now = Date.UTC(2026, 4, 18, 0, 0, 0)
  return {
    instanceId: input.instanceId,
    instanceAlias: input.instanceAlias,
    displayName: input.displayName,
    normalizedCallName: input.normalizedCallName,
    nodeId: input.nodeId,
    supportProfile: input.supportProfile ?? "desktop_interactive",
    platform: input.platform ?? "macos",
    arch: input.arch ?? "arm64",
    version: input.version ?? "0.2.0",
    protocolVersion: input.protocolVersion ?? "2026-04-16.capability-matrix.v1",
    capabilityHash: input.capabilityHash ?? `${input.instanceId}-cap`,
    methodCount: input.methodCount ?? 3,
    state: input.state ?? "online",
    stateMessage: input.stateMessage ?? "ready",
    lastSeenAt: input.lastSeenAt ?? now,
    liveSessionCount: input.liveSessionCount ?? 1,
    duplicateLiveSessionDetected: input.duplicateLiveSessionDetected ?? false,
    isLocalCandidate: input.isLocalCandidate ?? false,
    localMarker: input.localMarker ?? false,
    ownerUserId: input.ownerUserId ?? "local:operator",
    workspaceScopeId: input.workspaceScopeId ?? "workspace:local-default",
    scopeAccess: input.scopeAccess ?? "allowed",
    trustState: input.trustState ?? "trusted",
    trustReason: input.trustReason ?? "fixture",
    pairingFingerprintPreview: input.pairingFingerprintPreview ?? "pairin...0001",
    runnableTarget: input.runnableTarget ?? true,
    runnableReasonCodes: input.runnableReasonCodes ?? [],
    hostFingerprintPreview: input.hostFingerprintPreview ?? null,
    installFingerprintPreview: input.installFingerprintPreview ?? "instal...0001",
    transport: input.transport ?? ["mqtt-json"],
    session: input.session ?? {
      sessionId: `sess-${input.instanceId}`,
      clientId: `client-${input.instanceId}`,
      startupMode: "manual",
      windowMode: "visible",
      trayState: "visible",
      state: "online",
      message: "ready",
      startedAt: now - 10_000,
      lastSeenAt: now,
      endedAt: null,
      stale: false,
    },
  }
}

function buildSyntheticRegistryInstances(): YeonjangRegistryInstanceView[] {
  return [
    makeRegistryInstance({
      instanceId: "inst-local-main",
      instanceAlias: "local-main",
      displayName: "Local Main Console",
      normalizedCallName: "local-main",
      nodeId: "yeonjang-main",
      isLocalCandidate: true,
      localMarker: true,
      hostFingerprintPreview: "hostaa...1111",
    }),
    makeRegistryInstance({
      instanceId: "inst-local-secondary",
      instanceAlias: "local-side",
      displayName: "Local Side Console",
      normalizedCallName: "local-side",
      nodeId: "yeonjang-local-side",
      isLocalCandidate: true,
      hostFingerprintPreview: "hostaa...1111",
    }),
    makeRegistryInstance({
      instanceId: "inst-remote-windows",
      instanceAlias: "windows-box",
      displayName: "Windows Review Console",
      normalizedCallName: "windows-review-console",
      nodeId: "yeonjang-win",
      platform: "windows",
      arch: "x64",
      hostFingerprintPreview: "hostbb...2222",
    }),
    makeRegistryInstance({
      instanceId: "inst-remote-revoked",
      instanceAlias: "revoked-box",
      displayName: "Revoked Review Console",
      normalizedCallName: "revoked-review-console",
      nodeId: "yeonjang-revoked",
      platform: "linux",
      arch: "x64",
      trustState: "revoked",
      runnableTarget: false,
      runnableReasonCodes: ["target_trust_revoked"],
      hostFingerprintPreview: "hostcc...3333",
    }),
    makeRegistryInstance({
      instanceId: "inst-remote-quarantined",
      instanceAlias: "quarantine-box",
      displayName: "Quarantined Console",
      normalizedCallName: "quarantined-console",
      nodeId: "yeonjang-quarantine",
      platform: "windows",
      arch: "x64",
      trustState: "quarantined",
      runnableTarget: false,
      runnableReasonCodes: ["target_trust_quarantined"],
      hostFingerprintPreview: "hostdd...4444",
    }),
  ]
}

function buildSyntheticFleetProjection() {
  const instances = buildSyntheticRegistryInstances()
  return buildYeonjangFleetProjection({
    instances,
    registrySummary: {
      totalInstances: instances.length,
      online: instances.filter((instance) => instance.state === "online").length,
      offline: instances.filter((instance) => instance.state === "offline").length,
      degraded: instances.filter((instance) => instance.state === "degraded").length,
      permissionRequired: instances.filter((instance) => instance.state === "permission_required").length,
      updateRequired: instances.filter((instance) => instance.state === "update_required").length,
      discovered: instances.filter((instance) => instance.state === "discovered").length,
      duplicateLiveSessionInstances: instances.filter((instance) => instance.duplicateLiveSessionDetected).length,
      duplicateConflictCount: 1,
      localCandidates: instances.filter((instance) => instance.isLocalCandidate).length,
      localInstances: 2,
      remoteInstances: 3,
      trusted: instances.filter((instance) => instance.trustState === "trusted").length,
      pending: instances.filter((instance) => instance.trustState === "pending").length,
      revoked: instances.filter((instance) => instance.trustState === "revoked").length,
      quarantined: instances.filter((instance) => instance.trustState === "quarantined").length,
      foreignInstances: instances.filter((instance) => instance.scopeAccess === "foreign").length,
      unassignedScopeInstances: instances.filter((instance) => instance.scopeAccess === "unassigned").length,
      activeWorkspaceScopeId: "workspace:local-default",
      localMarkerInstanceId: "inst-local-main",
    },
  })
}

function checkExactTarget(
  instances: YeonjangRegistryInstanceView[],
): YeonjangMultiInstanceReleaseGateCheck {
  const selection = resolveYeonjangTargetSelection({
    targetSelector: { type: "instance_alias", instanceAlias: "windows-box" },
    instances,
  })
  const passed = selection.ok
    && selection.status === "exact_match"
    && selection.instanceId === "inst-remote-windows"
    && selection.extensionId === "yeonjang-win"
  return {
    id: "exact_target_regression",
    status: passed ? "passed" : "failed",
    summary: passed
      ? "정확한 instance alias selector가 의도한 원격 연장으로만 해석됩니다."
      : "정확한 target selector가 의도한 인스턴스로 고정되지 않았습니다.",
    detail: {
      selectionStatus: selection.status,
      matchedInstanceId: selection.instanceId ?? null,
      matchedExtensionId: selection.extensionId ?? null,
      matchedSessionId: selection.targetSessionId ?? null,
    },
  }
}

function checkAmbiguousLocal(
  instances: YeonjangRegistryInstanceView[],
): YeonjangMultiInstanceReleaseGateCheck {
  const selection = resolveYeonjangTargetSelection({
    targetSelector: { type: "local" },
    instances,
  })
  const passed = !selection.ok && selection.status === "ambiguous_state"
  return {
    id: "ambiguous_target_fail_guard",
    status: passed ? "passed" : "failed",
    summary: passed
      ? "모호한 local selector는 자동 fallback 없이 UI 선택 요구로 멈춥니다."
      : "모호한 local selector가 차단되지 않았습니다.",
    detail: {
      selectionStatus: selection.status,
      uiAction: selection.uiAction,
      candidateCount: selection.proof.candidateList.length,
    },
  }
}

function checkRevokedTarget(
  instances: YeonjangRegistryInstanceView[],
): YeonjangMultiInstanceReleaseGateCheck {
  const selection = resolveYeonjangTargetSelection({
    targetSelector: { type: "instance_alias", instanceAlias: "revoked-box" },
    instances,
  })
  const passed = !selection.ok
    && selection.status === "target_unavailable"
    && selection.reasonCodes.includes("target_trust_revoked")
  return {
    id: "revoked_target_block_guard",
    status: passed ? "passed" : "failed",
    summary: passed
      ? "revoked 연장은 registry에 보여도 실행 대상으로 선택되지 않습니다."
      : "revoked 연장 차단 회귀가 발생했습니다.",
    detail: {
      selectionStatus: selection.status,
      reasonCodes: selection.reasonCodes,
    },
  }
}

function checkBroadcastApproval(
  instances: YeonjangRegistryInstanceView[],
): YeonjangMultiInstanceReleaseGateCheck {
  const plan = planYeonjangBroadcastRun({
    toolName: "shell_exec",
    targetSelector: { type: "all_online" },
    broadcastIntent: { confirm: true },
    instances,
  })
  const passed = !plan.ok
    && plan.code === "broadcast_policy_denied"
    && plan.reasonCodes.includes("broadcast_side_effect_requires_approval")
  return {
    id: "broadcast_approval_guard",
    status: passed ? "passed" : "failed",
    summary: passed
      ? "side-effect broadcast는 기본 정책에서 차단됩니다."
      : "dangerous broadcast 기본 차단 정책이 회귀했습니다.",
    detail: plan.ok
      ? { planned: true, targetCount: plan.plan.targets.length }
      : { code: plan.code, reasonCodes: plan.reasonCodes },
  }
}

function checkIdempotencyDelivery(): YeonjangMultiInstanceReleaseGateCheck {
  const first = createYeonjangCommandDispatch(
    "screen.capture",
    { display: 0 },
    {
      extensionId: "yeonjang-win",
      metadata: {
        commandId: "command-fixed",
        targetSessionId: "sess-inst-remote-windows",
      },
    },
  )
  const second = createYeonjangCommandDispatch(
    "screen.capture",
    { display: 0 },
    {
      extensionId: "yeonjang-win",
      metadata: {
        commandId: "command-fixed",
        targetSessionId: "sess-inst-remote-windows",
      },
    },
  )
  const passed = first.commandId === second.commandId
    && first.idempotencyKey === second.idempotencyKey
    && first.deliveryId !== second.deliveryId
  return {
    id: "idempotency_delivery_guard",
    status: passed ? "passed" : "failed",
    summary: passed
      ? "동일 command identity는 stable idempotency key와 분리된 delivery id를 유지합니다."
      : "idempotency/delivery envelope 규칙이 회귀했습니다.",
    detail: {
      first: {
        commandId: first.commandId,
        deliveryId: first.deliveryId,
        idempotencyKey: first.idempotencyKey,
      },
      second: {
        commandId: second.commandId,
        deliveryId: second.deliveryId,
        idempotencyKey: second.idempotencyKey,
      },
    },
  }
}

function checkDuplicateSessionGuard(
  instances: YeonjangRegistryInstanceView[],
): YeonjangMultiInstanceReleaseGateCheck {
  const selection = resolveYeonjangTargetSelection({
    targetSelector: { type: "instance_alias", instanceAlias: "quarantine-box" },
    instances,
  })
  const passed = !selection.ok
    && selection.status === "target_unavailable"
    && selection.reasonCodes.includes("target_trust_quarantined")
  return {
    id: "duplicate_session_guard",
    status: passed ? "passed" : "failed",
    summary: passed
      ? "quarantined duplicate-session 대상은 재실행 경로에서 차단됩니다."
      : "duplicate-session quarantine block 규칙이 회귀했습니다.",
    detail: {
      selectionStatus: selection.status,
      reasonCodes: selection.reasonCodes,
      coveredBy: [
        "tests/task009-yeonjang-session-claim.test.ts",
        "tests/task010-yeonjang-multi-instance-e2e.test.ts",
      ],
    },
  }
}

function buildManualSmokeChecklist(): YeonjangManualSmokeChecklistItem[] {
  return [
    {
      id: "macos",
      profile: "desktop_interactive",
      status: "manual_required",
      title: "macOS tray-first smoke",
      steps: [
        "start-yeonjang-macos.sh --restart 후 tray-first startup 확인",
        "tray 메뉴/창 열기/닫기/종료와 registry 등록, screen/camera/input baseline 확인",
      ],
    },
    {
      id: "windows",
      profile: "desktop_interactive",
      status: "manual_required",
      title: "Windows tray-first smoke",
      steps: [
        "start-yeonjang-windows.bat --restart 후 notify icon, double click, 종료 흐름 확인",
        "registry 등록과 screen/camera/input baseline 확인",
      ],
    },
    {
      id: "linux_desktop",
      profile: "desktop_interactive",
      status: "manual_required",
      title: "Linux desktop smoke",
      steps: [
        "start-yeonjang-linux.sh --restart 후 tray fallback과 registry 등록 확인",
        "desktop capability baseline과 상태 surface 확인",
      ],
    },
    {
      id: "linux_headless",
      profile: "headless_managed",
      status: "manual_required",
      title: "Linux headless smoke",
      steps: [
        "start-yeonjang-linux-headless.sh --restart 후 tray/window 기대 없이 registry/doctor 상태만 확인",
        "headless_managed capability baseline과 diagnostics 흐름 확인",
      ],
    },
  ]
}

export function buildYeonjangMultiInstanceReleaseGateSummary(
  options: { now?: Date; liveFleetProjection?: ReturnType<typeof buildYeonjangFleetProjection> } = {},
): YeonjangMultiInstanceReleaseGateSummary {
  const syntheticFleet = buildSyntheticFleetProjection()
  const checks = [
    checkExactTarget(syntheticFleet.instances),
    checkAmbiguousLocal(syntheticFleet.instances),
    checkRevokedTarget(syntheticFleet.instances),
    checkBroadcastApproval(syntheticFleet.instances),
    checkIdempotencyDelivery(),
    checkDuplicateSessionGuard(syntheticFleet.instances),
  ]
  const blockingFailures = checks
    .filter((check) => check.status === "failed")
    .map((check) => check.id)
  const manualSmoke = buildManualSmokeChecklist()
  const warnings = manualSmoke.length > 0 ? ["manual_smoke_not_run"] : []
  return {
    kind: "knowbee.release.yeonjang_multi_instance",
    generatedAt: (options.now ?? new Date()).toISOString(),
    policyVersion: "2026-05-18.yeonjang-multi-instance.release-gate.v1",
    gateStatus: blockingFailures.length > 0 ? "failed" : warnings.length > 0 ? "warning" : "passed",
    liveFleetSummary: (options.liveFleetProjection ?? buildYeonjangFleetProjection()).summary,
    checks,
    manualSmoke,
    warnings,
    blockingFailures,
  }
}
