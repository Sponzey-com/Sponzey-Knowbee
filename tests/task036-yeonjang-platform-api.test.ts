import { describe, expect, it } from "vitest"
import { registerYeonjangInstancesRoute } from "../packages/core/src/api/routes/yeonjang-instances.js"
import { createYeonjangPublicRef } from "../packages/core/src/capabilities/yeonjang-public-reference.js"

type Handler = (...args: unknown[]) => unknown

function reply() {
  return {
    status() {
      return this
    },
    send(payload: unknown) {
      return payload
    },
  }
}

const internalId = "private-platform-instance"
const fleet = {
  instances: [
    {
      instanceId: internalId,
      nodeId: "private-node",
      instanceAlias: "linux",
      displayName: "Build Linux",
      location: "remote",
      platform: "linux",
      supportProfile: "headless_managed",
      state: "online",
      lastSeenAt: 1_000,
      lastHeartbeatAgeMs: 0,
      runnableTarget: true,
      trustState: "trusted",
      scopeAccess: "allowed",
      duplicateLiveSessionDetected: false,
      supportedMethods: ["system.info", "file.read"],
      session: { sessionId: "private-session" },
    },
  ],
  summary: { duplicateLocalDetected: false },
  diffSummaries: [],
  promptProjection: {},
}

describe("Task 036 Yeonjang platform public API", () => {
  it("adds a safe support summary to detail without expanding list items", async () => {
    const handlers = new Map<string, Handler>()
    registerYeonjangInstancesRoute(
      {
        get(path: string, _options: unknown, handler: Handler) {
          handlers.set(path, handler)
        },
        post() {},
      } as never,
      { fleetProjection: () => fleet as never, now: () => 1_000 },
    )
    const list = (await handlers.get("/api/capabilities/yeonjang")?.({ query: {} }, reply())) as {
      items: Array<Record<string, unknown>>
    }
    expect(list.items[0]).not.toHaveProperty("platformSupport")

    const detail = await handlers.get("/api/capabilities/yeonjang/:yeonjangRef")?.(
      { params: { yeonjangRef: createYeonjangPublicRef(internalId) } },
      reply(),
    )
    expect(detail).toMatchObject({
      platformSupport: {
        platform: "linux",
        trayWindow: { status: "unsupported" },
        packageSmoke: { status: "supported" },
        runnableCapabilityGroups: ["files", "system"],
      },
    })
    expect(JSON.stringify(detail)).not.toMatch(
      /private-platform-instance|private-node|private-session|executable|command|mqtt/iu,
    )
  })
})
