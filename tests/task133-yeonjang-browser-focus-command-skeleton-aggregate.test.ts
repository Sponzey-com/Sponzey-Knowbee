import { describe, expect, it } from "vitest"
import {
  aggregateYeonjangBrowserFocusCommandSkeletons,
  type YeonjangBrowserFocusCommandSkeletonAggregateInput,
} from "../packages/core/src/release/yeonjang-browser-focus-command-skeleton-aggregate.ts"
import type { YeonjangBrowserFocusProductionExposureDecision } from "../packages/core/src/release/yeonjang-browser-focus-production-exposure.ts"

function skeleton(input: {
  platform: "macos" | "windows" | "linux"
  targetName: string
  status: "skeleton_ready" | "skeleton_blocked"
  reasonCode: string
}): YeonjangBrowserFocusCommandSkeletonAggregateInput {
  return {
    publicTargetName: input.targetName,
    platform: input.platform,
    skeleton: {
      status: input.status,
      reasonCode: input.reasonCode,
      method: "browser.focus",
      platform: input.platform,
      executeOsFocusNow: false,
      commandAccepted: false,
      requiresApproval: true,
      requiresFocusedTargetObservation: true,
      postCheckMode: "focused_target_observation_required",
      auditOnlyFields: [
        "rawWindowTitle",
        "rawUrl",
        "queryToken",
        "pid",
        "windowId",
        "tabId",
        "automationScriptText",
      ],
    },
    auditOnlyDetails: {
      rawWindowTitle: "Private Admin Console",
      rawUrl: "https://example.test/admin?token=private",
      internalInstanceId: "private-instance",
      automationScriptText: "private os focus script",
    },
  }
}

function notExecutableExposure(reasonCode = "rust_dispatch_not_registered"): YeonjangBrowserFocusProductionExposureDecision {
  return {
    status: "not_executable",
    reasonCode: reasonCode as "rust_dispatch_not_registered",
    method: "browser.focus",
    toolName: "yeonjang_browser_focus",
    releaseEvidenceReady: true,
    executable: false,
    missingInventory: ["rust_dispatch"],
  }
}

function executableExposure(): YeonjangBrowserFocusProductionExposureDecision {
  return {
    status: "executable",
    reasonCode: "browser_focus_production_exposure_ready",
    method: "browser.focus",
    toolName: "yeonjang_browser_focus",
    releaseEvidenceReady: true,
    executable: true,
    missingInventory: [],
  }
}

