import { describe, expect, it } from "vitest"
import { projectYeonjangPlatformSupport } from "../packages/core/src/capabilities/yeonjang-platform-support.js"

describe("Task 036 Yeonjang platform support policy", () => {
  it.each(["macos", "windows"] as const)(
    "requires desktop permissions for interactive %s input and screen capability",
    (platform) => {
      const projection = projectYeonjangPlatformSupport({
        platform,
        supportProfile: "desktop_interactive",
        permissionState: "required",
      })
      expect(projection.capabilities).toMatchObject({
        applications: { status: "supported" },
        files: { status: "supported" },
        input: { status: "permission_required" },
        screen: { status: "permission_required" },
        system: { status: "supported" },
      })
      expect(projection.packageSmoke.status).toBe("supported")
      expect(projection.trayWindow.status).toBe("supported")
    },
  )

  it("limits Linux tray integration and rejects desktop-only capability on headless profiles", () => {
    const desktop = projectYeonjangPlatformSupport({
      platform: "linux",
      supportProfile: "desktop_interactive",
      permissionState: "ready",
    })
    expect(desktop.trayWindow).toEqual({
      status: "limited",
      reasonCodes: ["linux_desktop_environment_varies"],
    })
    const headless = projectYeonjangPlatformSupport({
      platform: "linux",
      supportProfile: "headless_managed",
      permissionState: "ready",
      reportedCapabilityGroups: ["files", "system"],
    })
    expect(headless.capabilities.input.status).toBe("unsupported")
    expect(headless.capabilities.screen.status).toBe("unsupported")
    expect(headless.trayWindow.status).toBe("unsupported")
    expect(headless.runnableCapabilityGroups).toEqual(["files", "system"])
  })

  it("fails closed for unknown platforms without leaking implementation details", () => {
    const projection = projectYeonjangPlatformSupport({
      platform: "unknown",
      supportProfile: "desktop_interactive",
      permissionState: "ready",
    })
    expect(projection.runnableCapabilityGroups).toEqual([])
    expect(projection.packageSmoke).toEqual({
      status: "unsupported",
      reasonCodes: ["platform_unknown"],
    })
    expect(JSON.stringify(projection)).not.toMatch(
      /path|executable|command|mqtt|session|instance/iu,
    )
  })
})
