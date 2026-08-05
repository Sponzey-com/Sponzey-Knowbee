import { describe, expect, it } from "vitest"
import {
  createMcpDeleteRequest,
  createMcpLifecycleRequest,
  initialMcpLifecycleFlow,
  reduceMcpLifecycleFlow,
  verifyMcpLifecycleProjection,
} from "../packages/webui/src/lib/mcp-lifecycle-flow.js"

const receipt = {
  mutationId: "m1",
  state: "active" as const,
  reasonCode: null,
  allowedActions: [],
  revision: 8,
  mcpRef: "mcp-public",
  status: "disabled" as const,
  deleted: false,
  impact: { bindingCount: 0, agentNames: [] },
}

describe("task031 MCP lifecycle flow", () => {
  it("uses explicit confirm, saving and verification transitions and ignores stale completion", () => {
    let flow = reduceMcpLifecycleFlow(initialMcpLifecycleFlow(), {
      type: "begin",
      action: "disable",
    })
    flow = reduceMcpLifecycleFlow(flow, { type: "save", sequence: 2 })
    expect(
      reduceMcpLifecycleFlow(flow, { type: "save_completed", sequence: 1, active: true }),
    ).toEqual(flow)
    flow = reduceMcpLifecycleFlow(flow, { type: "save_completed", sequence: 2, active: true })
    flow = reduceMcpLifecycleFlow(flow, {
      type: "verification_completed",
      sequence: 2,
      verified: true,
    })
    expect(flow).toMatchObject({ state: "succeeded", action: "disable", reasonCode: null })
  })

  it("creates status and delete envelopes without actor or hidden connection fields", () => {
    const ids = ["m1", "n1", "m2", "n2"]
    const randomId = () => ids.shift() ?? "missing-id"
    expect(
      createMcpLifecycleRequest({ action: "disable", revision: 7, now: 100, randomId }),
    ).toMatchObject({ envelope: { purpose: "mcp_disable", targetRevision: 8 }, enabled: false })
    expect(createMcpDeleteRequest({ revision: 8, now: 101, randomId })).toMatchObject({
      envelope: { purpose: "mcp_delete", targetRevision: 9 },
    })
    expect(JSON.stringify(ids)).not.toMatch(/actor|command|args|cwd|secret/)
  })

  it("verifies configured and runtime status instead of trusting the receipt alone", () => {
    const list = { items: [{ mcpRef: "mcp-public" }], revision: 8 }
    expect(
      verifyMcpLifecycleProjection({
        action: "disable",
        receipt,
        list,
        detail: { configuredStatus: "disabled", runtimeStatus: "inactive", revision: 8 },
      }),
    ).toBe(true)
    expect(
      verifyMcpLifecycleProjection({
        action: "disable",
        receipt,
        list,
        detail: { configuredStatus: "disabled", runtimeStatus: "ready", revision: 8 },
      }),
    ).toBe(false)
    expect(
      verifyMcpLifecycleProjection({
        action: "delete",
        receipt: { ...receipt, status: "deleted", deleted: true },
        list: { items: [], revision: 8 },
      }),
    ).toBe(true)
    expect(
      verifyMcpLifecycleProjection({
        action: "delete",
        receipt: { ...receipt, status: "deleted", deleted: true },
        list,
      }),
    ).toBe(false)
  })
})
