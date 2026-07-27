import { describe, expect, it } from "vitest"
import {
  type AgentRelationshipProjectionSource,
  buildAgentRelationshipProjection,
} from "../packages/core/src/agents/agent-relationship-projection.js"

const rootId = "agent:knowbee"
const sources: AgentRelationshipProjectionSource[] = [
  {
    internalEdgeId: "relationship:alpha",
    parentAgentId: rootId,
    parentName: "마당쇠",
    childAgentId: "agent:alpha",
    childName: "Alpha",
    status: "active",
    sortOrder: 0,
    revision: 10,
  },
  {
    internalEdgeId: "relationship:beta",
    parentAgentId: "agent:alpha",
    parentName: "Alpha",
    childAgentId: "agent:beta",
    childName: "Beta",
    status: "active",
    sortOrder: 0,
    revision: 11,
  },
]

const fixedRefForAgent = (id: string) => {
  const value = id.endsWith("alpha") ? "a" : id.endsWith("beta") ? "b" : "c"
  return `agent_v1_${value.repeat(24)}`
}
const refForRelationship = (id: string) => {
  const value = id.endsWith("alpha") ? "d" : "e"
  return `relationship_v1_${value.repeat(24)}`
}

describe("Task 040 public agent relationship projection", () => {
  it("projects a root reference and child relationships without internal ids", () => {
    const result = buildAgentRelationshipProjection({
      rootAgentId: rootId,
      rootName: "마당쇠",
      relationships: sources,
      observedAt: 20,
      publicRefForAgent: fixedRefForAgent,
      publicRefForRelationship: refForRelationship,
    })
    expect(result).toMatchObject({
      root: { agentRef: `agent_v1_${"c".repeat(24)}`, name: "마당쇠" },
      revision: 11,
      relationships: [
        { childName: "Alpha", parentName: "마당쇠", depth: 1 },
        { childName: "Beta", parentName: "Alpha", depth: 2 },
      ],
    })
    expect(JSON.stringify(result)).not.toMatch(/agent:|edgeId|internal|memory|prompt/iu)
  })

  it.each([
    [
      "agent_relationship_duplicate_parent",
      [...sources, { ...sources[1], internalEdgeId: "other", parentAgentId: rootId }],
    ],
    [
      "agent_relationship_cycle",
      [sources[1], { ...sources[0], internalEdgeId: "cycle", parentAgentId: "agent:beta" }],
    ],
  ])("fails closed with %s", (message, relationships) => {
    expect(() =>
      buildAgentRelationshipProjection({
        rootAgentId: rootId,
        rootName: "마당쇠",
        relationships,
        observedAt: 20,
        publicRefForAgent: fixedRefForAgent,
        publicRefForRelationship: refForRelationship,
      }),
    ).toThrow(message)
  })

  it("rejects public ref collisions", () => {
    expect(() =>
      buildAgentRelationshipProjection({
        rootAgentId: rootId,
        rootName: "마당쇠",
        relationships: sources,
        observedAt: 20,
        publicRefForAgent: () => `agent_v1_${"f".repeat(24)}`,
        publicRefForRelationship: () => `relationship_v1_${"e".repeat(24)}`,
      }),
    ).toThrow("agent_relationship_public_ref_collision")
  })
})
