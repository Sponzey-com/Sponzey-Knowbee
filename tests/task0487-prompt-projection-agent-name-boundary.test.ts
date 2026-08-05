import { describe, expect, it } from "vitest"
import {
  buildExecutorProfilePromptProjectionFromGraphSnapshot,
} from "../packages/core/src/orchestration/execution-context-builder.ts"
import {
  buildAgentPromptBundle,
  buildExecutorProfilePromptProjection,
  type ExecutorProfilePromptItem,
} from "../packages/core/src/orchestration/prompt-bundle.ts"
import {
  EXECUTION_GRAPH_ROOT_AGENT_ID,
  type ExecutionGraphSnapshot,
} from "../packages/core/src/orchestration/execution-graph-snapshot.ts"
import type { ExecutorProfile } from "../packages/core/src/orchestration/registry.ts"
import { CONTRACT_SCHEMA_VERSION } from "../packages/core/src/contracts/index.ts"
import type {
  KnowbeeConfig,
  MemoryPolicy,
  PermissionProfile,
  SkillMcpAllowlist,
  StructuredTaskScope,
} from "../packages/core/src/contracts/sub-agent-orchestration.ts"

const now = Date.UTC(2026, 6, 6, 10, 0, 0)
const rootExecutorId = EXECUTION_GRAPH_ROOT_AGENT_ID
const childExecutorId = "workspace:draft:node:research"

const taskScope: StructuredTaskScope = {
  goal: "Verify prompt projection naming.",
  intentType: "orchestration",
  actionType: "delegate",
  constraints: ["Use canonical agentName in prompt projections."],
  expectedOutputs: [{
    outputId: "answer",
    kind: "text",
    description: "Projection naming result.",
    required: true,
    acceptance: {
      requiredEvidenceKinds: ["test"],
      artifactRequired: false,
      reasonCodes: ["agent_name_projection_verified"],
    },
  }],
  requestedBy: {
    ownerType: "user",
    ownerId: "user:test",
    agentNameSnapshot: "사용자",
  },
  permissions: {
    read: false,
    write: false,
    execute: false,
    network: false,
    approvalRequired: [],
  },
  allowedToolIds: [],
  allowedSystemIds: [],
  memoryScopes: [],
  createdAt: now,
}

const permissionProfile: PermissionProfile = {
  profileId: "permission:task0487",
  riskCeiling: "moderate",
  approvalRequiredFrom: "sensitive",
  allowExternalNetwork: false,
  allowFilesystemWrite: false,
  allowShellExecution: false,
  allowScreenControl: false,
  allowedPaths: [],
}

const skillMcpAllowlist: SkillMcpAllowlist = {
  enabledSkillIds: [],
  enabledMcpServerIds: [],
  enabledToolNames: [],
  disabledToolNames: [],
}

function memoryPolicy(): MemoryPolicy {
  const owner = { ownerType: "knowbee" as const, ownerId: rootExecutorId }
  return {
    owner,
    visibility: "private",
    readScopes: [owner],
    writeScope: owner,
    retentionPolicy: "long_term",
    writebackReviewRequired: true,
  }
}

function agent(): KnowbeeConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentId: rootExecutorId,
    agentType: "knowbee",
    status: "enabled",
    agentName: "마당쇠",
    displayName: "Legacy Root",
    nickname: "Legacy Root",
    role: "Root",
    personality: "Direct.",
    specialtyTags: [],
    avoidTasks: [],
    promptFragments: [],
    memoryPolicy: memoryPolicy(),
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist,
      rateLimit: { maxConcurrentCalls: 2 },
    },
    modelProfile: { provider: "openai", model: "gpt-test" },
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
  }
}

function profile(executorId: string, displayName: string): ExecutorProfile {
  return {
    schemaVersion: 1,
    executorId,
    displayName,
    roleName: "Research",
    definition: "Find evidence and summarize it.",
    does: ["research"],
    delegationScope: ["research"],
    expectedOutputs: ["summary"],
    handoffStyle: "structured_handoff",
    declineCriteria: [],
    riskBoundary: [],
  }
}

