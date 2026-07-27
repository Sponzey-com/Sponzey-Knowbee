import { describe, expect, it } from "vitest"
import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import {
  projectYeonjangBrowserFocusBackendReadinessSources,
  type YeonjangBrowserFocusBackendReadinessSource,
} from "../packages/core/src/release/yeonjang-browser-focus-readiness-source.ts"
import {
  evaluateYeonjangBrowserFocusProductionExposureBoundary,
} from "../packages/core/src/release/yeonjang-browser-focus-production-exposure.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"

const READY_SOURCE: YeonjangBrowserFocusBackendReadinessSource = {
  publicTargetName: "Office Mac",
  internalInstanceId: "private-instance",
  platform: "macos",
  desktopSession: "available",
  browserFocusCapabilityAdvertised: true,
  browserControlPermissionGranted: true,
  commandBackend: {
    status: "ready",
    evidenceSource: "rust_dispatch_contract",
    evidenceRef: "capability:macos:browser-focus:dispatch-ready",
    auditOnlyDetails: {
      rawAutomationScript: "osascript private browser focus",
      rawWindowTitle: "Private Admin Console",
      rawUrl: "https://example.test/admin?token=private",
    },
  },
  observationBackend: {
    status: "ready",
    evidenceSource: "focused_target_observation_contract",
    evidenceRef: "capability:macos:focused-target:ready",
    auditOnlyDetails: {
      pid: 4401,
      windowId: "window-private",
      tabId: "tab-private",
    },
  },
}

describe("Task 126 Yeonjang browser.focus inventory fail-closed boundary", () => {
  it("keeps browser.focus non-executable even when readiness source evidence is ready but Rust dispatch is absent", () => {
    const projected = projectYeonjangBrowserFocusBackendReadinessSources({
      sources: [READY_SOURCE],
      observedAt: 126_000,
    })

    expect(evaluateYeonjangBrowserFocusProductionExposureBoundary({
      readinessSource: projected,
      rustDispatchMethods: [],
      mappedMethodIds: YEONJANG_TOOL_MAPPINGS.flatMap((mapping) => mapping.methodIds),
      mappedToolNames: YEONJANG_TOOL_MAPPINGS.map((mapping) => mapping.toolName),
      skillToolNames: YEONJANG_SKILL_TOOL_NAMES,
    })).toEqual({
      status: "not_executable",
      reasonCode: "rust_dispatch_not_registered",
      method: "browser.focus",
      toolName: "yeonjang_browser_focus",
      releaseEvidenceReady: true,
      executable: false,
      missingInventory: ["rust_dispatch"],
    })
  })

  it("marks browser.focus executable after Rust dispatch, mapping, and Skill catalog are registered", () => {
    const projected = projectYeonjangBrowserFocusBackendReadinessSources({
      sources: [READY_SOURCE],
      observedAt: 126_000,
    })

    expect(evaluateYeonjangBrowserFocusProductionExposureBoundary({
      readinessSource: projected,
      rustDispatchMethods: ["browser.focus"],
      mappedMethodIds: YEONJANG_TOOL_MAPPINGS.flatMap((mapping) => mapping.methodIds),
      mappedToolNames: YEONJANG_TOOL_MAPPINGS.map((mapping) => mapping.toolName),
      skillToolNames: YEONJANG_SKILL_TOOL_NAMES,
    })).toMatchObject({
      status: "executable",
      reasonCode: "browser_focus_production_exposure_ready",
      missingInventory: [],
    })
  })

  it("does not let source contract readiness substitute production mapping, Skill catalog, or dispatcher registration", () => {
    const projected = projectYeonjangBrowserFocusBackendReadinessSources({
      sources: [READY_SOURCE],
      observedAt: 126_000,
    })

    expect(evaluateYeonjangBrowserFocusProductionExposureBoundary({
      readinessSource: projected,
      rustDispatchMethods: ["browser.focus"],
      mappedMethodIds: [],
      mappedToolNames: [],
      skillToolNames: [],
    })).toMatchObject({
      status: "not_executable",
      reasonCode: "tool_mapping_not_registered",
      missingInventory: ["tool_mapping", "skill_catalog"],
    })
    expect(evaluateYeonjangBrowserFocusProductionExposureBoundary({
      readinessSource: projected,
      rustDispatchMethods: ["browser.focus"],
      mappedMethodIds: ["browser.focus"],
      mappedToolNames: ["yeonjang_browser_focus"],
      skillToolNames: [],
    })).toMatchObject({
      status: "not_executable",
      reasonCode: "skill_catalog_not_registered",
      missingInventory: ["skill_catalog"],
    })
  })

  it("keeps release source and production exposure public outputs free of audit-only data", () => {
    const projected = projectYeonjangBrowserFocusBackendReadinessSources({
      sources: [READY_SOURCE],
      observedAt: 126_000,
    })
    const exposure = evaluateYeonjangBrowserFocusProductionExposureBoundary({
      readinessSource: projected,
      rustDispatchMethods: [],
      mappedMethodIds: [],
      mappedToolNames: [],
      skillToolNames: [],
    })

    expect(JSON.stringify({ projected, exposure })).not.toMatch(
      /private-|osascript|Private Admin Console|https:\/\/example\.test|token=private|4401|window-private|tab-private/u,
    )
  })
})
