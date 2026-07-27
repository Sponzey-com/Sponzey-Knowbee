import { describe, expect, it } from "vitest"
import {
  buildYeonjangBrowserFocusCommandContract,
  buildYeonjangBrowserFocusProductionBindingDesign,
  buildYeonjangBrowserFocusReadinessProjection,
  evaluateYeonjangBrowserFocusBindingReadiness,
  evaluateYeonjangBrowserFocusPreflight,
  evaluateYeonjangBrowserFocusToolAdmission,
  projectYeonjangBrowserFocusTarget,
  selectYeonjangBrowserFocusReadyTargets,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"
import {
  evaluateYeonjangBrowserFocusReleaseGate,
  YEONJANG_BROWSER_FOCUS_RELEASE_GATE_METHODS,
} from "../packages/core/src/release/yeonjang-browser-focus-release-gate.ts"
import {
  buildYeonjangPlatformAcceptanceMatrix,
  type YeonjangPlatformCapabilityReceipt,
} from "../packages/core/src/release/yeonjang-platform-acceptance.ts"

const NOW = 124_000

function receipt(
  method: string,
  overrides: Partial<YeonjangPlatformCapabilityReceipt> = {},
): YeonjangPlatformCapabilityReceipt {
  return {
    platform: "macos",
    method,
    supported: true,
    permissionEnabled: true,
    toolHealthStatus: "ready",
    observedAt: NOW,
    evidenceRef: `capability:macos:${method.replace(".", "-")}:ready`,
    ...overrides,
  }
}

function capabilityReadiness(receipts: YeonjangPlatformCapabilityReceipt[]) {
  const matrix = buildYeonjangPlatformAcceptanceMatrix({
    requiredPlatforms: ["macos"],
    availablePlatforms: ["macos"],
    deterministicReceipts: [{ platform: "macos", status: "passed", reasonCodes: [] }],
    liveRecords: [],
    requiredCapabilityMethods: YEONJANG_BROWSER_FOCUS_RELEASE_GATE_METHODS,
    capabilityReceipts: receipts,
    now: NOW,
    maxSessionAgeMs: 5_000,
  })
  const row = matrix.platforms.find((item) => item.platform === "macos")
  expect(row).toBeDefined()
  return row?.capabilityReadiness ?? []
}

function target() {
  const projected = projectYeonjangBrowserFocusTarget({
    targetAlias: "업무 브라우저",
    processName: "Google Chrome",
    title: "Private Admin Console",
    url: "https://example.test/admin?token=private",
    pid: 4401,
    windowId: "window-private",
    tabId: "tab-private",
  })
  expect(projected.ok).toBe(true)
  if (!projected.ok) throw new Error("target projection failed")
  return projected.projection
}

function bindingReadiness() {
  const readiness = buildYeonjangBrowserFocusReadinessProjection({
    observations: [{
      publicTargetName: "Office Mac",
      internalInstanceId: "private-instance",
      platform: "macos",
      desktopSession: "available",
      capabilitySupported: true,
      permissionGranted: true,
      commandBackendAvailable: true,
      observationBackendAvailable: true,
      rawFocusedTarget: {
        title: "Private Admin Console",
        url: "https://example.test/admin?token=private",
        pid: 4401,
        windowId: "window-private",
        tabId: "tab-private",
      },
    }],
  })
  const preflight = evaluateYeonjangBrowserFocusPreflight({
    capabilitySupported: true,
    approvalGranted: true,
    target: target(),
  })
  const admission = evaluateYeonjangBrowserFocusToolAdmission({
    readyTargets: selectYeonjangBrowserFocusReadyTargets(readiness),
    approvalGranted: true,
    preflight,
  })
  const commandContract = buildYeonjangBrowserFocusCommandContract({
    platform: "macos",
    desktopSession: "available",
    commandBackendAvailable: true,
    observationBackendAvailable: true,
    admission,
    target: target(),
    automationPlan: "private os automation",
  })
  return evaluateYeonjangBrowserFocusBindingReadiness({
    readiness,
    sideEffectMethodContractReady: true,
    preflight,
    admission,
    commandContract,
    observationBackendReady: true,
  })
}

describe("Task 124 Yeonjang browser.focus release gate evidence", () => {
  it("requires browser.focus command backend and input.focused_target observation backend evidence before binding design can be ready", () => {
    const gate = evaluateYeonjangBrowserFocusReleaseGate({
      platform: "macos",
      capabilityReadiness: capabilityReadiness([
        receipt("browser.focus"),
        receipt("input.focused_target"),
      ]),
    })

    expect(gate).toEqual({
      status: "ready",
      reasonCode: "browser_focus_release_gate_ready",
      platform: "macos",
      method: "browser.focus",
      observationMethod: "input.focused_target",
      evidenceRefs: [
        "capability:macos:browser-focus:ready",
        "capability:macos:input-focused_target:ready",
      ],
    })
    expect(buildYeonjangBrowserFocusProductionBindingDesign({
      bindingReadiness: bindingReadiness(),
      releaseGateReady: gate.status === "ready",
      rustDispatchReady: gate.status === "ready",
      focusedTargetObservationBackendReady: gate.status === "ready",
    })).toMatchObject({
      status: "binding_design_ready",
      reasonCode: "browser_focus_binding_design_ready",
    })
  })

  it("keeps binding design release-gated when browser.focus command backend evidence is missing or failed", () => {
    const gate = evaluateYeonjangBrowserFocusReleaseGate({
      platform: "macos",
      capabilityReadiness: capabilityReadiness([
        receipt("browser.focus", { supported: false, toolHealthStatus: "unsupported" }),
        receipt("input.focused_target"),
      ]),
    })

    expect(gate).toMatchObject({
      status: "blocked",
      reasonCode: "release_gate_not_ready",
      method: "browser.focus",
      observationMethod: "input.focused_target",
      blockedMethod: "browser.focus",
      blockedStatus: "unsupported",
    })
    expect(buildYeonjangBrowserFocusProductionBindingDesign({
      bindingReadiness: bindingReadiness(),
      releaseGateReady: gate.status === "ready",
      rustDispatchReady: gate.status === "ready",
      focusedTargetObservationBackendReady: true,
    })).toMatchObject({
      status: "binding_design_blocked",
      reasonCode: "release_gate_not_ready",
    })
  })

  it("keeps binding design observation-gated when focused target observation backend evidence is missing or failed", () => {
    const gate = evaluateYeonjangBrowserFocusReleaseGate({
      platform: "macos",
      capabilityReadiness: capabilityReadiness([
        receipt("browser.focus"),
        receipt("input.focused_target", { permissionEnabled: false, toolHealthStatus: "permission_disabled" }),
      ]),
    })

    expect(gate).toMatchObject({
      status: "blocked",
      reasonCode: "focused_target_observation_backend_required",
      method: "browser.focus",
      observationMethod: "input.focused_target",
      blockedMethod: "input.focused_target",
      blockedStatus: "permission_disabled",
    })
    expect(buildYeonjangBrowserFocusProductionBindingDesign({
      bindingReadiness: bindingReadiness(),
      releaseGateReady: true,
      rustDispatchReady: true,
      focusedTargetObservationBackendReady: gate.status === "ready",
    })).toMatchObject({
      status: "binding_design_blocked",
      reasonCode: "focused_target_observation_backend_required",
    })
  })

  it("does not expose raw target, query token, process id, instance id, or automation script in release gate output", () => {
    const output = JSON.stringify(evaluateYeonjangBrowserFocusReleaseGate({
      platform: "macos",
      capabilityReadiness: capabilityReadiness([
        receipt("browser.focus", {
          evidenceRef: "capability:macos:browser-focus:sanitized-ready",
        }),
        receipt("input.focused_target", {
          evidenceRef: "capability:macos:focused-target:sanitized-ready",
        }),
      ]),
    }))

    expect(output).not.toMatch(
      /Private Admin Console|https:\/\/example\.test|token=private|4401|window-private|tab-private|private-instance|private os automation/u,
    )
  })
})
