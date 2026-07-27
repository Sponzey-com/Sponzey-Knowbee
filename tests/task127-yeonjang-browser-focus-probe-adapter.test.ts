import { describe, expect, it } from "vitest"
import {
  assembleYeonjangBrowserFocusReadinessSourcesFromProbes,
  type YeonjangBrowserFocusBackendProbeRecord,
} from "../packages/core/src/release/yeonjang-browser-focus-probe-adapter.ts"
import { projectYeonjangBrowserFocusBackendReadinessSources } from "../packages/core/src/release/yeonjang-browser-focus-readiness-source.ts"

const NOW = 127_000

function probeRecords(): YeonjangBrowserFocusBackendProbeRecord[] {
  return [
    {
      publicTargetName: "Office Mac",
      internalInstanceId: "private-mac-instance",
      platform: "macos",
      desktopSessionProbe: {
        status: "available",
        evidenceRef: "probe:macos:desktop:available",
        rawDetails: { windowServerSession: "private-window-server-session" },
      },
      commandBackendProbe: {
        status: "ready",
        evidenceRef: "probe:macos:browser-focus-command:ready",
        rawDetails: {
          rawAutomationScript: "osascript private browser focus",
          rawWindowTitle: "Private Admin Console",
          rawUrl: "https://example.test/admin?token=private",
        },
      },
      focusedTargetObservationBackendProbe: {
        status: "ready",
        evidenceRef: "probe:macos:focused-target:ready",
        rawDetails: {
          rawWindowTitle: "Private Admin Console",
          pid: 4401,
          windowId: "window-private",
          tabId: "tab-private",
        },
      },
      browserControlPermissionProbe: {
        status: "granted",
        evidenceRef: "probe:macos:browser-control-permission:granted",
      },
      focusedTargetObservationPermissionProbe: {
        status: "granted",
        evidenceRef: "probe:macos:focused-target-permission:granted",
      },
    },
    {
      publicTargetName: "Studio Windows",
      internalInstanceId: "private-windows-instance",
      platform: "windows",
      desktopSessionProbe: {
        status: "available",
        evidenceRef: "probe:windows:desktop:available",
      },
      commandBackendProbe: {
        status: "ready",
        evidenceRef: "probe:windows:browser-focus-command:ready",
      },
      focusedTargetObservationBackendProbe: {
        status: "ready",
        evidenceRef: "probe:windows:focused-target:ready",
      },
      browserControlPermissionProbe: {
        status: "denied",
        evidenceRef: "probe:windows:browser-control-permission:denied",
      },
    },
    {
      publicTargetName: "Linux Desktop",
      internalInstanceId: "private-linux-instance",
      platform: "linux",
      desktopSessionProbe: {
        status: "available",
        evidenceRef: "probe:linux:desktop:available",
      },
      commandBackendProbe: {
        status: "ready",
        evidenceRef: "probe:linux:browser-focus-command:ready",
      },
      focusedTargetObservationBackendProbe: {
        status: "missing",
        evidenceRef: "probe:linux:focused-target:missing",
      },
      browserControlPermissionProbe: {
        status: "granted",
        evidenceRef: "probe:linux:browser-control-permission:granted",
      },
    },
    {
      publicTargetName: "Linux Headless",
      internalInstanceId: "private-linux-headless-instance",
      platform: "linux",
      desktopSessionProbe: {
        status: "headless",
        evidenceRef: "probe:linux-headless:desktop:headless",
      },
      commandBackendProbe: {
        status: "ready",
        evidenceRef: "probe:linux-headless:browser-focus-command:present",
      },
      focusedTargetObservationBackendProbe: {
        status: "ready",
        evidenceRef: "probe:linux-headless:focused-target:present",
      },
      browserControlPermissionProbe: {
        status: "granted",
        evidenceRef: "probe:linux-headless:browser-control-permission:granted",
      },
    },
  ]
}

