import { describe, expect, it } from "vitest"
import { registerYeonjangInstancesRoute } from "../packages/core/src/api/routes/yeonjang-instances.js"
import { createYeonjangPublicRef } from "../packages/core/src/capabilities/yeonjang-public-reference.js"

function reply() {
  const state = { statusCode: 200 }
  return {
    state,
    value: {
      status(code: number) {
        state.statusCode = code
        return this
      },
      send(payload: unknown) {
        return payload
      },
    },
  }
}

const internalId = "instance-private-1"
type RouteHandler = (...args: unknown[]) => unknown
const fleet = {
  instances: [
    {
      instanceId: internalId,
      nodeId: "node-private",
      instanceAlias: "studio",
      displayName: "Studio Mac",
      normalizedCallName: "studio mac",
      location: "local",
      platform: "darwin",
      supportProfile: "desktop_interactive",
      state: "online",
      lastSeenAt: 900,
      lastHeartbeatAgeMs: 100,
      runnableTarget: true,
      runnableReasonCodes: [],
      trustState: "trusted",
      scopeAccess: "allowed",
      duplicateLiveSessionDetected: false,
      supportedMethods: ["screen.capture"],
      session: { sessionId: "session-private" },
      hostFingerprintPreview: "host-private",
      installFingerprintPreview: "install-private",
      transport: ["topic-private"],
    },
  ],
  summary: { duplicateLocalDetected: false },
  diffSummaries: [],
  promptProjection: {},
}

describe("task034 Yeonjang canonical capability API", () => {
  it("returns only a public paged projection and resolves public detail", async () => {
    const handlers = new Map<string, RouteHandler>()
    const preHandlers = new Map<string, unknown>()
    registerYeonjangInstancesRoute(
      {
        get(path: string, options: { preHandler?: unknown }, handler: RouteHandler) {
          handlers.set(path, handler)
          preHandlers.set(path, options.preHandler)
        },
        post() {},
      } as never,
      { fleetProjection: () => fleet as never, now: () => 1_000 },
    )
    const listReply = reply()
    const list = await handlers.get("/api/capabilities/yeonjang")?.(
      { query: { location: "local", limit: "10" } },
      listReply.value,
    )
    expect(listReply.state.statusCode).toBe(200)
    expect(list).toMatchObject({
      totalMatches: 1,
      cursorValid: true,
      items: [{ displayName: "Studio Mac", platform: "macos" }],
    })
    expect(preHandlers.get("/api/capabilities/yeonjang")).toBeTypeOf("function")
    const serialized = JSON.stringify(list)
    expect(serialized).not.toMatch(
      /instance-private|node-private|session-private|host-private|install-private|topic-private|supportedMethods/,
    )

    const detailReply = reply()
    const detail = await handlers.get("/api/capabilities/yeonjang/:yeonjangRef")?.(
      { params: { yeonjangRef: createYeonjangPublicRef(internalId) } },
      detailReply.value,
    )
    expect(detailReply.state.statusCode).toBe(200)
    expect(detail).toMatchObject({ displayName: "Studio Mac", location: "local" })
  })

  it("rejects malformed query, cursor and internal references", async () => {
    const handlers = new Map<string, RouteHandler>()
    registerYeonjangInstancesRoute(
      {
        get(path: string, _options: unknown, handler: RouteHandler) {
          handlers.set(path, handler)
        },
        post() {},
      } as never,
      { fleetProjection: () => fleet as never, now: () => 1_000 },
    )
    const malformed = reply()
    expect(
      await handlers.get("/api/capabilities/yeonjang")?.(
        { query: { limit: "999" } },
        malformed.value,
      ),
    ).toEqual({ error: "yeonjang_query_invalid" })
    expect(malformed.state.statusCode).toBe(400)
    const cursor = reply()
    expect(
      await handlers.get("/api/capabilities/yeonjang")?.(
        { query: { cursor: "yeonjang_v1_unknown" } },
        cursor.value,
      ),
    ).toEqual({ error: "yeonjang_cursor_invalid" })
    expect(cursor.state.statusCode).toBe(400)
    const internal = reply()
    expect(
      await handlers.get("/api/capabilities/yeonjang/:yeonjangRef")?.(
        { params: { yeonjangRef: internalId } },
        internal.value,
      ),
    ).toEqual({ error: "yeonjang_ref_invalid" })
    expect(internal.state.statusCode).toBe(400)
  })
})
