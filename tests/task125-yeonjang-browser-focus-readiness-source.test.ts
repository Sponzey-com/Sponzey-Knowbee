import { describe, expect, it } from "vitest"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"
import {
  evaluateYeonjangBrowserFocusReleaseGate,
  YEONJANG_BROWSER_FOCUS_RELEASE_GATE_METHODS,
} from "../packages/core/src/release/yeonjang-browser-focus-release-gate.ts"
import {
  projectYeonjangBrowserFocusBackendReadinessSources,
  type YeonjangBrowserFocusBackendReadinessSource,
} from "../packages/core/src/release/yeonjang-browser-focus-readiness-source.ts"
import { buildYeonjangPlatformAcceptanceMatrix } from "../packages/core/src/release/yeonjang-platform-acceptance.ts"

const NOW = 125_000

function sources(): YeonjangBrowserFocusBackendReadinessSource[] {
  return [
    {
      publicTargetName: "Office Mac",
      internalInstanceId: "private-mac-instance",
      platform: "macos",
      desktopSession: "available",
      browserFocusCapabilityAdvertised: true,
      browserControlPermissionGranted: true,
      commandBackend: {
        status: "ready",
        evidenceSource: "rust_dispatch_contract",
        evidenceRef: "capability:macos:browser-focus:dispatch-ready",
        auditOnlyDetails: {
          rawAutomationScript: "osascript private browser focus script",
          rawWindowTitle: "Private Admin Console",
          rawUrl: "https://example.test/admin?token=private",
        },
      },
      observationBackend: {
        status: "ready",
        evidenceSource: "focused_target_observation_contract",
        evidenceRef: "capability:macos:focused-target:ready",
        auditOnlyDetails: {
          rawWindowTitle: "Private Admin Console",
          pid: 4401,
          windowId: "window-private",
          tabId: "tab-private",
        },
      },
    },
    {
      publicTargetName: "Studio Windows",
      internalInstanceId: "private-windows-instance",
      platform: "windows",
      desktopSession: "available",
      browserFocusCapabilityAdvertised: true,
      browserControlPermissionGranted: false,
      commandBackend: {
        status: "ready",
        evidenceSource: "rust_dispatch_contract",
        evidenceRef: "capability:windows:browser-focus:dispatch-ready",
      },
      observationBackend: {
        status: "ready",
        evidenceSource: "focused_target_observation_contract",
        evidenceRef: "capability:windows:focused-target:ready",
      },
    },
    {
      publicTargetName: "Linux Desktop",
      internalInstanceId: "private-linux-desktop-instance",
      platform: "linux",
      desktopSession: "available",
      browserFocusCapabilityAdvertised: true,
      browserControlPermissionGranted: true,
      commandBackend: {
        status: "ready",
        evidenceSource: "rust_dispatch_contract",
        evidenceRef: "capability:linux:browser-focus:dispatch-ready",
      },
      observationBackend: {
        status: "missing",
        evidenceSource: "focused_target_observation_contract",
        evidenceRef: "capability:linux:focused-target:missing",
      },
    },
    {
      publicTargetName: "Linux Headless",
      internalInstanceId: "private-linux-headless-instance",
      platform: "linux",
      desktopSession: "headless",
      browserFocusCapabilityAdvertised: true,
      browserControlPermissionGranted: true,
      commandBackend: {
        status: "ready",
        evidenceSource: "rust_dispatch_contract",
        evidenceRef: "capability:linux-headless:browser-focus:dispatch-present",
      },
      observationBackend: {
        status: "ready",
        evidenceSource: "focused_target_observation_contract",
        evidenceRef: "capability:linux-headless:focused-target:present",
      },
    },
  ]
}

