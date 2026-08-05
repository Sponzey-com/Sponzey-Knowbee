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
  evaluateYeonjangBrowserFocusRegistrationPrecondition,
} from "../packages/core/src/release/yeonjang-browser-focus-registration-precondition.ts"
import {
  evaluateYeonjangBrowserFocusReleaseGate,
  YEONJANG_BROWSER_FOCUS_RELEASE_GATE_METHODS,
} from "../packages/core/src/release/yeonjang-browser-focus-release-gate.ts"
import { evaluateYeonjangBrowserFocusProductionExposureBoundary } from "../packages/core/src/release/yeonjang-browser-focus-production-exposure.ts"
import {
  projectYeonjangBrowserFocusBackendReadinessSources,
  type YeonjangBrowserFocusBackendReadinessSource,
} from "../packages/core/src/release/yeonjang-browser-focus-readiness-source.ts"
import { buildYeonjangPlatformAcceptanceMatrix } from "../packages/core/src/release/yeonjang-platform-acceptance.ts"

const NOW = 128_000

function readySource(): YeonjangBrowserFocusBackendReadinessSource {
  return {
    publicTargetName: "Office Mac",
    internalInstanceId: "private-instance",
    platform: "macos",
    desktopSession: "available",
    browserFocusCapabilityAdvertised: true,
    browserControlPermissionGranted: true,
    commandBackend: {
      status: "ready",
      evidenceSource: "platform_backend_probe",
      evidenceRef: "probe:macos:browser-focus:ready",
      auditOnlyDetails: {
        rawAutomationScript: "osascript private browser focus",
        rawWindowTitle: "Private Admin Console",
        rawUrl: "https://example.test/admin?token=private",
      },
    },
    observationBackend: {
      status: "ready",
      evidenceSource: "platform_backend_probe",
      evidenceRef: "probe:macos:focused-target:ready",
      auditOnlyDetails: {
        pid: 4401,
        windowId: "window-private",
        tabId: "tab-private",
      },
    },
  }
}

