import { describe, expect, it } from "vitest"
import {
  buildAgentNameSnapshotFromAgentConfig,
  CONTRACT_SCHEMA_VERSION,
  DEFAULT_KNOWBEE_AGENT_NAME,
  type SubAgentConfig,
} from "../packages/core/src/contracts/sub-agent-orchestration.ts"
import {
  KNOWBEE_PRODUCT_NAME,
  KNOWBEE_PRODUCT_NAME_KO,
  resolveMainAgentSelfName,
} from "../packages/core/src/agent/main-agent-identity.ts"
import { buildUserProfilePromptContext } from "../packages/core/src/agent/profile-context.ts"
import { buildAgentExecutionContextFromGraphSnapshot } from "../packages/core/src/orchestration/execution-context-builder.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import {
  EXECUTION_GRAPH_ROOT_AGENT_ID,
  type ExecutionGraphSnapshot,
} from "../packages/core/src/orchestration/execution-graph-snapshot.ts"
import { buildAdvancedSubAgentSettingsView } from "../packages/core/src/ui/sub-agent-settings.ts"

const internalChildId = "agent:internal:research"

function graph(childName = "조사 담당"): ExecutionGraphSnapshot {
  const rootId = EXECUTION_GRAPH_ROOT_AGENT_ID
  return {
    graphId: "execution-graph:task1212",
    graphSource: "db_config",
    generatedAt: 1,
    rootAgentId: rootId,
    currentExecutorId: rootId,
    agentsById: {
      [rootId]: {
        agentId: rootId,
        agentName: "마당쇠",
        source: "config",
        status: "active",
        delegationEnabled: true,
        executionCandidate: true,
        role: "coordinator",
        specialtyTags: [],
        reasonCodes: [],
      },
      [internalChildId]: {
        agentId: internalChildId,
        agentName: childName,
        source: "db",
        status: "enabled",
        delegationEnabled: false,
        executionCandidate: true,
        role: "research",
        specialtyTags: ["research"],
        reasonCodes: [],
      },
    },
    directChildAgentIdsByParent: { [rootId]: [internalChildId] },
    edgeIndex: {},
    edges: [],
    rootDirectChildAgentIds: [internalChildId],
    allRegisteredExecutorIds: [rootId, internalChildId],
    allActiveExecutorIds: [rootId, internalChildId],
    availableExecutorIds: [internalChildId],
    validationIssues: [],
    trace: {
      execution_graph_id: "execution-graph:task1212",
      graph_source: "db_config",
      current_executor_id: rootId,
      available_executor_ids: [internalChildId],
    },
  }
}

function subAgent(agentName: string): SubAgentConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId: internalChildId,
    agentName,
    status: "enabled",
    role: "research",
    personality: "concise",
    specialtyTags: ["research"],
    avoidTasks: [],
    memoryPolicy: {
      owner: { ownerType: "sub_agent", ownerId: internalChildId },
      visibility: "private",
      readScopes: [{ ownerType: "sub_agent", ownerId: internalChildId }],
      writeScope: { ownerType: "sub_agent", ownerId: internalChildId },
      retentionPolicy: "short_term",
      writebackReviewRequired: true,
    },
    capabilityPolicy: {
      permissionProfile: {
        profileId: "safe",
        riskCeiling: "low",
        approvalRequiredFrom: "dangerous",
        allowExternalNetwork: false,
        allowFilesystemWrite: false,
        allowShellExecution: false,
        allowScreenControl: false,
        allowedPaths: [],
      },
      skillMcpAllowlist: {
        enabledSkillIds: [],
        enabledMcpServerIds: [],
        enabledToolNames: [],
        disabledToolNames: [],
      },
      rateLimit: { maxConcurrentCalls: 1 },
    },
    delegationPolicy: { enabled: false, maxParallelSessions: 1 },
    teamIds: [],
    delegation: { enabled: false, maxParallelSessions: 1 },
    profileVersion: 1,
    createdAt: 1,
    updatedAt: 1,
  }
}

