import { describe, expect, it } from "vitest"
import {
  buildYeonjangBrowserFocusProductionBindingDesign,
  buildYeonjangBrowserFocusReadinessProjection,
  evaluateYeonjangBrowserFocusBindingReadiness,
  evaluateYeonjangBrowserFocusPreflight,
  evaluateYeonjangBrowserFocusToolAdmission,
  buildYeonjangBrowserFocusCommandContract,
  projectYeonjangBrowserFocusTarget,
  selectYeonjangBrowserFocusReadyTargets,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"

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

function bindingReadiness(options: Partial<{
  releaseGateReady: boolean
  observationBackendReady: boolean
}> = {}) {
  const values = { releaseGateReady: true, observationBackendReady: true, ...options }
  const readiness = buildYeonjangBrowserFocusReadinessProjection({
    observations: [{
      publicTargetName: "Office Mac",
      internalInstanceId: "private-instance",
      platform: "macos",
      desktopSession: "available",
      capabilitySupported: values.releaseGateReady,
      permissionGranted: true,
      commandBackendAvailable: values.releaseGateReady,
      observationBackendAvailable: values.observationBackendReady,
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
    capabilitySupported: values.releaseGateReady,
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
    commandBackendAvailable: values.releaseGateReady,
    observationBackendAvailable: values.observationBackendReady,
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
    observationBackendReady: values.observationBackendReady,
  })
}

describe("Task 123 Yeonjang browser.focus production binding design", () => {
  it("keeps production binding blocked until release and observation gates are ready", () => {
    expect(buildYeonjangBrowserFocusProductionBindingDesign({
      bindingReadiness: bindingReadiness({ releaseGateReady: false }),
      releaseGateReady: false,
      rustDispatchReady: false,
      focusedTargetObservationBackendReady: true,
    })).toMatchObject({
      status: "binding_design_blocked",
      reasonCode: "release_gate_not_ready",
      method: "browser.focus",
      toolName: "yeonjang_browser_focus",
      addProductionBindingNow: false,
    })
    expect(buildYeonjangBrowserFocusProductionBindingDesign({
      bindingReadiness: bindingReadiness({ observationBackendReady: false }),
      releaseGateReady: true,
      rustDispatchReady: true,
      focusedTargetObservationBackendReady: false,
    })).toMatchObject({
      status: "binding_design_blocked",
      reasonCode: "focused_target_observation_backend_required",
      addProductionBindingNow: false,
    })
  })

  it("returns an ordered production binding plan only after all preconditions are ready", () => {
    const design = buildYeonjangBrowserFocusProductionBindingDesign({
      bindingReadiness: bindingReadiness(),
      releaseGateReady: true,
      rustDispatchReady: true,
      focusedTargetObservationBackendReady: true,
    })

    expect(design).toEqual({
      status: "binding_design_ready",
      reasonCode: "browser_focus_binding_design_ready",
      method: "browser.focus",
      toolName: "yeonjang_browser_focus",
      addProductionBindingNow: false,
      bindingOrder: [
        "rust_dispatch",
        "tool_descriptor",
        "tool_mapping",
        "skill_catalog",
        "dispatcher_integration",
      ],
      requiredIntegrationTests: [
        "dispatch_without_approval_blocks_before_invoke",
        "dispatch_without_ready_capability_blocks_before_invoke",
        "accepted_without_focused_observation_stays_manual",
        "focused_observation_mismatch_stays_manual",
        "focused_observation_match_verifies",
        "raw_target_and_automation_internals_not_exposed",
      ],
    })
  })

  it("does not expose target or automation internals in binding design output", () => {
    const output = JSON.stringify(buildYeonjangBrowserFocusProductionBindingDesign({
      bindingReadiness: bindingReadiness(),
      releaseGateReady: true,
      rustDispatchReady: true,
      focusedTargetObservationBackendReady: true,
    }))
    expect(output).not.toMatch(
      /Private Admin Console|https:\/\/example\.test|token=private|4401|window-private|tab-private|private-instance|private os automation/u,
    )
  })
})