function releaseGate(source: YeonjangBrowserFocusBackendReadinessSource = readySource()) {
  const projected = projectYeonjangBrowserFocusBackendReadinessSources({
    sources: [source],
    observedAt: NOW,
  })
  const matrix = buildYeonjangPlatformAcceptanceMatrix({
    requiredPlatforms: ["macos"],
    availablePlatforms: ["macos"],
    deterministicReceipts: [{ platform: "macos", status: "passed", reasonCodes: [] }],
    liveRecords: [],
    requiredCapabilityMethods: YEONJANG_BROWSER_FOCUS_RELEASE_GATE_METHODS,
    capabilityReceipts: projected.capabilityReceipts,
    now: NOW,
    maxSessionAgeMs: 5_000,
  })
  return evaluateYeonjangBrowserFocusReleaseGate({
    platform: "macos",
    capabilityReadiness: matrix.platforms.find((item) => item.platform === "macos")?.capabilityReadiness ?? [],
  })
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

function bindingReadiness(approvalGranted = true) {
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
    approvalGranted,
    target: target(),
  })
  const admission = evaluateYeonjangBrowserFocusToolAdmission({
    readyTargets: selectYeonjangBrowserFocusReadyTargets(readiness),
    approvalGranted,
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

function executableExposure() {
  const readinessSource = projectYeonjangBrowserFocusBackendReadinessSources({
    sources: [readySource()],
    observedAt: NOW,
  })
  return evaluateYeonjangBrowserFocusProductionExposureBoundary({
    readinessSource,
    rustDispatchMethods: ["browser.focus"],
    mappedMethodIds: ["browser.focus"],
    mappedToolNames: ["yeonjang_browser_focus"],
    skillToolNames: ["yeonjang_browser_focus"],
  })
}

describe("Task 128 Yeonjang browser.focus dispatcher registration precondition", () => {
  it("blocks dispatcher registration when release gate is ready but production exposure is not executable", () => {
    const readinessSource = projectYeonjangBrowserFocusBackendReadinessSources({
      sources: [readySource()],
      observedAt: NOW,
    })
    const exposure = evaluateYeonjangBrowserFocusProductionExposureBoundary({
      readinessSource,
      rustDispatchMethods: [],
      mappedMethodIds: [],
      mappedToolNames: [],
      skillToolNames: [],
    })
    const readiness = bindingReadiness()
    const design = buildYeonjangBrowserFocusProductionBindingDesign({
      bindingReadiness: readiness,
      releaseGateReady: true,
      rustDispatchReady: true,
      focusedTargetObservationBackendReady: true,
    })

    expect(evaluateYeonjangBrowserFocusRegistrationPrecondition({
      releaseGate: releaseGate(),
      exposure,
      bindingReadiness: readiness,
      bindingDesign: design,
    })).toEqual({
      status: "registration_blocked",
      reasonCode: "production_exposure_not_executable",
      method: "browser.focus",
      toolName: "yeonjang_browser_focus",
      registerDispatcherNow: false,
      releaseGateStatus: "ready",
      exposureStatus: "not_executable",
      bindingReadinessStatus: "ready_for_binding",
      bindingDesignStatus: "binding_design_ready",
      blockedBy: "rust_dispatch_not_registered",
    })
  })

  it("blocks dispatcher registration when exposure is executable but binding readiness is not ready", () => {
    const readiness = bindingReadiness(false)
    const design = buildYeonjangBrowserFocusProductionBindingDesign({
      bindingReadiness: readiness,
      releaseGateReady: true,
      rustDispatchReady: true,
      focusedTargetObservationBackendReady: true,
    })

    expect(evaluateYeonjangBrowserFocusRegistrationPrecondition({
      releaseGate: releaseGate(),
      exposure: executableExposure(),
      bindingReadiness: readiness,
      bindingDesign: design,
    })).toMatchObject({
      status: "registration_blocked",
      reasonCode: "binding_readiness_not_ready",
      registerDispatcherNow: false,
      blockedBy: "side_effect_authorization_required",
    })
  })

  it("returns registration ready only when release gate, exposure, binding readiness, and binding design are all ready", () => {
    const readiness = bindingReadiness()
    const design = buildYeonjangBrowserFocusProductionBindingDesign({
      bindingReadiness: readiness,
      releaseGateReady: true,
      rustDispatchReady: true,
      focusedTargetObservationBackendReady: true,
    })

    expect(evaluateYeonjangBrowserFocusRegistrationPrecondition({
      releaseGate: releaseGate(),
      exposure: executableExposure(),
      bindingReadiness: readiness,
      bindingDesign: design,
    })).toEqual({
      status: "registration_ready",
      reasonCode: "browser_focus_dispatcher_registration_ready",
      method: "browser.focus",
      toolName: "yeonjang_browser_focus",
      registerDispatcherNow: false,
      releaseGateStatus: "ready",
      exposureStatus: "executable",
      bindingReadinessStatus: "ready_for_binding",
      bindingDesignStatus: "binding_design_ready",
      requiredPreconditions: [
        "release_gate",
        "production_exposure",
        "binding_readiness",
        "binding_design",
      ],
    })
  })

  it("does not expose raw probe, target, instance, or automation data in precondition output", () => {
    const readiness = bindingReadiness()
    const design = buildYeonjangBrowserFocusProductionBindingDesign({
      bindingReadiness: readiness,
      releaseGateReady: true,
      rustDispatchReady: true,
      focusedTargetObservationBackendReady: true,
    })
    const output = JSON.stringify(evaluateYeonjangBrowserFocusRegistrationPrecondition({
      releaseGate: releaseGate(),
      exposure: executableExposure(),
      bindingReadiness: readiness,
      bindingDesign: design,
    }))

    expect(output).not.toMatch(
      /private-|osascript|Private Admin Console|https:\/\/example\.test|token=private|4401|window-private|tab-private|private os automation/u,
    )
  })
})
