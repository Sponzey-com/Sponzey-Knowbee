import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { registerCapabilitiesRoute } from "../packages/core/src/api/routes/capabilities.js"
import { registerStatusRoute } from "../packages/core/src/api/routes/status.js"
import { CONTRACT_SCHEMA_VERSION } from "../packages/core/src/contracts/index.js"
import type {
  MemoryPolicy,
  PermissionProfile,
  SkillMcpAllowlist,
  SubAgentConfig,
} from "../packages/core/src/contracts/sub-agent-orchestration.ts"
import type { OrchestrationConfig } from "../packages/core/src/config/index.js"
import { createUpdateRuntimeContext } from "../packages/core/src/update/service.ts"
import { initializeToolDispatcher } from "../packages/core/src/tools/index.ts"
import { closeDb, upsertAgentConfig } from "../packages/core/src/db/index.js"
import {
  orchestrationCapabilityStatus,
  resolveOrchestrationModeSnapshotSync,
} from "../packages/core/src/orchestration/mode.ts"
import { buildExampleEnterpriseTopology } from "../packages/core/src/topology/examples.js"
import { createEnterpriseTopologyRegistry } from "../packages/core/src/topology/registry.js"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []
const now = Date.UTC(2026, 3, 23, 0, 0, 0)
let runtimeFixture: ReturnType<typeof createTestRuntimeConfigFixture>

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task001-orchestration-mode-"))
  tempDirs.push(rootDir)
  runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

beforeEach(() => {
  useTempState()
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

const permissionProfile: PermissionProfile = {
  profileId: "profile:safe",
  riskCeiling: "moderate",
  approvalRequiredFrom: "moderate",
  allowExternalNetwork: true,
  allowFilesystemWrite: false,
  allowShellExecution: false,
  allowScreenControl: false,
  allowedPaths: [],
}

const allowlist: SkillMcpAllowlist = {
  enabledSkillIds: [],
  enabledMcpServerIds: [],
  enabledToolNames: [],
  disabledToolNames: [],
}

function memoryPolicy(agentId: string): MemoryPolicy {
  return {
    owner: { ownerType: "sub_agent", ownerId: agentId },
    visibility: "private",
    readScopes: [{ ownerType: "sub_agent", ownerId: agentId }],
    writeScope: { ownerType: "sub_agent", ownerId: agentId },
    retentionPolicy: "long_term",
    writebackReviewRequired: true,
  }
}

function orchestrationConfig(overrides: Partial<OrchestrationConfig> = {}): OrchestrationConfig {
  return {
    maxDelegationTurns: 5,
    mode: "single_knowbee",
    featureFlagEnabled: false,
    subAgents: [],
    teams: [],
    ...overrides,
  }
}

function subAgent(input: {
  agentId: string
  status?: SubAgentConfig["status"]
  delegationEnabled?: boolean
}): SubAgentConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId: input.agentId,
    displayName: input.agentId,
    nickname: input.agentId,
    status: input.status ?? "enabled",
    role: "worker",
    personality: "Precise",
    specialtyTags: ["general"],
    avoidTasks: [],
    memoryPolicy: memoryPolicy(input.agentId),
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist: allowlist,
      rateLimit: { maxConcurrentCalls: 1 },
    },
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
    teamIds: [],
    delegation: {
      enabled: input.delegationEnabled ?? true,
      maxParallelSessions: 1,
    },
  }
}

