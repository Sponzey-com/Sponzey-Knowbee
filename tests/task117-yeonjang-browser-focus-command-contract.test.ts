import { describe, expect, it } from "vitest"
import {
  buildYeonjangBrowserFocusCommandContract,
  buildYeonjangBrowserFocusReadinessProjection,
  evaluateYeonjangBrowserFocusPreflight,
  evaluateYeonjangBrowserFocusToolAdmission,
  projectYeonjangBrowserFocusTarget,
  selectYeonjangBrowserFocusReadyTargets,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"

function target() {
  const projected = projectYeonjangBrowserFocusTarget({
    targetAlias: "업무 브라우저",
    processName: "Google Chrome",
    title: "Private Issue Tracker",
    url: "https://example.test/issues?token=secret",
    pid: 1188,
    windowId: "window-secret",
    tabId: "tab-secret",
  })
  expect(projected.ok).toBe(true)
  if (!projected.ok) throw new Error("target projection failed")
  return projected.projection
}

function admitted() {
  const projection = buildYeonjangBrowserFocusReadinessProjection({
    observations: [{
      publicTargetName: "Office Mac",
      internalInstanceId: "private-mac",
      platform: "macos",
      desktopSession: "available",
      capabilitySupported: true,
      permissionGranted: true,
      commandBackendAvailable: true,
      observationBackendAvailable: true,
    }],
  })
  return evaluateYeonjangBrowserFocusToolAdmission({
    readyTargets: selectYeonjangBrowserFocusReadyTargets(projection),
    approvalGranted: true,
    preflight: evaluateYeonjangBrowserFocusPreflight({
      capabilitySupported: true,
      approvalGranted: true,
      target: target(),
    }),
  })
}

describe("Task 117 Yeonjang browser.focus command contract", () => {
  it("accepts a browser.focus command contract only after admission and observation backend readiness", () => {
    const contract = buildYeonjangBrowserFocusCommandContract({
      platform: "macos",
      desktopSession: "available",
      commandBackendAvailable: true,
      observationBackendAvailable: true,
      admission: admitted(),
      target: target(),
      automationPlan: "tell application \"Google Chrome\" to activate private script",
    })

    expect(contract).toEqual({
      status: "accepted",
      reasonCode: "browser_focus_command_contract_ready",
      method: "browser.focus",
      platform: "macos",
      requiresFocusedTargetObservation: true,
      target: target(),
    })
    expect(JSON.stringify(contract)).not.toMatch(
      /Private Issue Tracker|https:\/\/example\.test|token=secret|1188|window-secret|tab-secret|private script/u,
    )
  })

  it("blocks command contract when admission is blocked, command backend is missing, or observation backend is missing", () => {
    const blockedAdmission = evaluateYeonjangBrowserFocusToolAdmission({
      readyTargets: [],
      approvalGranted: true,
      preflight: evaluateYeonjangBrowserFocusPreflight({
        capabilitySupported: true,
        approvalGranted: true,
        target: target(),
      }),
    })

    expect(buildYeonjangBrowserFocusCommandContract({
      platform: "macos",
      desktopSession: "available",
      commandBackendAvailable: true,
      observationBackendAvailable: true,
      admission: blockedAdmission,
      target: target(),
    })).toMatchObject({
      status: "blocked",
      reasonCode: "admission_not_ready",
      method: "browser.focus",
      platform: "macos",
    })

    expect(buildYeonjangBrowserFocusCommandContract({
      platform: "windows",
      desktopSession: "available",
      commandBackendAvailable: false,
      observationBackendAvailable: true,
      admission: admitted(),
      target: target(),
    })).toMatchObject({
      status: "blocked",
      reasonCode: "command_backend_required",
      method: "browser.focus",
      platform: "windows",
    })

    expect(buildYeonjangBrowserFocusCommandContract({
      platform: "linux",
      desktopSession: "available",
      commandBackendAvailable: true,
      observationBackendAvailable: false,
      admission: admitted(),
      target: target(),
    })).toMatchObject({
      status: "blocked",
      reasonCode: "focused_target_observation_backend_required",
      method: "browser.focus",
      platform: "linux",
    })
  })

  it("keeps Linux headless as headless unavailable and unknown platform as unsupported without leaking automation internals", () => {
    const headless = buildYeonjangBrowserFocusCommandContract({
      platform: "linux",
      desktopSession: "headless",
      commandBackendAvailable: true,
      observationBackendAvailable: true,
      admission: admitted(),
      target: target(),
      automationPlan: "xdotool private automation",
    })
    const unknown = buildYeonjangBrowserFocusCommandContract({
      platform: "unknown",
      desktopSession: "unknown",
      commandBackendAvailable: true,
      observationBackendAvailable: true,
      admission: admitted(),
      target: target(),
      automationPlan: "unknown private automation",
    })

    expect(headless).toMatchObject({
      status: "blocked",
      reasonCode: "headless_unavailable",
      platform: "linux",
    })
    expect(unknown).toMatchObject({
      status: "blocked",
      reasonCode: "platform_unsupported",
      platform: "unknown",
    })
    expect(JSON.stringify({ headless, unknown })).not.toMatch(/xdotool|unknown private|Private Issue Tracker|token=secret|window-secret/u)
  })
})
