import { describe, expect, it } from "vitest"
import {
  createMcpMutationRequest,
  createMcpProtectedUpdateRequest,
  initialMcpConnectionFlow,
  normalizeMcpDraft,
  reduceMcpConnectionFlow,
  verifyMcpMutationProjection,
} from "../packages/webui/src/lib/mcp-connection-flow.js"

describe("task030 MCP connection flow", () => {
  it("moves through probe, save and projection verification", () => {
    let flow = initialMcpConnectionFlow()
    flow = reduceMcpConnectionFlow(flow, { type: "probe", sequence: 1 })
    flow = reduceMcpConnectionFlow(flow, { type: "probe_completed", sequence: 1, ready: true })
    flow = reduceMcpConnectionFlow(flow, { type: "save", sequence: 2 })
    flow = reduceMcpConnectionFlow(flow, { type: "save_completed", sequence: 2, active: true })
    expect(flow.state).toBe("verifying")
    flow = reduceMcpConnectionFlow(flow, {
      type: "verification_completed",
      sequence: 2,
      verified: true,
    })
    expect(flow.state).toBe("succeeded")
  })

  it("invalidates evidence on edits and ignores stale completions", () => {
    let flow = reduceMcpConnectionFlow(initialMcpConnectionFlow(), { type: "probe", sequence: 3 })
    expect(
      reduceMcpConnectionFlow(flow, { type: "probe_completed", sequence: 2, ready: true }),
    ).toEqual(flow)
    flow = reduceMcpConnectionFlow(flow, { type: "probe_completed", sequence: 3, ready: true })
    flow = reduceMcpConnectionFlow(flow, {
      type: "draft_changed",
      patch: { displayName: "Changed" },
    })
    expect(flow).toMatchObject({ state: "editing", reasonCodes: [] })
    expect(() => reduceMcpConnectionFlow(flow, { type: "save", sequence: 4 })).toThrow(
      "mcp_connection_transition_invalid",
    )
  })

  it("normalizes args and creates public requests without hidden fields", () => {
    const draft = {
      displayName: " Penpot ",
      command: " node ",
      argsText: "server.mjs\n\n--stdio ",
      cwd: " /workspace ",
      required: true,
      replaceConnection: true,
    }
    expect(normalizeMcpDraft(draft)).toEqual({
      displayName: "Penpot",
      transport: "stdio",
      command: "node",
      args: ["server.mjs", "--stdio"],
      cwd: "/workspace",
      required: true,
    })
    let id = 0
    const create = createMcpMutationRequest({
      draft,
      revision: 7,
      now: 100,
      randomId: () => `id-${++id}`,
    })
    expect(create.envelope).toEqual({
      scope: "capability:write",
      mutationId: "id-1",
      targetRevision: 8,
      purpose: "mcp_create",
      issuedAt: 100,
      nonce: "id-2",
    })
    const update = createMcpProtectedUpdateRequest({
      draft: { ...draft, replaceConnection: false },
      revision: 8,
      now: 101,
      randomId: () => `id-${++id}`,
    })
    expect(update.change).toEqual({ displayName: "Penpot", required: true })
    expect(JSON.stringify(update.change)).not.toMatch(/command|args|cwd|environment|secret/)
  })

  it("accepts success only when the target revision is ready in list and detail", () => {
    const mcpRef = `mcp_v1_${"a".repeat(24)}`
    const projection = {
      mcpRef,
      displayName: "Penpot",
      transport: "stdio" as const,
      configuredStatus: "enabled" as const,
      runtimeStatus: "ready" as const,
      required: false,
      toolCount: 1,
      bindingCount: 0,
      issueCode: null,
      revision: 8,
    }
    const receipt = {
      mutationId: "m1",
      state: "active" as const,
      reasonCode: null,
      allowedActions: [],
      revision: 8,
      mcpRef,
    }
    const catalog = { items: [projection], nextCursor: null, revision: 8, observedAt: 100 }
    const detail = { ...projection, tools: [{ name: "inspect", description: "" }] }
    expect(verifyMcpMutationProjection({ receipt, catalog, detail })).toBe(true)
    expect(
      verifyMcpMutationProjection({
        receipt,
        catalog,
        detail: { ...detail, runtimeStatus: "unavailable" },
      }),
    ).toBe(false)
    expect(
      verifyMcpMutationProjection({ receipt, catalog: { ...catalog, revision: 9 }, detail }),
    ).toBe(false)
  })
})
