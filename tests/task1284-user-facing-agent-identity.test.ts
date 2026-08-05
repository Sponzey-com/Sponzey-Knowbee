import { describe, expect, it } from "vitest"
import {
  projectUserFacingAgentMessage,
  projectUserFacingAgentIdentity,
  type InternalAgentIdentity,
} from "../packages/core/src/contracts/user-facing-agent-identity.ts"

describe("task1284 user-facing agent identity boundary", () => {
  it("projects agent_name as the only ordinary user-facing identity field", () => {
    const input: InternalAgentIdentity = {
      agentId: "agent:internal-researcher",
      agentName: "연구 담당",
    }

    const projection = projectUserFacingAgentIdentity(input)

    expect(projection).toEqual({ agentName: "연구 담당" })
    expect(projection).not.toHaveProperty("agentId")
    expect(JSON.stringify(projection)).not.toContain("agent:internal-researcher")
  })

  it.each([
    { agentId: "agent:internal", agentName: "" },
    { agentId: "agent:internal", agentName: "   " },
  ])("rejects a missing agent_name instead of falling back to $agentId", (input) => {
    expect(() => projectUserFacingAgentIdentity(input)).toThrow(/agent name is required/i)
  })

  it("does not accept legacy displayName or nickname as an agent_name substitute", () => {
    const legacy = {
      agentId: "agent:internal",
      agentName: "",
      displayName: "Legacy display",
      nickname: "Legacy nickname",
    }

    expect(() => projectUserFacingAgentIdentity(legacy)).toThrow(/agent name is required/i)
  })

  it("returns an immutable value projection without changing the internal identity", () => {
    const input = Object.freeze({ agentId: "agent:review", agentName: " 검토 담당 " })

    expect(projectUserFacingAgentIdentity(input)).toEqual({ agentName: "검토 담당" })
    expect(input).toEqual({ agentId: "agent:review", agentName: " 검토 담당 " })
  })

  it("removes runtime, message, run, and speaker IDs from an ordinary conversation projection", () => {
    const projection = projectUserFacingAgentMessage({
      identity: { entityType: "sub_session", entityId: "runtime:secret" },
      messageId: "message:secret",
      parentRunId: "run:secret",
      speaker: {
        entityType: "agent",
        entityId: "agent:internal-researcher",
        agentNameSnapshot: "연구 담당",
      },
      text: "검증된 결과입니다.",
      createdAt: 1234,
    })

    expect(projection).toEqual({
      speaker: { agentName: "연구 담당" },
      text: "검증된 결과입니다.",
      createdAt: 1234,
    })
    expect(JSON.stringify(projection)).not.toMatch(/runtime:|message:|run:|agent:internal|entityId|agentId/)
  })
})
