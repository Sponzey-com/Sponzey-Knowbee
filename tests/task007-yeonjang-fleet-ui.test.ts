import { createElement } from "../packages/webui/node_modules/react/index.js"
import { renderToStaticMarkup } from "../packages/webui/node_modules/react-dom/server.js"
import { describe, expect, it } from "vitest"
import type { UiMode, YeonjangFleetResponse } from "../packages/webui/src/api/client.ts"
import { YeonjangFleetPanel } from "../packages/webui/src/components/setup/YeonjangFleetPanel.tsx"
import {
  describeYeonjangDefaultTargetSelection,
  resolveYeonjangFleetVisibility,
  resolveInspectableYeonjangInstance,
} from "../packages/webui/src/lib/yeonjang-fleet.ts"

function fleetResponse(): YeonjangFleetResponse {
  const now = 1_778_800_000_000
  return {
    ok: true,
    summary: {
      totalInstances: 2,
      online: 2,
      offline: 0,
      degraded: 0,
      permissionRequired: 0,
      updateRequired: 1,
      discovered: 0,
      duplicateLiveSessionInstances: 0,
      localCandidates: 1,
      localInstances: 1,
      remoteInstances: 1,
      trusted: 1,
      pending: 1,
      revoked: 0,
      quarantined: 0,
      foreignInstances: 0,
      unassignedScopeInstances: 0,
      activeWorkspaceScopeId: "workspace:local-default",
      localMarkerInstanceId: "instance:local",
      supportProfiles: {
        desktopInteractive: 1,
        desktopLimited: 1,
        headlessManaged: 0,
      },
      duplicateLocalDetected: false,
      defaultTarget: {
        ok: false,
        status: "selection_required",
        reasonCodes: ["remote_only_requires_explicit_selection"],
        uiAction: "ask_user",
      },
    },
    instances: [
      {
        instanceId: "instance:local",
        instanceAlias: "내 맥북",
        displayName: "MacBook Pro",
        normalizedCallName: "내맥북",
        nodeId: "yeonjang-main",
        supportProfile: "desktop_interactive",
        platform: "macos",
        arch: "aarch64",
        version: "0.3.1",
        protocolVersion: "1",
        capabilityHash: "cap-local",
        methodCount: 4,
        state: "online",
        stateMessage: "권한 준비 완료",
        lastSeenAt: now,
        liveSessionCount: 1,
        duplicateLiveSessionDetected: false,
        isLocalCandidate: true,
        localMarker: true,
        ownerUserId: "user:local",
        workspaceScopeId: "workspace:local-default",
        scopeAccess: "allowed",
        hostFingerprintPreview: "abcd1234",
        installFingerprintPreview: "install12",
        pairingFingerprintPreview: null,
        transport: ["mqtt"],
        session: {
          sessionId: "sess-local",
          clientId: "client-local",
          startupMode: "tray",
          windowMode: "hidden",
          trayState: "resident",
          state: "online",
          message: "connected",
          startedAt: now - 3_000,
          lastSeenAt: now,
          endedAt: null,
          stale: false,
        },
        location: "local",
        localityConfidence: "high",
        localityReasonCodes: ["matched_gateway_host_fingerprint"],
        trustState: "trusted",
        trustReason: "approved",
        runnableTarget: true,
        runnableReasonCodes: [],
        interactiveDesktop: true,
        trayWindowExpected: true,
        buildTarget: "darwin-universal",
        supportedMethods: ["screen_capture", "shell_exec", "mouse_click", "keyboard_type"],
        connectivityLatencyMs: null,
        lastHeartbeatAgeMs: 500,
        defaultTargetEligible: true,
        defaultTargetReasonCodes: ["eligible_local_interactive"],
      },
      {
        instanceId: "instance:remote",
        instanceAlias: "윈도우 오피스",
        displayName: "Windows Office",
        normalizedCallName: "윈도우오피스",
        nodeId: "yeonjang-windows",
        supportProfile: "desktop_limited",
        platform: "windows",
        arch: "x86_64",
        version: "0.2.9",
        protocolVersion: "0",
        capabilityHash: "cap-remote",
        methodCount: 3,
        state: "update_required",
        stateMessage: "업데이트 이후 재연결 필요",
        lastSeenAt: now - 60_000,
        liveSessionCount: 1,
        duplicateLiveSessionDetected: false,
        isLocalCandidate: false,
        localMarker: false,
        ownerUserId: null,
        workspaceScopeId: "workspace:local-default",
        scopeAccess: "allowed",
        hostFingerprintPreview: "remote999",
        installFingerprintPreview: "install99",
        pairingFingerprintPreview: "pairing1",
        transport: ["mqtt"],
        session: {
          sessionId: "sess-remote",
          clientId: "client-remote",
          startupMode: "tray",
          windowMode: "visible",
          trayState: "resident",
          state: "online",
          message: "connected",
          startedAt: now - 120_000,
          lastSeenAt: now - 60_000,
          endedAt: null,
          stale: false,
        },
        location: "remote",
        localityConfidence: "low",
        localityReasonCodes: ["gateway_host_mismatch"],
        trustState: "pending",
        trustReason: "pairing_required",
        runnableTarget: false,
        runnableReasonCodes: ["target_trust_pending"],
        interactiveDesktop: false,
        trayWindowExpected: true,
        buildTarget: "windows-x64",
        supportedMethods: ["screen_capture", "shell_exec", "app_launch"],
        connectivityLatencyMs: null,
        lastHeartbeatAgeMs: 60_000,
        defaultTargetEligible: false,
        defaultTargetReasonCodes: ["profile_not_desktop_interactive"],
      },
    ],
    diffSummaries: [
      {
        localInstanceId: "instance:local",
        localNodeId: "yeonjang-main",
        remoteInstanceId: "instance:remote",
        remoteNodeId: "yeonjang-windows",
        reasonCodes: ["version_mismatch", "protocol_version_mismatch", "missing_capability_on_remote", "update_required"],
        version: { local: "0.3.1", remote: "0.2.9", different: true },
        protocolVersion: { local: "1", remote: "0", different: true },
        permissionState: { local: "available", remote: "available", different: false },
        buildTarget: { local: "darwin-universal", remote: "windows-x64", different: true },
        platform: { local: "macos", remote: "windows", different: true },
        connectivityLatencyMs: { local: null, remote: null, different: false },
        lastHeartbeatAgeMs: { local: 500, remote: 60_000, different: true },
        supportedMethods: {
          localOnly: ["mouse_click", "keyboard_type"],
          remoteOnly: ["app_launch"],
        },
        updateRequired: true,
        permissionMismatch: false,
      },
    ],
    defaultTarget: {
      ok: false,
      status: "selection_required",
      reasonCodes: ["remote_only_requires_explicit_selection"],
      uiAction: "ask_user",
    },
    promptProjection: {
      registrySummary: {
        totalInstances: 2,
        online: 2,
        offline: 0,
        degraded: 0,
        permissionRequired: 0,
        updateRequired: 1,
        discovered: 0,
        duplicateLiveSessionInstances: 0,
        localCandidates: 1,
        localInstances: 1,
        remoteInstances: 1,
        trusted: 1,
        pending: 1,
        revoked: 0,
        quarantined: 0,
        foreignInstances: 0,
        unassignedScopeInstances: 0,
        activeWorkspaceScopeId: "workspace:local-default",
        localMarkerInstanceId: "instance:local",
        supportProfiles: {
          desktopInteractive: 1,
          desktopLimited: 1,
          headlessManaged: 0,
        },
        duplicateLocalDetected: false,
        defaultTarget: {
          ok: false,
          status: "selection_required",
          reasonCodes: ["remote_only_requires_explicit_selection"],
          uiAction: "ask_user",
        },
      },
      exactTargetCandidates: [
        {
          instanceId: "instance:local",
          nodeId: "yeonjang-main",
          instanceAlias: "내 맥북",
          displayName: "MacBook Pro",
          normalizedCallName: "내맥북",
          location: "local",
          supportProfile: "desktop_interactive",
          trustState: "trusted",
          scopeAccess: "allowed",
          state: "online",
          defaultTargetEligible: true,
        },
      ],
      defaultTarget: {
        ok: false,
        status: "selection_required",
        reasonCodes: ["remote_only_requires_explicit_selection"],
        uiAction: "ask_user",
      },
      localRemoteDiffs: [],
    },
    governanceHistory: [
      {
        id: "audit-1",
        at: now,
        action: "yeonjang_pairing_approved",
        result: "success",
        actor: "webui:operator",
        instanceId: "instance:remote",
        instanceAlias: "윈도우 오피스",
        displayName: "Windows Office",
        workspaceScopeId: "workspace:local-default",
        trustState: "trusted",
        reason: "approved for UI",
      },
    ],
    broadcastPolicies: {
      summary: {
        broadcastSafeTools: 1,
        blockedTools: 3,
        approvalRequiredTools: 2,
      },
    },
  }
}

