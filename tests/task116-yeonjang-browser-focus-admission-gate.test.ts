import { describe, expect, it } from "vitest"
import {
  buildYeonjangBrowserFocusReadinessProjection,
  evaluateYeonjangBrowserFocusPreflight,
  evaluateYeonjangBrowserFocusToolAdmission,
  projectYeonjangBrowserFocusTarget,
  selectYeonjangBrowserFocusReadyTargets,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"
import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"

function projectedTarget() {
  const projected = projectYeonjangBrowserFocusTarget({
    targetAlias: "업무 브라우저",
    processName: "Google Chrome",
    title: "Internal Roadmap",
    url: "https://example.test/roadmap?token=private",
    pid: 777,
    windowId: "window-private",
    tabId: "tab-private",
  })
  expect(projected.ok).toBe(true)
  if (!projected.ok) throw new Error("test target projection failed")
  return projected.projection
}

describe("Task 116 Yeonjang browser.focus admission gate", () => {
  it("blocks a hypothetical browser.focus tool candidate when no selectable ready target exists", () => {
    const projection = buildYeonjangBrowserFocusReadinessProjection({
      observations: [
        {
          publicTargetName: "Linux Headless",
          internalInstanceId: "private-linux",
          platform: "linux",
          desktopSession: "headless",
          capabilitySupported: true,
          permissionGranted: true,
          commandBackendAvailable: true,
          observationBackendAvailable: true,
        },
      ],
    })
    const decision = evaluateYeonjangBrowserFocusToolAdmission({
      readyTargets: selectYeonjangBrowserFocusReadyTargets(projection),
      approvalGranted: true,
      preflight: evaluateYeonjangBrowserFocusPreflight({
        capabilitySupported: true,
        approvalGranted: true,
        target: projectedTarget(),
      }),
    })

    expect(decision).toEqual({
      status: "blocked",
      reasonCode: "target_not_selectable",
      method: "browser.focus",
      publicCandidateCount: 0,
    })
    expect(JSON.stringify(decision)).not.toMatch(/private-linux|Internal Roadmap|token=private|777|window-private|tab-private/u)
  })

  it("blocks a ready target when approval receipt or preflight readiness is missing", () => {
    const projection = buildYeonjangBrowserFocusReadinessProjection({
      observations: [
        {
          publicTargetName: "Office Mac",
          internalInstanceId: "private-mac",
          platform: "macos",
          desktopSession: "available",
          capabilitySupported: true,
          permissionGranted: true,
          commandBackendAvailable: true,
          observationBackendAvailable: true,
        },
      ],
    })
    const readyTargets = selectYeonjangBrowserFocusReadyTargets(projection)

    expect(evaluateYeonjangBrowserFocusToolAdmission({
      readyTargets,
      approvalGranted: false,
      preflight: evaluateYeonjangBrowserFocusPreflight({
        capabilitySupported: true,
        approvalGranted: false,
        target: projectedTarget(),
      }),
    })).toEqual({
      status: "blocked",
      reasonCode: "side_effect_authorization_required",
      method: "browser.focus",
      publicCandidateCount: 1,
    })

    expect(evaluateYeonjangBrowserFocusToolAdmission({
      readyTargets,
      approvalGranted: true,
      preflight: evaluateYeonjangBrowserFocusPreflight({
        capabilitySupported: false,
        approvalGranted: true,
        target: projectedTarget(),
      }),
    })).toEqual({
      status: "blocked",
      reasonCode: "capability_not_ready",
      method: "browser.focus",
      publicCandidateCount: 1,
    })
  })

  it("admits only public ready target metadata and keeps actual catalog/mapping fail-closed", () => {
    const projection = buildYeonjangBrowserFocusReadinessProjection({
      observations: [
        {
          publicTargetName: "Office Mac",
          internalInstanceId: "private-mac",
          platform: "macos",
          desktopSession: "available",
          capabilitySupported: true,
          permissionGranted: true,
          commandBackendAvailable: true,
          observationBackendAvailable: true,
        },
      ],
    })
    const decision = evaluateYeonjangBrowserFocusToolAdmission({
      readyTargets: selectYeonjangBrowserFocusReadyTargets(projection),
      approvalGranted: true,
      preflight: evaluateYeonjangBrowserFocusPreflight({
        capabilitySupported: true,
        approvalGranted: true,
        target: projectedTarget(),
      }),
    })

    expect(decision).toEqual({
      status: "admitted",
      reasonCode: "browser_focus_admission_ready",
      method: "browser.focus",
      publicCandidateCount: 1,
      selectableTargets: [{
        publicTargetName: "Office Mac",
        platform: "macos",
        method: "browser.focus",
        requiresApproval: true,
        permissionSetting: "allow_browser_control",
      }],
    })
    expect(YEONJANG_TOOL_MAPPINGS.flatMap((mapping) => mapping.methodIds)).toContain("browser.focus")
    expect(YEONJANG_TOOL_MAPPINGS.map((mapping) => mapping.toolName)).toContain("yeonjang_browser_focus")
    expect(YEONJANG_SKILL_TOOL_NAMES).toContain("yeonjang_browser_focus")
    expect(JSON.stringify(decision)).not.toMatch(/private-mac|Internal Roadmap|https:\/\/example\.test|token=private|777|window-private|tab-private/u)
  })
})
