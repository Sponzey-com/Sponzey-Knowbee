import { describe, expect, it } from "vitest"
import {
  evaluateYeonjangBrowserFocusPreflight,
  projectYeonjangBrowserFocusTarget,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"
import type {
  YeonjangBrowserFocusRegistrationPreconditionDecision,
} from "../packages/core/src/release/yeonjang-browser-focus-registration-precondition.ts"
import {
  evaluateYeonjangBrowserFocusToolDescriptorIntegrationSkeleton,
  type YeonjangBrowserFocusToolDescriptorSkeleton,
} from "../packages/core/src/release/yeonjang-browser-focus-tool-descriptor-integration-skeleton.ts"
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

function descriptor(input: Partial<YeonjangBrowserFocusToolDescriptorSkeleton> = {}): YeonjangBrowserFocusToolDescriptorSkeleton {
  return {
    toolName: "yeonjang_browser_focus",
    method: "browser.focus",
    riskLevel: "moderate",
    sideEffectClass: "process_control",
    permissionSetting: "allow_browser_control",
    requiresApproval: true,
    runtimeHealthMode: "required",
    postCheckMode: "focused_target_observation_required",
    rawPayloadVisibility: "audit_only",
    defaultLiveSmokeAllowed: false,
    ...input,
  }
}

function preflight(approvalGranted = true) {
  return evaluateYeonjangBrowserFocusPreflight({
    capabilitySupported: true,
    approvalGranted,
    target: target(),
  })
}

function registrationReady(): YeonjangBrowserFocusRegistrationPreconditionDecision {
  return {
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
  }
}

function registrationBlocked(): YeonjangBrowserFocusRegistrationPreconditionDecision {
  return {
    status: "registration_blocked",
    reasonCode: "production_exposure_not_executable",
    method: "browser.focus",
    toolName: "yeonjang_browser_focus",
    registerDispatcherNow: false,
    releaseGateStatus: "ready",
    exposureStatus: "not_executable",
    bindingReadinessStatus: "ready_for_binding",
    bindingDesignStatus: "binding_design_ready",
    blockedBy: "tool_mapping_not_registered",
  }
}

function commandSkeleton(status: "skeleton_ready" | "skeleton_blocked" = "skeleton_ready") {
  return {
    status,
    reasonCode: status === "skeleton_ready"
      ? "macos_browser_focus_command_skeleton_ready"
      : "command_backend_required",
    commandAccepted: false,
    executeOsFocusNow: false,
    postCheckMode: "focused_target_observation_required",
    auditOnlyFields: ["rawWindowTitle", "rawUrl", "automationScriptText"],
  } as const
}

describe("Task 132 Yeonjang browser.focus tool descriptor integration skeleton", () => {
  it("keeps browser.focus unregistered in the actual production tool and Skill inventories", () => {
    expect(evaluateYeonjangBrowserFocusToolDescriptorIntegrationSkeleton({
      descriptor: undefined,
      registrationPrecondition: registrationBlocked(),
      sideEffectMethodContractBound: false,
      preflight: preflight(),
      commandSkeleton: commandSkeleton(),
      focusedTargetObservationBackendReady: true,
    })).toMatchObject({
      status: "integration_blocked",
      reasonCode: "tool_not_registered",
      addProductionBindingNow: false,
      executable: false,
    })
    expect(YEONJANG_TOOL_MAPPINGS.flatMap((mapping) => mapping.methodIds)).toContain("browser.focus")
    expect(YEONJANG_TOOL_MAPPINGS.map((mapping) => mapping.toolName)).toContain("yeonjang_browser_focus")
    expect(YEONJANG_SKILL_TOOL_NAMES).toContain("yeonjang_browser_focus")
  })

  it("requires the descriptor shape to match the browser.focus side-effect contract boundary", () => {
    expect(evaluateYeonjangBrowserFocusToolDescriptorIntegrationSkeleton({
      descriptor: descriptor({ requiresApproval: false }),
      registrationPrecondition: registrationReady(),
      sideEffectMethodContractBound: true,
      preflight: preflight(),
      commandSkeleton: commandSkeleton(),
      focusedTargetObservationBackendReady: true,
    })).toMatchObject({
      status: "integration_blocked",
      reasonCode: "descriptor_contract_mismatch",
    })
  })

  it("does not promote a fake descriptor when side-effect binding, registration, approval, command skeleton, or observation is missing", () => {
    expect(evaluateYeonjangBrowserFocusToolDescriptorIntegrationSkeleton({
      descriptor: descriptor(),
      registrationPrecondition: registrationReady(),
      sideEffectMethodContractBound: false,
      preflight: preflight(),
      commandSkeleton: commandSkeleton(),
      focusedTargetObservationBackendReady: true,
    })).toMatchObject({
      status: "integration_blocked",
      reasonCode: "side_effect_method_contract_not_bound",
    })

    expect(evaluateYeonjangBrowserFocusToolDescriptorIntegrationSkeleton({
      descriptor: descriptor(),
      registrationPrecondition: registrationBlocked(),
      sideEffectMethodContractBound: true,
      preflight: preflight(),
      commandSkeleton: commandSkeleton(),
      focusedTargetObservationBackendReady: true,
    })).toMatchObject({
      status: "integration_blocked",
      reasonCode: "production_exposure_not_executable",
      blockedBy: "tool_mapping_not_registered",
    })

    expect(evaluateYeonjangBrowserFocusToolDescriptorIntegrationSkeleton({
      descriptor: descriptor(),
      registrationPrecondition: registrationReady(),
      sideEffectMethodContractBound: true,
      preflight: preflight(false),
      commandSkeleton: commandSkeleton(),
      focusedTargetObservationBackendReady: true,
    })).toMatchObject({
      status: "integration_blocked",
      reasonCode: "side_effect_authorization_required",
    })

    expect(evaluateYeonjangBrowserFocusToolDescriptorIntegrationSkeleton({
      descriptor: descriptor(),
      registrationPrecondition: registrationReady(),
      sideEffectMethodContractBound: true,
      preflight: preflight(),
      commandSkeleton: commandSkeleton("skeleton_blocked"),
      focusedTargetObservationBackendReady: true,
    })).toMatchObject({
      status: "integration_blocked",
      reasonCode: "command_skeleton_not_ready",
      blockedBy: "command_backend_required",
    })

    expect(evaluateYeonjangBrowserFocusToolDescriptorIntegrationSkeleton({
      descriptor: descriptor(),
      registrationPrecondition: registrationReady(),
      sideEffectMethodContractBound: true,
      preflight: preflight(),
      commandSkeleton: commandSkeleton(),
      focusedTargetObservationBackendReady: false,
    })).toMatchObject({
      status: "integration_blocked",
      reasonCode: "focused_target_observation_backend_required",
    })
  })

  it("returns a non-executing integration skeleton only when every gate is ready", () => {
    expect(evaluateYeonjangBrowserFocusToolDescriptorIntegrationSkeleton({
      descriptor: descriptor(),
      registrationPrecondition: registrationReady(),
      sideEffectMethodContractBound: true,
      preflight: preflight(),
      commandSkeleton: commandSkeleton(),
      focusedTargetObservationBackendReady: true,
    })).toEqual({
      status: "integration_skeleton_ready",
      reasonCode: "browser_focus_tool_descriptor_integration_skeleton_ready",
      method: "browser.focus",
      toolName: "yeonjang_browser_focus",
      addProductionBindingNow: false,
      executable: false,
      dispatcherIntegrationNow: false,
      descriptor: descriptor(),
      requiredGates: [
        "tool_descriptor",
        "side_effect_method_contract",
        "approval_preflight",
        "registration_precondition",
        "command_skeleton",
        "focused_target_observation_backend",
        "raw_payload_redaction",
      ],
    })
  })

  it("does not expose raw target or automation data in integration output", () => {
    const output = JSON.stringify(evaluateYeonjangBrowserFocusToolDescriptorIntegrationSkeleton({
      descriptor: descriptor(),
      registrationPrecondition: registrationReady(),
      sideEffectMethodContractBound: true,
      preflight: preflight(),
      commandSkeleton: commandSkeleton(),
      focusedTargetObservationBackendReady: true,
    }))

    expect(output).not.toMatch(
      /Private Admin Console|https:\/\/example\.test|token=private|4401|window-private|tab-private|automationScriptText/u,
    )
  })
})