describe("Task 125 Yeonjang browser.focus backend readiness source contract", () => {
  it("projects OS-specific command and observation backend sources into public readiness without exposing audit-only data", () => {
    const projected = projectYeonjangBrowserFocusBackendReadinessSources({
      sources: sources(),
      observedAt: NOW,
    })

    expect(projected.publicSources).toEqual([
      {
        publicTargetName: "Office Mac",
        platform: "macos",
        desktopSession: "available",
        commandBackend: {
          method: "browser.focus",
          status: "ready",
          evidenceSource: "rust_dispatch_contract",
          evidenceRef: "capability:macos:browser-focus:dispatch-ready",
        },
        observationBackend: {
          method: "input.focused_target",
          status: "ready",
          evidenceSource: "focused_target_observation_contract",
          evidenceRef: "capability:macos:focused-target:ready",
        },
      },
      expect.objectContaining({
        publicTargetName: "Studio Windows",
        platform: "windows",
        commandBackend: expect.objectContaining({ status: "permission_required" }),
        observationBackend: expect.objectContaining({ status: "ready" }),
      }),
      expect.objectContaining({
        publicTargetName: "Linux Desktop",
        platform: "linux",
        commandBackend: expect.objectContaining({ status: "ready" }),
        observationBackend: expect.objectContaining({ status: "missing" }),
      }),
      expect.objectContaining({
        publicTargetName: "Linux Headless",
        platform: "linux",
        desktopSession: "headless",
        commandBackend: expect.objectContaining({ status: "headless_unavailable" }),
        observationBackend: expect.objectContaining({ status: "headless_unavailable" }),
      }),
    ])
    expect(projected.readinessProjection.targets).toEqual([
      expect.objectContaining({ publicTargetName: "Office Mac", readinessStatus: "ready" }),
      expect.objectContaining({ publicTargetName: "Studio Windows", readinessStatus: "permission_required" }),
      expect.objectContaining({ publicTargetName: "Linux Desktop", readinessStatus: "observation_backend_required" }),
      expect.objectContaining({ publicTargetName: "Linux Headless", readinessStatus: "headless_unavailable" }),
    ])
    expect(JSON.stringify(projected)).not.toMatch(
      /private-|osascript|Private Admin Console|https:\/\/example\.test|token=private|4401|window-private|tab-private/u,
    )
  })

  it("converts backend readiness sources into release gate capability receipts with separated command and observation methods", () => {
    const projected = projectYeonjangBrowserFocusBackendReadinessSources({
      sources: sources(),
      observedAt: NOW,
    })

    expect(projected.capabilityReceipts).toEqual([
      expect.objectContaining({
        platform: "macos",
        method: "browser.focus",
        supported: true,
        permissionEnabled: true,
        toolHealthStatus: "ready",
      }),
      expect.objectContaining({
        platform: "macos",
        method: "input.focused_target",
        supported: true,
        permissionEnabled: true,
        toolHealthStatus: "ready",
      }),
      expect.objectContaining({
        platform: "windows",
        method: "browser.focus",
        supported: true,
        permissionEnabled: false,
        toolHealthStatus: "permission_disabled",
      }),
      expect.objectContaining({
        platform: "windows",
        method: "input.focused_target",
        supported: true,
        permissionEnabled: true,
        toolHealthStatus: "ready",
      }),
      expect.objectContaining({
        platform: "linux",
        method: "browser.focus",
        supported: true,
        permissionEnabled: true,
        toolHealthStatus: "ready",
      }),
      expect.objectContaining({
        platform: "linux",
        method: "input.focused_target",
        supported: false,
        permissionEnabled: false,
        toolHealthStatus: "unknown",
      }),
      expect.objectContaining({
        platform: "linux",
        method: "browser.focus",
        supported: false,
        permissionEnabled: false,
        toolHealthStatus: "unsupported",
        evidenceRef: "capability:linux-headless:browser-focus:dispatch-present",
      }),
      expect.objectContaining({
        platform: "linux",
        method: "input.focused_target",
        supported: false,
        permissionEnabled: false,
        toolHealthStatus: "unsupported",
        evidenceRef: "capability:linux-headless:focused-target:present",
      }),
    ])
  })

  it("feeds release gate decisions without adding production browser.focus tool mapping", () => {
    const projected = projectYeonjangBrowserFocusBackendReadinessSources({
      sources: sources().slice(0, 3),
      observedAt: NOW,
    })
    const matrix = buildYeonjangPlatformAcceptanceMatrix({
      requiredPlatforms: ["macos", "windows", "linux"],
      availablePlatforms: ["macos", "windows", "linux"],
      deterministicReceipts: [
        { platform: "macos", status: "passed", reasonCodes: [] },
        { platform: "windows", status: "passed", reasonCodes: [] },
        { platform: "linux", status: "passed", reasonCodes: [] },
      ],
      liveRecords: [],
      requiredCapabilityMethods: YEONJANG_BROWSER_FOCUS_RELEASE_GATE_METHODS,
      capabilityReceipts: projected.capabilityReceipts,
      now: NOW,
      maxSessionAgeMs: 5_000,
    })

    const macos = matrix.platforms.find((item) => item.platform === "macos")
    const windows = matrix.platforms.find((item) => item.platform === "windows")
    const linux = matrix.platforms.find((item) => item.platform === "linux")
    expect(evaluateYeonjangBrowserFocusReleaseGate({
      platform: "macos",
      capabilityReadiness: macos?.capabilityReadiness ?? [],
    })).toMatchObject({ status: "ready" })
    expect(evaluateYeonjangBrowserFocusReleaseGate({
      platform: "windows",
      capabilityReadiness: windows?.capabilityReadiness ?? [],
    })).toMatchObject({ status: "blocked", reasonCode: "release_gate_not_ready" })
    expect(evaluateYeonjangBrowserFocusReleaseGate({
      platform: "linux",
      capabilityReadiness: linux?.capabilityReadiness ?? [],
    })).toMatchObject({ status: "blocked", reasonCode: "focused_target_observation_backend_required" })
    expect(YEONJANG_TOOL_MAPPINGS.flatMap((mapping) => mapping.methodIds)).toContain("browser.focus")
  })
})
