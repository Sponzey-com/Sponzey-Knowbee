import { describe, expect, it, vi } from "vitest"
import { registerYeonjangInstancesRoute } from "../packages/core/src/api/routes/yeonjang-instances.js"
import { createAgentPublicRef } from "../packages/core/src/capabilities/agent-public-reference.js"
import { createYeonjangPublicRef } from "../packages/core/src/capabilities/yeonjang-public-reference.js"

type Handler = (...args: unknown[]) => unknown

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

const instanceId = "instance:private"
const yeonjangRef = createYeonjangPublicRef(instanceId)
const agentRef = createAgentPublicRef("agent:private")
const fleet = {
  instances: [
    {
      instanceId,
      nodeId: "node:private",
      instanceAlias: "studio",
      displayName: "Studio",
      normalizedCallName: "studio",
      location: "local",
      platform: "darwin",
      supportProfile: "desktop_interactive",
      state: "permission_required",
      lastSeenAt: 900,
      lastHeartbeatAgeMs: 100,
      runnableTarget: false,
      runnableReasonCodes: [],
      trustState: "trusted",
      scopeAccess: "allowed",
      duplicateLiveSessionDetected: false,
      supportedMethods: ["screen.capture"],
      session: null,
    },
  ],
  summary: { duplicateLocalDetected: false },
  diffSummaries: [],
  promptProjection: {},
}

function envelope(purpose: string) {
  return {
    scope: "capability:write",
    mutationId: `mutation:${purpose}`,
    targetRevision: 1,
    purpose,
    issuedAt: 1_000,
    nonce: `nonce:${purpose}`,
  }
}

describe("task035 Yeonjang mutation API", () => {
  it("injects the authenticated actor and exposes only public recovery receipt fields", async () => {
    const postHandlers = new Map<string, Handler>()
    const recoveryExecutor = vi.fn(async (input) => ({
      mutationId: input.envelope.mutationId,
      state: "active" as const,
      reasonCode: null,
      allowedActions: [],
      revision: 0,
      yeonjangRef: input.yeonjangRef,
      action: input.action,
      ready: true,
    }))
    registerYeonjangInstancesRoute(
      {
        get() {},
        post(path: string, _options: unknown, handler: Handler) {
          postHandlers.set(path, handler)
        },
        patch() {},
      } as never,
      {
        fleetProjection: () => fleet as never,
        now: () => 1_000,
        currentRevision: () => 0,
        mutationActorForRequest: () => "user:authenticated",
        recoveryExecutor,
      },
    )
    const response = reply()
    const receipt = await postHandlers.get("/api/capabilities/yeonjang/:yeonjangRef/recovery")?.(
      {
        params: { yeonjangRef },
        body: { envelope: envelope("yeonjang_check_permissions"), action: "check_permissions" },
      },
      response.value,
    )
    expect(response.state.statusCode).toBe(200)
    expect(recoveryExecutor).toHaveBeenCalledWith(
      expect.objectContaining({
        envelope: expect.objectContaining({ actorRef: "user:authenticated" }),
        yeonjangRef,
        action: "check_permissions",
      }),
    )
    expect(JSON.stringify(receipt)).not.toMatch(/instance:private|node:private/u)
  })

  it("validates public binding refs and maps rejected receipts", async () => {
    const patchHandlers = new Map<string, Handler>()
    const bindingExecutor = vi.fn(async (input) => ({
      mutationId: input.envelope.mutationId,
      state: "rejected" as const,
      reasonCode: "mutation_revision_conflict",
      allowedActions: [],
      revision: 2,
      yeonjangRef: input.yeonjangRef,
      agentRef: input.agentRef,
      bound: false,
    }))
    registerYeonjangInstancesRoute(
      {
        get() {},
        post() {},
        patch(path: string, _options: unknown, handler: Handler) {
          patchHandlers.set(path, handler)
        },
      } as never,
      {
        fleetProjection: () => fleet as never,
        mutationActorForRequest: () => "user:authenticated",
        bindingExecutor,
      },
    )
    const handler = patchHandlers.get("/api/capabilities/yeonjang/:yeonjangRef/bindings/:agentRef")
    const response = reply()
    const receipt = await handler?.(
      {
        params: { yeonjangRef, agentRef },
        body: { envelope: envelope("yeonjang_bind"), bound: true },
      },
      response.value,
    )
    expect(response.state.statusCode).toBe(409)
    expect(receipt).toMatchObject({ reasonCode: "mutation_revision_conflict", bound: false })
    const malformed = reply()
    expect(
      await handler?.(
        {
          params: { yeonjangRef: instanceId, agentRef },
          body: { envelope: envelope("yeonjang_bind"), bound: true },
        },
        malformed.value,
      ),
    ).toEqual({ error: "yeonjang_binding_ref_invalid" })
    expect(malformed.state.statusCode).toBe(400)
  })
})
