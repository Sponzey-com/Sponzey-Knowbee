import { describe, expect, it } from "vitest"
import type {
  YeonjangBrowserFocusProductionBindingDesign,
  YeonjangBrowserFocusProductionBindingIntegrationTest,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"
import {
  buildYeonjangBrowserFocusReleaseManifestCandidate,
} from "../packages/core/src/release/yeonjang-browser-focus-release-manifest-candidate.ts"

const REQUIRED_TESTS: YeonjangBrowserFocusProductionBindingIntegrationTest[] = [
  "dispatch_without_approval_blocks_before_invoke",
  "dispatch_without_ready_capability_blocks_before_invoke",
  "accepted_without_focused_observation_stays_manual",
  "focused_observation_mismatch_stays_manual",
  "focused_observation_match_verifies",
  "raw_target_and_automation_internals_not_exposed",
]

function bindingDesign(
  requiredIntegrationTests: YeonjangBrowserFocusProductionBindingIntegrationTest[] = REQUIRED_TESTS,
): YeonjangBrowserFocusProductionBindingDesign {
  return {
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
    requiredIntegrationTests,
  }
}

describe("Task 134 Yeonjang browser.focus release manifest integration candidate", () => {
  it("connects the required dispatcher integration test list to the browser.focus release candidate", () => {
    expect(buildYeonjangBrowserFocusReleaseManifestCandidate({
      bindingDesign: bindingDesign(),
      passedIntegrationTests: REQUIRED_TESTS,
      auditOnlyDetails: {
        rawWindowTitle: "Private Admin Console",
        rawUrl: "https://example.test/admin?token=private",
        internalInstanceId: "private-instance",
        receiptPayload: { private: true },
        automationScriptText: "private os focus script",
      },
    })).toEqual({
      schemaVersion: "yeonjang-browser-focus-release-manifest-candidate-v1",
      method: "browser.focus",
      toolName: "yeonjang_browser_focus",
      status: "release_candidate_ready",
      reasonCode: "browser_focus_release_manifest_candidate_ready",
      addProductionBindingNow: false,
      requiredIntegrationTests: REQUIRED_TESTS,
      passedIntegrationTests: REQUIRED_TESTS,
      missingIntegrationTests: [],
    })
  })

  it("blocks the release candidate when any required integration test is missing", () => {
    expect(buildYeonjangBrowserFocusReleaseManifestCandidate({
      bindingDesign: bindingDesign(),
      passedIntegrationTests: REQUIRED_TESTS.filter((testName) =>
        testName !== "focused_observation_match_verifies"
      ),
      auditOnlyDetails: {
        automationScriptText: "private os focus script",
      },
    })).toMatchObject({
      status: "release_candidate_blocked",
      reasonCode: "integration_tests_missing",
      addProductionBindingNow: false,
      missingIntegrationTests: ["focused_observation_match_verifies"],
    })
  })

  it("blocks when the binding design is not ready even if integration tests are present", () => {
    expect(buildYeonjangBrowserFocusReleaseManifestCandidate({
      bindingDesign: {
        status: "binding_design_blocked",
        reasonCode: "rust_dispatch_not_ready",
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
        requiredIntegrationTests: REQUIRED_TESTS,
      },
      passedIntegrationTests: REQUIRED_TESTS,
      auditOnlyDetails: {
        internalInstanceId: "private-instance",
      },
    })).toMatchObject({
      status: "release_candidate_blocked",
      reasonCode: "binding_design_not_ready",
      addProductionBindingNow: false,
      missingIntegrationTests: [],
    })
  })

  it("does not expose raw target, receipt, automation, or internal instance data in manifest public output", () => {
    const output = JSON.stringify(buildYeonjangBrowserFocusReleaseManifestCandidate({
      bindingDesign: bindingDesign(),
      passedIntegrationTests: REQUIRED_TESTS,
      auditOnlyDetails: {
        rawWindowTitle: "Private Admin Console",
        rawUrl: "https://example.test/admin?token=private",
        internalInstanceId: "private-instance",
        receiptPayload: { operationId: "private-operation", secret: "private-secret" },
        automationScriptText: "private os focus script",
      },
    }))

    expect(output).not.toMatch(
      /Private Admin Console|https:\/\/example\.test|token=private|private-instance|private-operation|private-secret|private os focus script|rawWindowTitle|rawUrl|receiptPayload|automationScriptText/u,
    )
  })
})
