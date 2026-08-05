import { describe, expect, it } from "vitest"
import {
  createMcpRecoveryRequest,
  initialMcpRecoveryFlow,
  reduceMcpRecoveryFlow,
  verifyMcpRecoveryProjection,
} from "../packages/webui/src/lib/mcp-recovery-flow"

describe("task032 MCP recovery UI state machine", () => {
  it("moves through inspection, targeted apply and latest projection verification", () => {
    let flow = reduceMcpRecoveryFlow(initialMcpRecoveryFlow(), { type: "start", sequence: 4 })
    expect(flow.state).toBe("inspecting")
    flow = reduceMcpRecoveryFlow(flow, { type: "inspection_completed", sequence: 4, ready: true })
    expect(flow.state).toBe("applying")
    flow = reduceMcpRecoveryFlow(flow, { type: "recovery_completed", sequence: 4, active: true })
    expect(flow.state).toBe("verifying")
    flow = reduceMcpRecoveryFlow(flow, {
      type: "verification_completed",
      sequence: 4,
      verified: true,
    })
    expect(flow.state).toBe("succeeded")
  })

  it("ignores stale completion and supports cancel plus retry", () => {
    const inspecting = reduceMcpRecoveryFlow(initialMcpRecoveryFlow(), {
      type: "start",
      sequence: 3,
    })
    expect(
      reduceMcpRecoveryFlow(inspecting, { type: "inspection_completed", sequence: 2, ready: true }),
    ).toEqual(inspecting)
    const cancelled = reduceMcpRecoveryFlow(inspecting, { type: "cancel" })
    expect(cancelled).toEqual(initialMcpRecoveryFlow())
    const failed = reduceMcpRecoveryFlow(inspecting, {
      type: "inspection_completed",
      sequence: 3,
      ready: false,
      reasonCode: "mcp_connection_probe_failed",
    })
    expect(reduceMcpRecoveryFlow(failed, { type: "start", sequence: 4 })).toMatchObject({
      state: "inspecting",
      sequence: 4,
      reasonCode: null,
    })
  })

  it("creates an exact recovery envelope and requires the latest tool projection", () => {
    const ids = ["mutation", "nonce"]
    const randomId = () => {
      const id = ids.shift()
      if (!id) throw new Error("test id exhausted")
      return id
    }
    expect(createMcpRecoveryRequest({ revision: 7, now: 100, randomId })).toEqual({
      envelope: {
        scope: "capability:write",
        mutationId: "mutation",
        targetRevision: 8,
        purpose: "mcp_recover",
        issuedAt: 100,
        nonce: "nonce",
      },
    })
    const receipt = {
      mutationId: "mutation",
      state: "active" as const,
      reasonCode: null,
      allowedActions: [],
      revision: 8,
      mcpRef: "mcp-public",
      ready: true,
      toolCount: 2,
    }
    const detail = {
      mcpRef: "mcp-public",
      displayName: "Penpot",
      transport: "stdio" as const,
      configuredStatus: "enabled" as const,
      runtimeStatus: "ready" as const,
      required: false,
      toolCount: 2,
      bindingCount: 0,
      issueCode: null,
      revision: 8,
      tools: [
        { name: "read", description: "" },
        { name: "inspect", description: "" },
      ],
      bindings: { boundAgents: [], availableAgents: [] },
    }
    expect(verifyMcpRecoveryProjection({ receipt, detail })).toBe(true)
    expect(verifyMcpRecoveryProjection({ receipt, detail: { ...detail, revision: 7 } })).toBe(false)
    expect(verifyMcpRecoveryProjection({ receipt, detail: { ...detail, tools: [] } })).toBe(false)
  })
})
