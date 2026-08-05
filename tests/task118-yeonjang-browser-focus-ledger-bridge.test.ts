import { describe, expect, it } from "vitest"
import {
  buildYeonjangBrowserFocusCommandContract,
  buildYeonjangBrowserFocusLedgerBridgeResult,
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

function readyAdmission() {
  const projection = buildYeonjangBrowserFocusReadinessProjection({
    observations: [{
      publicTargetName: "Office Mac",
      internalInstanceId: "private-mac-instance",
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
  return {
    preflight,
    admission: evaluateYeonjangBrowserFocusToolAdmission({
      readyTargets: selectYeonjangBrowserFocusReadyTargets(projection),
      approvalGranted: true,
      preflight,
    }),
  }
}

describe("Task 118 Yeonjang browser.focus ledger bridge", () => {
  it("blocks before Yeonjang invoke when approval receipt is missing", () => {
    const preflight = evaluateYeonjangBrowserFocusPreflight({
      capabilitySupported: true,
      approvalGranted: false,
      target: target(),
    })
    const result = buildYeonjangBrowserFocusLedgerBridgeResult({
      approvalGranted: false,
      preflight,
      admission: evaluateYeonjangBrowserFocusToolAdmission({
        readyTargets: [],
        approvalGranted: false,
        preflight,
      }),
      commandContract: buildYeonjangBrowserFocusCommandContract({
        platform: "macos",
        desktopSession: "available",
        commandBackendAvailable: true,
        observationBackendAvailable: true,
        admission: evaluateYeonjangBrowserFocusToolAdmission({
          readyTargets: [],
          approvalGranted: false,
          preflight,
        }),
        target: target(),
      }),
      commandAccepted: false,
    })

    expect(result).toEqual({
      success: false,
      error: "SIDE_EFFECT_OPERATION_BLOCKED",
      invokeAllowed: false,
      details: {
        kind: "browser_focus_ledger_bridge",
        reasonCode: "side_effect_authorization_required",
        method: "browser.focus",
      },
    })
  })

  it("blocks before Yeonjang invoke when admission, preflight, or command contract is blocked", () => {
    const blockedPreflight = evaluateYeonjangBrowserFocusPreflight({
      capabilitySupported: false,
      approvalGranted: true,
      target: target(),
    })
    const blockedAdmission = evaluateYeonjangBrowserFocusToolAdmission({
      readyTargets: [],
      approvalGranted: true,
      preflight: blockedPreflight,
    })

    expect(buildYeonjangBrowserFocusLedgerBridgeResult({
      approvalGranted: true,
      preflight: blockedPreflight,
      admission: blockedAdmission,
      commandContract: buildYeonjangBrowserFocusCommandContract({
        platform: "macos",
        desktopSession: "available",
        commandBackendAvailable: true,
        observationBackendAvailable: true,
        admission: blockedAdmission,
        target: target(),
      }),
      commandAccepted: false,
    })).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_OPERATION_BLOCKED",
      invokeAllowed: false,
      details: { reasonCode: "capability_not_ready" },
    })

    const { admission, preflight } = readyAdmission()
    expect(buildYeonjangBrowserFocusLedgerBridgeResult({
      approvalGranted: true,
      preflight,
      admission,
      commandContract: buildYeonjangBrowserFocusCommandContract({
        platform: "linux",
        desktopSession: "available",
        commandBackendAvailable: true,
        observationBackendAvailable: false,
        admission,
        target: target(),
      }),
      commandAccepted: false,
    })).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_OPERATION_BLOCKED",
      invokeAllowed: false,
      details: { reasonCode: "focused_target_observation_backend_required" },
    })
  })

  it("keeps accepted command as manual intervention until focused target observation verifies it", () => {
    const { admission, preflight } = readyAdmission()
    const result = buildYeonjangBrowserFocusLedgerBridgeResult({
      approvalGranted: true,
      preflight,
      admission,
      commandContract: buildYeonjangBrowserFocusCommandContract({
        platform: "macos",
        desktopSession: "available",
        commandBackendAvailable: true,
        observationBackendAvailable: true,
        admission,
        target: target(),
        automationPlan: "private os automation",
      }),
      commandAccepted: true,
    })

    expect(result).toEqual({
      success: false,
      error: "SIDE_EFFECT_MANUAL_INTERVENTION",
      invokeAllowed: true,
      details: {
        kind: "browser_focus_ledger_bridge",
        reasonCode: "target_observation_required",
        method: "browser.focus",
        goalValidationCandidate: false,
      },
    })
    expect(JSON.stringify(result)).not.toMatch(
      /Private Admin Console|https:\/\/example\.test|token=private|4401|window-private|tab-private|private-mac-instance|private os automation/u,
    )
  })
})
