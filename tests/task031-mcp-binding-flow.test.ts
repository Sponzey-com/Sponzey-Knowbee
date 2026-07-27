import { describe, expect, it } from "vitest"
import {
  createMcpBindingRequest,
  initialMcpBindingFlow,
  mcpBindingDiff,
  reduceMcpBindingFlow,
} from "../packages/webui/src/lib/mcp-binding-flow.js"

describe("task031 MCP binding flow", () => {
  it("builds a stable minimal diff", () => {
    let flow = reduceMcpBindingFlow(initialMcpBindingFlow(["agent-b", "agent-a"]), { type: "edit" })
    flow = reduceMcpBindingFlow(flow, { type: "toggle", agentRef: "agent-a" })
    flow = reduceMcpBindingFlow(flow, { type: "toggle", agentRef: "agent-c" })
    expect(mcpBindingDiff(flow)).toEqual([
      { agentRef: "agent-a", bound: false },
      { agentRef: "agent-c", bound: true },
    ])
  })
  it("ignores stale completion and reconciles actual refs after partial failure", () => {
    let flow = reduceMcpBindingFlow(initialMcpBindingFlow(["agent-a"]), { type: "edit" })
    flow = reduceMcpBindingFlow(flow, { type: "toggle", agentRef: "agent-b" })
    flow = reduceMcpBindingFlow(flow, { type: "save", sequence: 2 })
    expect(
      reduceMcpBindingFlow(flow, { type: "save_completed", sequence: 1, active: true }),
    ).toEqual(flow)
    flow = reduceMcpBindingFlow(flow, { type: "save_completed", sequence: 2, active: true })
    flow = reduceMcpBindingFlow(flow, {
      type: "verification_completed",
      sequence: 2,
      verified: false,
      persistedRefs: ["agent-a", "agent-b"],
      reasonCode: "mcp_binding_partial_failure",
    })
    expect(flow).toMatchObject({
      state: "failed",
      persistedRefs: ["agent-a", "agent-b"],
      draftRefs: ["agent-a", "agent-b"],
      reasonCode: "mcp_binding_partial_failure",
    })
  })
  it("chains revision and purpose without actor or internal IDs", () => {
    const ids = ["m1", "n1"]
    const request = createMcpBindingRequest({
      bound: false,
      revision: 8,
      now: 100,
      randomId: () => ids.shift() ?? "missing-id",
    })
    expect(request).toMatchObject({
      envelope: { targetRevision: 9, purpose: "mcp_unbind" },
      bound: false,
    })
    expect(JSON.stringify(request)).not.toMatch(/actor|internal|agentRef|secret/)
  })
})
