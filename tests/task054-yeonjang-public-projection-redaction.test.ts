import { describe, expect, it } from "vitest"
import { buildYeonjangCapabilityProjection } from "../packages/core/src/capabilities/yeonjang-capability-projection.ts"
import { projectYeonjangPlatformSupport } from "../packages/core/src/capabilities/yeonjang-platform-support.ts"

describe("Task 054 Yeonjang public projection redaction", () => {
  it("groups public capabilities without exposing raw matrix, internal IDs, params, or evidence refs", () => {
    const projection = buildYeonjangCapabilityProjection({
      instances: [
        {
          instanceId: "internal-instance-task054",
          instanceAlias: "office-private-alias",
          displayName: "Office Workstation",
          location: "remote",
          platform: "linux",
          supportProfile: "desktop_interactive",
          state: "online",
          lastSeenAt: 100,
          lastHeartbeatAgeMs: 50,
          runnableTarget: true,
          trustState: "trusted",
          scopeAccess: "allowed",
          duplicateLiveSessionDetected: false,
          supportedMethods: [
            "file.list",
            "disk.usage",
            "browser.list",
            "process.list",
            "camera.list",
            "keyboard.type",
            "system.info",
          ],
          capabilityMatrix: { "file.list": { raw: "do-not-show" } },
          rawParams: { path: "/Users/private" },
          rawEvidence: "do-not-show",
          evidenceRef: "evidence:private",
          session: { sessionId: "private-session-task054" },
        } as never,
      ],
      now: 200,
      staleAfterMs: 1_000,
      publicRefForInstanceId: () => `yeonjang_v1_${"5".repeat(24)}`,
    })

    expect(projection.items[0]).toMatchObject({
      displayName: "Office Workstation",
      capabilityGroups: ["browser", "disk", "files", "input", "process", "screen", "system"],
    })
    expect(JSON.stringify(projection)).not.toMatch(
      /internal-instance-task054|private-session-task054|capabilityMatrix|supportedMethods|rawParams|rawEvidence|evidenceRef|do-not-show|Users\/private/u,
    )
  })

  it("includes disk, browser, and process in platform support without requiring raw matrix access", () => {
    const support = projectYeonjangPlatformSupport({
      platform: "macos",
      supportProfile: "desktop_interactive",
      permissionState: "ready",
      reportedCapabilityGroups: ["browser", "disk", "files", "process", "system"],
    })

    expect(Object.keys(support.capabilities).sort()).toEqual([
      "applications",
      "browser",
      "disk",
      "files",
      "input",
      "process",
      "screen",
      "system",
    ])
    expect(support.runnableCapabilityGroups).toEqual([
      "browser",
      "disk",
      "files",
      "process",
      "system",
    ])
  })
})
