import { describe, expect, it } from "vitest"
import type {
  AgentRelationshipProjection,
  AgentWorkspaceItem,
} from "../packages/webui/src/contracts/agents.js"
import {
  agentParentCandidates,
  buildAgentRelationshipCanvasModel,
  currentAgentParentRef,
} from "../packages/webui/src/lib/agent-relationship-viewmodel.js"

const rootRef = `agent_v1_${"0".repeat(24)}`
const refs = [1, 2, 3].map((value) => `agent_v1_${String(value).repeat(24)}`)
const agents: AgentWorkspaceItem[] = refs.map((agentRef, index) => ({
  agentRef,
  name: ["Research", "Writer", "Review"][index] as string,
  role: `Role ${index}`,
  status: "enabled",
  profileVersion: 1,
  updatedAt: 1,
  model: { configured: true, availability: "ready" },
  parentName: index === 0 ? "마당쇠" : "Research",
  directChildCount: index === 0 ? 2 : 0,
  bindingCounts: { skills: 0, mcpServers: 0, yeonjang: 0 },
  diagnosticCodes: [],
}))
const projection: AgentRelationshipProjection = {
  root: { agentRef: rootRef, name: "마당쇠" },
  relationships: [
    {
      relationshipRef: `relationship_v1_${"a".repeat(24)}`,
      parentRef: rootRef,
      parentName: "마당쇠",
      childRef: refs[0] as string,
      childName: "Research",
      depth: 1,
      sortOrder: 0,
    },
    ...refs.slice(1).map((childRef, index) => ({
      relationshipRef: `relationship_v1_${String(index + 1).repeat(24)}`,
      parentRef: refs[0] as string,
      parentName: "Research",
      childRef,
      childName: agents[index + 1]?.name ?? "Child",
      depth: 2,
      sortOrder: index,
    })),
  ],
  revision: 3,
  observedAt: 1,
}

describe("Task 041 agent relationship view model", () => {
  it("excludes self and descendants from parent candidates", () => {
    expect(agentParentCandidates({ selectedRef: refs[0] as string, agents, projection })).toEqual(
      [],
    )
    expect(
      agentParentCandidates({ selectedRef: refs[1] as string, agents, projection }).map(
        (item) => item.agentRef,
      ),
    ).toEqual([refs[0], refs[2]])
  })

  it("maps the public root relationship to an implicit parent", () => {
    expect(currentAgentParentRef(refs[0] as string, projection)).toBeNull()
    expect(currentAgentParentRef(refs[1] as string, projection)).toBe(refs[0])
  })

  it("never renders the root and emits only visible agent edges", () => {
    const model = buildAgentRelationshipCanvasModel({ agents, projection })
    expect(model.nodes).toHaveLength(3)
    expect(model.nodes.some((node) => node.agentRef === rootRef)).toBe(false)
    expect(model.nodes[0]).toMatchObject({ name: "Research", parentLabel: "마당쇠 직속", depth: 1 })
    expect(model.edges).toHaveLength(2)
    expect(JSON.stringify(model)).not.toContain(rootRef)
  })

  it("keeps empty, single and 100-agent models bounded and deterministic", () => {
    expect(
      buildAgentRelationshipCanvasModel({
        agents: [],
        projection: { ...projection, relationships: [] },
      }),
    ).toEqual({ nodes: [], edges: [] })
    const many = Array.from({ length: 100 }, (_, index) => ({
      ...(agents[0] as AgentWorkspaceItem),
      agentRef: `agent_v1_${index.toString(16).padStart(24, "0")}`,
      name: `Agent ${String(index).padStart(3, "0")}`,
    }))
    const first = buildAgentRelationshipCanvasModel({
      agents: many,
      projection: { ...projection, relationships: [] },
    })
    const second = buildAgentRelationshipCanvasModel({
      agents: many,
      projection: { ...projection, relationships: [] },
    })
    expect(first.nodes).toHaveLength(100)
    expect(first).toEqual(second)
  })
})