describe("task1212 platform, agent, and user identity boundary", () => {
  it("keeps product identity, configured main-agent identity, and user identity separate", () => {
    const config = {
      ...DEFAULT_CONFIG,
      profile: {
        ...DEFAULT_CONFIG.profile,
        displayName: "사용자",
        profileName: "legacy-user",
        language: "ko",
      },
      orchestration: {
        ...DEFAULT_CONFIG.orchestration,
        knowbee: {
          ...DEFAULT_CONFIG.orchestration.knowbee,
          agentName: "마당쇠",
        },
      },
    }

    expect([KNOWBEE_PRODUCT_NAME, KNOWBEE_PRODUCT_NAME_KO]).toEqual(["Knowbee", "노비"])
    expect(resolveMainAgentSelfName(config)).toBe("마당쇠")
    expect(buildUserProfilePromptContext(config.profile)).toContain("userName: 사용자")
    expect(buildUserProfilePromptContext(config.profile)).not.toContain("마당쇠")
  })

  it("attributes sub-agent snapshots and execution prompts only with agentName", () => {
    const snapshot = buildAgentNameSnapshotFromAgentConfig(subAgent("조사 담당"))
    const context = buildAgentExecutionContextFromGraphSnapshot({
      graph: graph(),
      request: { kind: "user_message", latest_user_message: "조사해줘" },
    })

    expect(snapshot.agentNameSnapshot).toBe("조사 담당")
    expect(context.accessible_executors[0]?.agent_name).toBe("조사 담당")
    expect(context.accessible_executors[0]?.agent_name).not.toContain(internalChildId)
  })

  it("rejects a blank user-facing name instead of exposing agentId as a fallback", () => {
    expect(() => buildAgentExecutionContextFromGraphSnapshot({
      graph: graph("   "),
      request: { kind: "user_message", latest_user_message: "조사해줘" },
    })).toThrow(`agent_name_required:${internalChildId}`)
  })

  it("uses the canonical product default when a compact graph omits only the root projection", () => {
    const compactGraph = graph()
    delete compactGraph.agentsById[EXECUTION_GRAPH_ROOT_AGENT_ID]
    const context = buildAgentExecutionContextFromGraphSnapshot({
      graph: compactGraph,
      request: { kind: "user_message", latest_user_message: "조사해줘" },
    })

    expect(context.current_executor.agent_name).toBe(DEFAULT_KNOWBEE_AGENT_NAME)
    expect(context.current_executor.agent_name).not.toBe(EXECUTION_GRAPH_ROOT_AGENT_ID)
  })

  it("uses the product default for an unnamed root and never renders an unknown parent ID", () => {
    const agent = subAgent("조사 담당")
    const view = buildAdvancedSubAgentSettingsView({
      rootAgent: { agentId: EXECUTION_GRAPH_ROOT_AGENT_ID },
      savedAgents: [agent],
      relationships: [{
        edgeId: "edge:root-child",
        parentAgentId: EXECUTION_GRAPH_ROOT_AGENT_ID,
        childAgentId: internalChildId,
        relationshipType: "parent_child",
        status: "active",
        sortOrder: 0,
      }],
    })

    expect(DEFAULT_KNOWBEE_AGENT_NAME).toBe("Knowbee")
    expect(view.agents[0]?.parentDisplayName).toBe("Knowbee")

    const unknownParentView = buildAdvancedSubAgentSettingsView({
      rootAgent: { agentId: EXECUTION_GRAPH_ROOT_AGENT_ID },
      savedAgents: [agent],
      relationships: [{
        edgeId: "edge:unknown-parent",
        parentAgentId: "agent:internal:missing-parent",
        childAgentId: internalChildId,
        relationshipType: "parent_child",
        status: "active",
        sortOrder: 0,
      }],
    })
    expect(unknownParentView.agents[0]?.parentDisplayName).toBeUndefined()
  })
})