function renderFleet(mode: UiMode, selectedInstanceId: string | null = "instance:remote"): string {
  return renderToStaticMarkup(createElement(YeonjangFleetPanel, {
    fleet: fleetResponse(),
    loading: false,
    error: "",
    actionPending: false,
    actionError: "",
    actionMessage: "",
    mode,
    selectedInstanceId,
    onSelectInstance: () => undefined,
    onRefresh: () => undefined,
    onApprovePairing: () => undefined,
    onUpdateTrust: () => undefined,
    onRenameInstance: () => undefined,
    onAssignLocalMarker: () => undefined,
  }))
}

describe("task007 yeonjang fleet ui", () => {
  it("gates fleet visibility by ui mode", () => {
    expect(resolveYeonjangFleetVisibility("beginner")).toBe("summary")
    expect(resolveYeonjangFleetVisibility("advanced")).toBe("fleet")
    expect(resolveYeonjangFleetVisibility("admin")).toBe("fleet")
  })

  it("renders advanced fleet list, inspector, diff viewer, and explicit picker guidance", () => {
    const markup = renderFleet("advanced")

    expect(markup).toContain("연장 Fleet")
    expect(markup).toContain("전체 연장 Fleet")
    expect(markup).toContain("윈도우 오피스")
    expect(markup).toContain("내 맥북")
    expect(markup).toContain("원격 연장만 online 상태라서 명시적으로 지정해야 합니다.")
    expect(markup).toContain("명시 대상 선택 위치")
    expect(markup).toContain("관리 제어면")
    expect(markup).toContain("로컬 대비 차이")
    expect(markup).toContain("신뢰와 Pairing")
    expect(markup).toContain("Governance 이력")
    expect(markup).toContain("버전 차이")
    expect(markup).toContain("원격 전용 기능")
    expect(markup).toContain("app_launch")
  })

  it("keeps beginner mode to current-device summary only", () => {
    const markup = renderFleet("beginner")

    expect(markup).toContain("현재 연결된 내 기기")
    expect(markup).not.toContain("전체 연장 Fleet")
    expect(markup).not.toContain("로컬 대비 차이")
  })

  it("resolves selected inspector instance and default target copy deterministically", () => {
    const fleet = fleetResponse()
    const selected = resolveInspectableYeonjangInstance(fleet, "instance:remote")

    expect(selected?.instanceAlias).toBe("윈도우 오피스")
    expect(describeYeonjangDefaultTargetSelection(fleet.defaultTarget, (ko) => ko)).toContain("명시적인 대상 지정")
  })
})