function graph(): ExecutionGraphSnapshot {
  return {
    graphId: "execution-graph:task0487",
    graphSource: "workspace_draft",
    generatedAt: now,
    rootAgentId: rootExecutorId,
    currentExecutorId: rootExecutorId,
    topologyId: "workspace:draft",
    topologyVersion: 1,
    agentsById: {
      [rootExecutorId]: {
        agentId: rootExecutorId,
        agentName: "마당쇠",
        source: "config",
        status: "active",
        delegationEnabled: true,
        executionCandidate: true,
        role: "root",
        specialtyTags: [],
        reasonCodes: [],
      },
      [childExecutorId]: {
        agentId: childExecutorId,
        agentName: "현장 조사",
        source: "topology",
        status: "active",
        delegationEnabled: false,
        executionCandidate: true,
        role: "research",
        specialtyTags: ["research"],
        executorProfile: profile(childExecutorId, "Legacy Research Profile"),
        reasonCodes: [],
      },
    },
    directChildAgentIdsByParent: {
      [rootExecutorId]: [childExecutorId],
    },
    edgeIndex: {
      [rootExecutorId]: {
        [childExecutorId]: {
          edgeId: "edge:root-research",
          parentAgentId: rootExecutorId,
          childAgentId: childExecutorId,
          source: "topology_relation",
          executionCandidate: true,
          reasonCodes: [],
        },
      },
    },
    edges: [{
      edgeId: "edge:root-research",
      parentAgentId: rootExecutorId,
      childAgentId: childExecutorId,
      source: "topology_relation",
      executionCandidate: true,
      reasonCodes: [],
    }],
    rootDirectChildAgentIds: [childExecutorId],
    allRegisteredExecutorIds: [rootExecutorId, childExecutorId],
    allActiveExecutorIds: [rootExecutorId, childExecutorId],
    availableExecutorIds: [childExecutorId],
    validationIssues: [],
    trace: {
      execution_graph_id: "execution-graph:task0487",
      graph_source: "workspace_draft",
      current_executor_id: rootExecutorId,
      available_executor_ids: [childExecutorId],
    },
  }
}

function expectNoDisplayName(item: ExecutorProfilePromptItem): void {
  expect(item).not.toHaveProperty("displayName")
}

describe("task0487 prompt projection agentName boundary", () => {
  it("uses explicit agentName map instead of legacy ExecutorProfile displayName", () => {
    const projection = buildExecutorProfilePromptProjection({
      currentExecutorId: rootExecutorId,
      executorProfiles: [profile(childExecutorId, "Legacy Research Profile")],
      connections: [{ fromExecutorId: rootExecutorId, toExecutorId: childExecutorId }],
      agentNamesByExecutorId: {
        [childExecutorId]: "현장 조사",
      },
    })

    expect(projection.selectableExecutors[0]).toMatchObject({
      executorId: childExecutorId,
      agentName: "현장 조사",
    })
    expectNoDisplayName(projection.selectableExecutors[0])
  })

  it("does not infer agentName from legacy ExecutorProfile displayName", () => {
    const projection = buildExecutorProfilePromptProjection({
      currentExecutorId: rootExecutorId,
      executorProfiles: [profile(childExecutorId, "Legacy Research Profile")],
      connections: [{ fromExecutorId: rootExecutorId, toExecutorId: childExecutorId }],
    })

    expect(projection.selectableExecutors[0]).toMatchObject({
      executorId: childExecutorId,
      agentName: "Unnamed sub-agent",
    })
    expect(projection.selectableExecutors[0]?.agentName).not.toBe("Legacy Research Profile")
    expectNoDisplayName(projection.selectableExecutors[0])
  })

  it("uses graph agentName over legacy profile displayName when rendering executor profile prompts", () => {
    const projection = buildExecutorProfilePromptProjectionFromGraphSnapshot(graph())
    const selected = projection.selectableExecutors[0]

    expect(selected).toMatchObject({
      executorId: childExecutorId,
      agentName: "현장 조사",
    })
    expectNoDisplayName(selected)

    const result = buildAgentPromptBundle({
      agent: agent(),
      taskScope,
      promptSources: [],
      executorProfileProjection: projection,
      now: () => now,
    })

    expect(result.renderedPrompt).toContain("agentName: 현장 조사")
    expect(result.renderedPrompt).not.toContain("name: Legacy Research")
    expect(result.renderedPrompt).not.toContain("displayName")
  })
})