describe("Task 127 Yeonjang browser.focus backend probe adapter", () => {
  it("assembles OS probe records into separated command, observation, permission, and desktop readiness sources", () => {
    const sources = assembleYeonjangBrowserFocusReadinessSourcesFromProbes({
      records: probeRecords(),
    })

    expect(sources).toEqual([
      expect.objectContaining({
        publicTargetName: "Office Mac",
        platform: "macos",
        desktopSession: "available",
        browserFocusCapabilityAdvertised: true,
        browserControlPermissionGranted: true,
        focusedTargetObservationPermissionGranted: true,
        commandBackend: expect.objectContaining({
          status: "ready",
          evidenceSource: "platform_backend_probe",
          evidenceRef: "probe:macos:browser-focus-command:ready",
        }),
        observationBackend: expect.objectContaining({
          status: "ready",
          evidenceSource: "platform_backend_probe",
          evidenceRef: "probe:macos:focused-target:ready",
        }),
      }),
      expect.objectContaining({
        publicTargetName: "Studio Windows",
        platform: "windows",
        browserControlPermissionGranted: false,
        commandBackend: expect.objectContaining({ status: "ready" }),
        observationBackend: expect.objectContaining({ status: "ready" }),
      }),
      expect.objectContaining({
        publicTargetName: "Linux Desktop",
        platform: "linux",
        browserControlPermissionGranted: true,
        commandBackend: expect.objectContaining({ status: "ready" }),
        observationBackend: expect.objectContaining({ status: "missing" }),
      }),
      expect.objectContaining({
        publicTargetName: "Linux Headless",
        platform: "linux",
        desktopSession: "headless",
        commandBackend: expect.objectContaining({ status: "ready" }),
        observationBackend: expect.objectContaining({ status: "ready" }),
      }),
    ])
  })

  it("projects assembled probes without treating one successful probe as whole-goal readiness", () => {
    const projected = projectYeonjangBrowserFocusBackendReadinessSources({
      sources: assembleYeonjangBrowserFocusReadinessSourcesFromProbes({ records: probeRecords() }),
      observedAt: NOW,
    })

    expect(projected.readinessProjection.targets).toEqual([
      expect.objectContaining({ publicTargetName: "Office Mac", readinessStatus: "ready" }),
      expect.objectContaining({ publicTargetName: "Studio Windows", readinessStatus: "permission_required" }),
      expect.objectContaining({ publicTargetName: "Linux Desktop", readinessStatus: "observation_backend_required" }),
      expect.objectContaining({ publicTargetName: "Linux Headless", readinessStatus: "headless_unavailable" }),
    ])
    expect(projected.capabilityReceipts).toEqual([
      expect.objectContaining({ platform: "macos", method: "browser.focus", toolHealthStatus: "ready" }),
      expect.objectContaining({ platform: "macos", method: "input.focused_target", toolHealthStatus: "ready" }),
      expect.objectContaining({ platform: "windows", method: "browser.focus", toolHealthStatus: "permission_disabled" }),
      expect.objectContaining({ platform: "windows", method: "input.focused_target", toolHealthStatus: "ready" }),
      expect.objectContaining({ platform: "linux", method: "browser.focus", toolHealthStatus: "ready" }),
      expect.objectContaining({ platform: "linux", method: "input.focused_target", toolHealthStatus: "unknown" }),
      expect.objectContaining({ platform: "linux", method: "browser.focus", toolHealthStatus: "unsupported" }),
      expect.objectContaining({ platform: "linux", method: "input.focused_target", toolHealthStatus: "unsupported" }),
    ])
  })

  it("keeps raw OS probe data out of public readiness source projection and release receipts", () => {
    const projected = projectYeonjangBrowserFocusBackendReadinessSources({
      sources: assembleYeonjangBrowserFocusReadinessSourcesFromProbes({ records: probeRecords() }),
      observedAt: NOW,
    })

    expect(JSON.stringify(projected)).not.toMatch(
      /private-|osascript|Private Admin Console|https:\/\/example\.test|token=private|4401|window-private|tab-private|window-server/u,
    )
  })
})
