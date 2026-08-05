import { describe, expect, it } from "vitest"
import { buildYeonjangMultiInstanceReleaseGateSummary } from "../packages/core/src/release/yeonjang-multi-instance-gate.ts"

const NOW = new Date("2026-07-21T09:00:00.000Z")

function smoke(overrides: Partial<{
  id: "macos" | "windows" | "linux_desktop" | "linux_headless"
  platform: "macos" | "windows" | "linux"
  profile: "desktop_interactive" | "headless_managed"
  startupMode: "autostart" | "manual" | "managed"
  windowMode: "hidden" | "visible" | "unavailable"
  trayState: "visible" | "hidden" | "unsupported" | "unavailable"
  observedAt: number
  evidenceRef: string
}> = {}) {
  const id = overrides.id ?? "macos"
  return {
    id,
    platform: overrides.platform ?? (id === "windows" ? "windows" : id.startsWith("linux") ? "linux" : "macos"),
    profile: overrides.profile ?? (id === "linux_headless" ? "headless_managed" : "desktop_interactive"),
    startupMode: overrides.startupMode ?? (id === "linux_headless" ? "managed" : "autostart"),
    windowMode: overrides.windowMode ?? "hidden",
    trayState: overrides.trayState ?? (id === "linux_headless" ? "unsupported" : "visible"),
    observedAt: overrides.observedAt ?? NOW.getTime(),
    evidenceRef: overrides.evidenceRef ?? `profile:${id}`,
  } as const
}

describe("Task 043 Yeonjang OS profile smoke gate", () => {
  it("passes when all OS profile smoke evidence matches expected lifecycle contracts", () => {
    const summary = buildYeonjangMultiInstanceReleaseGateSummary({
      now: NOW,
      profileSmokeEvidence: [
        smoke({ id: "macos" }),
        smoke({ id: "windows" }),
        smoke({ id: "linux_desktop", trayState: "unsupported" }),
        smoke({ id: "linux_headless" }),
      ],
      profileSmokeMaxAgeMs: 5_000,
    })

    expect(summary.profileSmoke.map((item) => [item.id, item.status])).toEqual([
      ["macos", "passed"],
      ["windows", "passed"],
      ["linux_desktop", "passed"],
      ["linux_headless", "passed"],
    ])
    expect(summary.warnings).not.toContain("manual_smoke_not_run")
    expect(summary.gateStatus).toBe("passed")
    expect(summary.profileSmoke.flatMap((item) => item.evidenceRefs)).toEqual([
      "profile:macos",
      "profile:windows",
      "profile:linux_desktop",
      "profile:linux_headless",
    ])
  })

  it("fails closed for stale, permission, and lifecycle mismatch evidence without leaking internal ids", () => {
    const summary = buildYeonjangMultiInstanceReleaseGateSummary({
      now: NOW,
      profileSmokeMaxAgeMs: 5_000,
      profileSmokeEvidence: [
        smoke({ id: "macos", windowMode: "visible", evidenceRef: "profile:macos:private-session-1" }),
        smoke({ id: "windows", observedAt: NOW.getTime() - 10_000 }),
        smoke({ id: "linux_desktop", startupMode: "manual" }),
        smoke({ id: "linux_headless", trayState: "visible" }),
      ],
    })

    expect(summary.profileSmoke).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "macos", status: "failed", reasonCodes: ["profile_window_not_hidden"] }),
      expect.objectContaining({ id: "windows", status: "stale", reasonCodes: ["profile_smoke_stale"] }),
      expect.objectContaining({ id: "linux_desktop", status: "failed", reasonCodes: ["profile_startup_not_autostart"] }),
      expect.objectContaining({ id: "linux_headless", status: "failed", reasonCodes: ["profile_headless_tray_should_be_unsupported"] }),
    ]))
    expect(summary.blockingFailures).toEqual(expect.arrayContaining([
      "profile_smoke_macos_failed",
      "profile_smoke_windows_stale",
      "profile_smoke_linux_desktop_failed",
      "profile_smoke_linux_headless_failed",
    ]))
    expect(summary.gateStatus).toBe("failed")
    expect(JSON.stringify(summary.profileSmoke)).not.toMatch(/private-session-1|sessionId|instanceId|clientId|commandId/u)
  })
})