describe("Task 133 Yeonjang browser.focus command skeleton aggregate", () => {
  it("summarizes OS command skeleton states without exposing raw command details", () => {
    expect(aggregateYeonjangBrowserFocusCommandSkeletons({
      skeletons: [
        skeleton({
          platform: "macos",
          targetName: "Office Mac",
          status: "skeleton_ready",
          reasonCode: "macos_browser_focus_command_skeleton_ready",
        }),
        skeleton({
          platform: "windows",
          targetName: "Office Windows",
          status: "skeleton_blocked",
          reasonCode: "side_effect_authorization_required",
        }),
        skeleton({
          platform: "linux",
          targetName: "Office Linux Desktop",
          status: "skeleton_ready",
          reasonCode: "linux_browser_focus_command_skeleton_ready",
        }),
        skeleton({
          platform: "linux",
          targetName: "Linux Headless Runner",
          status: "skeleton_blocked",
          reasonCode: "headless_unavailable",
        }),
      ],
      productionExposure: notExecutableExposure(),
    })).toEqual({
      schemaVersion: "yeonjang-browser-focus-command-skeleton-aggregate-v1",
      method: "browser.focus",
      toolName: "yeonjang_browser_focus",
      status: "aggregate_blocked",
      reasonCode: "production_exposure_not_executable",
      executable: false,
      addProductionBindingNow: false,
      readyCount: 2,
      blockedCount: 2,
      platforms: [
        {
          publicTargetName: "Office Mac",
          platform: "macos",
          status: "ready",
          reasonCode: "macos_browser_focus_command_skeleton_ready",
          commandAccepted: false,
          executeOsFocusNow: false,
        },
        {
          publicTargetName: "Office Windows",
          platform: "windows",
          status: "blocked",
          reasonCode: "side_effect_authorization_required",
          commandAccepted: false,
          executeOsFocusNow: false,
        },
        {
          publicTargetName: "Office Linux Desktop",
          platform: "linux",
          status: "ready",
          reasonCode: "linux_browser_focus_command_skeleton_ready",
          commandAccepted: false,
          executeOsFocusNow: false,
        },
        {
          publicTargetName: "Linux Headless Runner",
          platform: "linux",
          status: "blocked",
          reasonCode: "headless_unavailable",
          commandAccepted: false,
          executeOsFocusNow: false,
        },
      ],
      productionExposure: {
        status: "not_executable",
        reasonCode: "rust_dispatch_not_registered",
        missingInventory: ["rust_dispatch"],
      },
    })
  })

  it("does not become executable when one OS skeleton is ready but production inventory is missing", () => {
    expect(aggregateYeonjangBrowserFocusCommandSkeletons({
      skeletons: [
        skeleton({
          platform: "macos",
          targetName: "Office Mac",
          status: "skeleton_ready",
          reasonCode: "macos_browser_focus_command_skeleton_ready",
        }),
      ],
      productionExposure: notExecutableExposure("tool_mapping_not_registered"),
    })).toMatchObject({
      status: "aggregate_blocked",
      reasonCode: "production_exposure_not_executable",
      executable: false,
      readyCount: 1,
      blockedCount: 0,
      productionExposure: {
        status: "not_executable",
        reasonCode: "tool_mapping_not_registered",
        missingInventory: ["rust_dispatch"],
      },
    })
  })

  it("still remains a non-binding aggregate when every platform skeleton and production exposure are ready", () => {
    expect(aggregateYeonjangBrowserFocusCommandSkeletons({
      skeletons: [
        skeleton({
          platform: "macos",
          targetName: "Office Mac",
          status: "skeleton_ready",
          reasonCode: "macos_browser_focus_command_skeleton_ready",
        }),
        skeleton({
          platform: "windows",
          targetName: "Office Windows",
          status: "skeleton_ready",
          reasonCode: "windows_browser_focus_command_skeleton_ready",
        }),
      ],
      productionExposure: executableExposure(),
    })).toMatchObject({
      status: "aggregate_ready",
      reasonCode: "browser_focus_command_skeleton_aggregate_ready",
      executable: false,
      addProductionBindingNow: false,
      readyCount: 2,
      blockedCount: 0,
      productionExposure: {
        status: "executable",
        reasonCode: "browser_focus_production_exposure_ready",
        missingInventory: [],
      },
    })
  })

  it("blocks an empty aggregate and does not expose audit-only fields or raw details", () => {
    const empty = aggregateYeonjangBrowserFocusCommandSkeletons({
      skeletons: [],
      productionExposure: executableExposure(),
    })
    const output = JSON.stringify(aggregateYeonjangBrowserFocusCommandSkeletons({
      skeletons: [
        skeleton({
          platform: "macos",
          targetName: "Office Mac",
          status: "skeleton_ready",
          reasonCode: "macos_browser_focus_command_skeleton_ready",
        }),
      ],
      productionExposure: executableExposure(),
    }))

    expect(empty).toMatchObject({
      status: "aggregate_blocked",
      reasonCode: "command_skeleton_required",
      executable: false,
      readyCount: 0,
      blockedCount: 0,
    })
    expect(output).not.toMatch(
      /Private Admin Console|https:\/\/example\.test|token=private|private-instance|private os focus script|auditOnlyFields|automationScriptText|rawWindowTitle|rawUrl/u,
    )
  })
})
