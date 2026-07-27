import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import {
  executeYeonjangPlatformProbe,
  projectYeonjangPlatformProbeLog,
} from "../packages/core/src/capabilities/yeonjang-platform-probe.js"

describe("Task 036 Yeonjang platform probe contract", () => {
  it("projects three bounded log levels without internal runtime identifiers", () => {
    const receipt = {
      platform: "macos" as const,
      status: "failed" as const,
      reasonCodes: ["platform_permission_not_ready"],
      observedAt: 900,
    }
    const logs = (["product", "field_debug", "development"] as const).map((level) =>
      projectYeonjangPlatformProbeLog({
        level,
        receipt,
        displayName: "Studio Mac",
        durationMs: 24.9,
      }),
    )
    expect(logs[0]).toEqual({
      level: "product",
      platform: "macos",
      status: "failed",
      reasonCodes: ["platform_permission_not_ready"],
    })
    expect(logs[1]).toMatchObject({
      level: "field_debug",
      displayName: "Studio Mac",
      probeKind: "package_health",
      durationMs: 24,
    })
    expect(logs[2]).toMatchObject({
      level: "development",
      transition: "probe_terminal",
      observedAt: 900,
    })
    expect(JSON.stringify(logs)).not.toMatch(/instanceId|sessionId|path|command|mqtt/iu)
  })
  it.each(["linux", "windows", "macos"] as const)(
    "accepts a matching redacted %s package observation through one port",
    async (platform) => {
      const probe = vi.fn(async () => ({
        platform,
        packageReady: true,
        processReady: true,
        trayWindowState: platform === "linux" ? "limited" : "ready",
        permissionState: "ready",
        observedAt: 1_000,
      }))
      const receipt = await executeYeonjangPlatformProbe(
        {
          context: Object.freeze({
            platform,
            supportProfile: "desktop_interactive",
            deadlineAt: 2_000,
          }),
          now: () => 1_000,
          probe,
        },
        new AbortController().signal,
      )
      expect(receipt).toMatchObject({ status: "passed", platform, reasonCodes: [] })
      expect(JSON.stringify(receipt)).not.toMatch(/path|executable|command|environment|token/iu)
    },
  )

  it("fails closed for platform mismatch, timeout, cancellation, and malformed observations", async () => {
    const context = Object.freeze({
      platform: "windows" as const,
      supportProfile: "desktop_interactive" as const,
      deadlineAt: 2_000,
    })
    const mismatch = await executeYeonjangPlatformProbe(
      {
        context,
        now: () => 1_000,
        probe: async () => ({
          platform: "linux",
          packageReady: true,
          processReady: true,
          trayWindowState: "limited",
          permissionState: "ready",
          observedAt: 1_000,
        }),
      },
      new AbortController().signal,
    )
    expect(mismatch.reasonCodes).toEqual(["platform_probe_target_mismatch"])

    const timeout = await executeYeonjangPlatformProbe(
      { context, now: () => 2_001, probe: async () => null },
      new AbortController().signal,
    )
    expect(timeout.reasonCodes).toEqual(["platform_probe_timeout"])

    const activeTimeout = await executeYeonjangPlatformProbe(
      {
        context,
        now: () => 1_000,
        probe: async (_context, signal) =>
          new Promise((resolve) =>
            signal.addEventListener("abort", () => resolve(null), { once: true }),
          ),
        wait: async () => undefined,
      },
      new AbortController().signal,
    )
    expect(activeTimeout.reasonCodes).toEqual(["platform_probe_timeout"])

    const malformed = await executeYeonjangPlatformProbe(
      { context, now: () => 1_000, probe: async () => null },
      new AbortController().signal,
    )
    expect(malformed.reasonCodes).toEqual(["platform_probe_observation_invalid"])

    const controller = new AbortController()
    controller.abort()
    const cancelled = await executeYeonjangPlatformProbe(
      { context, now: () => 1_000, probe: async () => null },
      controller.signal,
    )
    expect(cancelled.reasonCodes).toEqual(["platform_probe_cancelled"])
  })

  it("keeps platform policy and probe boundaries free of hidden environment and infrastructure access", () => {
    const sources = [
      readFileSync("packages/core/src/capabilities/yeonjang-platform-support.ts", "utf8"),
      readFileSync("packages/core/src/capabilities/yeonjang-platform-probe.ts", "utf8"),
    ].join("\n")
    expect(sources).not.toMatch(/process\.env|node:fs|node:child_process|mqtt|fastify|react/iu)
  })
})