describe("task001 orchestration mode baseline", () => {
  it("does not load the registry when the feature flag is off", () => {
    const snapshot = resolveOrchestrationModeSnapshotSync({
      config: {
        orchestration: orchestrationConfig({
          mode: "orchestration",
          featureFlagEnabled: false,
          subAgents: [subAgent({ agentId: "agent:ready" })],
        }),
      },
      loadRegistry: () => {
        throw new Error("registry should not be loaded")
      },
      now: () => now,
    })

    expect(snapshot).toMatchObject({
      mode: "single_knowbee",
      status: "ready",
      requestedMode: "orchestration",
      featureFlagEnabled: false,
      reasonCode: "feature_flag_off",
      activeSubAgentCount: 0,
    })
  })

  it("uses the configured main agent name in fallback reasons", () => {
    const snapshot = resolveOrchestrationModeSnapshotSync({
      config: {
        orchestration: orchestrationConfig({
          mode: "orchestration",
          featureFlagEnabled: false,
          subAgents: [subAgent({ agentId: "agent:ready" })],
        }),
      },
      mainAgentNameSnapshot: "마당쇠",
      now: () => now,
    })

    expect(snapshot.mainAgentNameSnapshot).toBe("마당쇠")
    expect(snapshot.reason).toContain("마당쇠 직접 처리 모드")
    expect(snapshot.reason).not.toContain("단일 노비")
  })

  it("falls back to single_knowbee and counts disabled DB agents when no active agent is available", () => {
    upsertAgentConfig(subAgent({ agentId: "agent:disabled", status: "disabled" }), { now })

    const snapshot = resolveOrchestrationModeSnapshotSync({
      config: {
        orchestration: orchestrationConfig({
          mode: "orchestration",
          featureFlagEnabled: true,
        }),
      },
      now: () => now,
    })

    expect(snapshot).toMatchObject({
      mode: "single_knowbee",
      status: "ready",
      reasonCode: "no_active_sub_agents",
      activeSubAgentCount: 0,
      totalSubAgentCount: 1,
      disabledSubAgentCount: 1,
    })
  })

  it("treats delegation-disabled DB agents as unavailable for orchestration", () => {
    upsertAgentConfig(subAgent({ agentId: "agent:no-delegation", delegationEnabled: false }), { now })

    const snapshot = resolveOrchestrationModeSnapshotSync({
      config: {
        orchestration: orchestrationConfig({
          mode: "orchestration",
          featureFlagEnabled: true,
        }),
      },
      now: () => now,
    })

    expect(snapshot).toMatchObject({
      mode: "single_knowbee",
      reasonCode: "no_active_sub_agents",
      totalSubAgentCount: 1,
      disabledSubAgentCount: 1,
    })
  })

  it("uses saved topology nodes as active orchestration agents", () => {
    const topology = buildExampleEnterpriseTopology(now)
    createEnterpriseTopologyRegistry({ now: () => now }).appendTopologyVersion({
      topology,
      createdBy: "task001-test",
    })

    const snapshot = resolveOrchestrationModeSnapshotSync({
      config: {
        orchestration: orchestrationConfig({
          mode: "orchestration",
          featureFlagEnabled: true,
        }),
      },
      now: () => now,
    })

    expect(snapshot).toMatchObject({
      mode: "orchestration",
      status: "ready",
      reasonCode: "orchestration_ready",
      activeSubAgentCount: 2,
      totalSubAgentCount: 2,
      disabledSubAgentCount: 0,
    })
    expect(snapshot.reason).toContain("서브 에이전트 2개")
    expect(snapshot.activeSubAgents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agentName: "Customer Request Intake",
        source: "topology",
        topologyId: topology.id,
        executorId: "node:intake",
      }),
      expect.objectContaining({
        agentName: "Customer Request Triage",
        source: "topology",
        topologyId: topology.id,
        executorId: "node:triage",
      }),
    ]))
    for (const activeSubAgent of snapshot.activeSubAgents) {
      expect(activeSubAgent).not.toHaveProperty("displayName")
      expect(activeSubAgent).not.toHaveProperty("nickname")
    }
  })

  it("returns a degraded single_knowbee snapshot when registry loading fails", () => {
    const snapshot = resolveOrchestrationModeSnapshotSync({
      config: {
        orchestration: orchestrationConfig({
          mode: "orchestration",
          featureFlagEnabled: true,
        }),
      },
      loadRegistry: () => {
        throw new Error("boom")
      },
      now: () => now,
    })

    expect(snapshot).toMatchObject({
      mode: "single_knowbee",
      status: "degraded",
      reasonCode: "registry_load_failed",
      activeSubAgentCount: 0,
    })
    expect(orchestrationCapabilityStatus(snapshot)).toEqual({ status: "error", enabled: false })
  })

  it("redacts registry loading failure details before building fallback reasons", () => {
    const secret = "sk-task0586-orchestration-secret-1234567890"
    const localPath = "/Users/dongwooshin/private/orchestration-registry.json"
    const snapshot = resolveOrchestrationModeSnapshotSync({
      config: {
        orchestration: orchestrationConfig({
          mode: "orchestration",
          featureFlagEnabled: true,
        }),
      },
      loadRegistry: () => {
        throw new Error(`registry failed token=${secret} path=${localPath}`)
      },
      mainAgentNameSnapshot: "마당쇠",
      now: () => now,
    })

    expect(snapshot).toMatchObject({
      mode: "single_knowbee",
      status: "degraded",
      reasonCode: "registry_load_failed",
      mainAgentNameSnapshot: "마당쇠",
    })
    expect(snapshot.reason).toContain("마당쇠 직접 처리 모드")
    expect(snapshot.reason).toContain("token=***")
    expect(snapshot.reason).toContain("[internal-path-redacted]")
    expect(snapshot.reason).not.toContain(secret)
    expect(snapshot.reason).not.toContain(localPath)
  })

  it("exposes the orchestration mode snapshot through status and capabilities APIs", async () => {
    const routes = new Map<string, (request: unknown) => unknown | Promise<unknown>>()
    const app = {
      get(path: string, _options: unknown, handler: (request: unknown) => unknown | Promise<unknown>) {
        routes.set(path, handler)
      },
      post(path: string, _options: unknown, handler: (request: unknown) => unknown | Promise<unknown>) {
        routes.set(`POST ${path}`, handler)
      },
    }
    const paths = runtimeFixture.paths
    const config = runtimeFixture.config
    initializeToolDispatcher(config)
    const request = {
      server: { knowbeeRuntimeContext: { config, paths } },
    }
    registerStatusRoute(app as never, {
      updateRuntime: createUpdateRuntimeContext(paths, {}),
    })
    registerCapabilitiesRoute(app as never)

    const statusBody = await routes.get("/api/status")?.(request)
    expect(statusBody).toMatchObject({
      orchestration: {
        mode: "single_knowbee",
        status: "ready",
        reasonCode: "mode_single_knowbee",
      },
      orchestratorStatus: {
        mode: "single_knowbee",
        reasonCode: "mode_single_knowbee",
      },
    })

    const capabilitiesBody = await routes.get("/api/capabilities")?.(request) as {
      orchestration: unknown
      items: Array<{ key: string }>
    }
    expect(capabilitiesBody.orchestration).toMatchObject({
      mode: "single_knowbee",
      status: "ready",
      reasonCode: "mode_single_knowbee",
    })
    expect(capabilitiesBody.items.find((item) => item.key === "gateway.orchestrator")).toMatchObject({
      enabled: false,
      metadata: expect.objectContaining({
        mode: "single_knowbee",
        reasonCode: "mode_single_knowbee",
      }),
    })
  })
})
