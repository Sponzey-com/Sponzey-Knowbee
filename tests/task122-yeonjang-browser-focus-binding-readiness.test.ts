import { describe, expect, it } from "vitest"
import {
  buildYeonjangBrowserFocusCommandContract,
  buildYeonjangBrowserFocusReadinessProjection,
  evaluateYeonjangBrowserFocusBindingReadiness,
  evaluateYeonjangBrowserFocusPreflight,
  evaluateYeonjangBrowserFocusToolAdmission,
  projectYeonjangBrowserFocusTarget,
  selectYeonjangBrowserFocusReadyTargets,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"
import { getYeonjangSideEffectMethodContract } from "../packages/core/src/capabilities/yeonjang-side-effect-contract.ts"
import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"

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

function readyInputs(overrides: Partial<{
  targetReady: boolean
  sideEffectMethodContractReady: boolean
  approvalGranted: boolean
  capabilitySupported: boolean
  commandBackendAvailable: boolean
  observationBackendAvailable: boolean
}> = {}) {
  const values = {
    targetReady: true,
    sideEffectMethodContractReady: true,
    approvalGranted: true,
    capabilitySupported: true,
    commandBackendAvailable: true,
    observationBackendAvailable: true,
    ...overrides,
  }
  const readiness = buildYeonjangBrowserFocusReadinessProjection({
    observations: [{
      publicTargetName: values.targetReady ? "Office Mac" : "Linux Headless",
      internalInstanceId: "private-instance",
      platform: values.targetReady ? "macos" : "linux",
      desktopSession: values.targetReady ? "available" : "headless",
      capabilitySupported: true,
      permissionGranted: true,
      commandBackendAvailable: true,
      observationBackendAvailable: values.observationBackendAvailable,
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
    capabilitySupported: values.capabilitySupported,
    approvalGranted: values.approvalGranted,
    target: target(),
  })
  const admission = evaluateYeonjangBrowserFocusToolAdmission({
    readyTargets: selectYeonjangBrowserFocusReadyTargets(readiness),
    approvalGranted: values.approvalGranted,
    preflight,
  })
  const commandContract = buildYeonjangBrowserFocusCommandContract({
    platform: "macos",
    desktopSession: "available",
    commandBackendAvailable: values.commandBackendAvailable,
    observationBackendAvailable: values.observationBackendAvailable,
    admission,
    target: target(),
    automationPlan: "private os automation",
  })
  return {
    readiness,
    preflight,
    admission,
    commandContract,
    sideEffectMethodContractReady: values.sideEffectMethodContractReady,
    observationBackendReady: values.observationBackendAvailable,
  }
}

describe("Task 122 Yeonjang browser.focus binding readiness gate", () => {
  it("marks browser.focus ready for binding only when every pre-production gate is ready", () => {
    const decision = evaluateYeonjangBrowserFocusBindingReadiness(readyInputs())

    expect(decision).toEqual({
      status: "ready_for_binding",
      reasonCode: "browser_focus_binding_ready",
      method: "browser.focus",
      publicCandidateCount: 1,
      requiredGates: [
        "readiness_projection",
        "side_effect_method_contract",
        "approval_preflight",
        "tool_admission",
        "command_contract",
        "focused_target_observation_backend",
      ],
    })
    expect(getYeonjangSideEffectMethodContract("browser.focus")).toBeDefined()
    expect(YEONJANG_TOOL_MAPPINGS.flatMap((mapping) => mapping.methodIds)).toContain("browser.focus")
    expect(YEONJANG_TOOL_MAPPINGS.map((mapping) => mapping.toolName)).toContain("yeonjang_browser_focus")
    expect(YEONJANG_SKILL_TOOL_NAMES).toContain("yeonjang_browser_focus")
  })

  it("blocks binding readiness with public reason codes for each missing gate", () => {
    expect(evaluateYeonjangBrowserFocusBindingReadiness(readyInputs({ targetReady: false }))).toMatchObject({
      status: "binding_blocked",
      reasonCode: "target_not_selectable",
    })
    expect(evaluateYeonjangBrowserFocusBindingReadiness(readyInputs({ sideEffectMethodContractReady: false }))).toMatchObject({
      status: "binding_blocked",
      reasonCode: "side_effect_method_contract_missing",
    })
    expect(evaluateYeonjangBrowserFocusBindingReadiness(readyInputs({ approvalGranted: false }))).toMatchObject({
      status: "binding_blocked",
      reasonCode: "side_effect_authorization_required",
    })
    expect(evaluateYeonjangBrowserFocusBindingReadiness(readyInputs({ capabilitySupported: false }))).toMatchObject({
      status: "binding_blocked",
      reasonCode: "capability_not_ready",
    })
    expect(evaluateYeonjangBrowserFocusBindingReadiness(readyInputs({ commandBackendAvailable: false }))).toMatchObject({
      status: "binding_blocked",
      reasonCode: "command_backend_required",
    })
    expect(evaluateYeonjangBrowserFocusBindingReadiness(readyInputs({ observationBackendAvailable: false }))).toMatchObject({
      status: "binding_blocked",
      reasonCode: "focused_target_observation_backend_required",
    })
  })

  it("does not expose raw target or automation internals in binding readiness output", () => {
    const outputs = [
      evaluateYeonjangBrowserFocusBindingReadiness(readyInputs()),
      evaluateYeonjangBrowserFocusBindingReadiness(readyInputs({ observationBackendAvailable: false })),
    ]
    expect(JSON.stringify(outputs)).not.toMatch(
      /Private Admin Console|https:\/\/example\.test|token=private|4401|window-private|tab-private|private-instance|private os automation/u,
    )
  })
})
