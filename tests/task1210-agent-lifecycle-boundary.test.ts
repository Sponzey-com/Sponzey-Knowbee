import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import {
  SUB_AGENT_CONTRACT_SCHEMA_VERSION,
  validateAgentConfig,
  type SubAgentConfig,
} from "../packages/core/src/contracts/sub-agent-orchestration.ts"
import {
  assertAgentLifecycleTransition,
  validateAgentLifecycleTransition,
} from "../packages/core/src/orchestration/agent-lifecycle.ts"
import { createAgentRegistryService } from "../packages/core/src/orchestration/registry.ts"
import { closeDb } from "../packages/core/src/db/index.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task1210-lifecycle-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
}

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

function subAgentConfig(overrides: Partial<SubAgentConfig> = {}): SubAgentConfig {
  return {
    schemaVersion: SUB_AGENT_CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId: "agent:research",
    agentName: "Research",
    status: "enabled",
    role: "Research assigned facts",
    personality: "Precise",
    specialtyTags: ["research"],
    avoidTasks: [],
    memoryPolicy: {
      owner: { ownerType: "sub_agent", ownerId: "agent:research" },
      visibility: "private",
      readScopes: [{ ownerType: "sub_agent", ownerId: "agent:research" }],
      writeScope: { ownerType: "sub_agent", ownerId: "agent:research" },
      retentionPolicy: "short_term",
      writebackReviewRequired: true,
    },
    capabilityPolicy: {
      permissionProfile: {
        profileId: "permission:research",
        riskCeiling: "safe",
        approvalRequiredFrom: "moderate",
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
    delegation: {
      enabled: false,
      maxParallelSessions: 1,
      directChildOnly: true,
      resultReviewRequired: true,
    },
    teamIds: [],
    profileVersion: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe("task1210 agent lifecycle boundary", () => {
  it("rejects an unknown runtime status before agent persistence", () => {
    const validation = validateAgentConfig({
      ...subAgentConfig(),
      status: "running",
    })

    expect(validation.ok).toBe(false)
    expect(validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "$.status" }),
    ]))
  })

  it.each([
    ["enabled", "disabled"],
    ["disabled", "enabled"],
    ["enabled", "degraded"],
    ["degraded", "enabled"],
    ["enabled", "archived"],
    ["archived", "archived"],
  ] as const)("allows the explicit lifecycle transition %s -> %s", (fromStatus, toStatus) => {
    expect(validateAgentLifecycleTransition({ fromStatus, toStatus })).toMatchObject({
      allowed: true,
      reasonCode: "agent_lifecycle_transition_allowed",
    })
  })

  it.each(["enabled", "disabled", "degraded"] as const)(
    "keeps archived terminal instead of silently reactivating it as %s",
    (toStatus) => {
      const decision = validateAgentLifecycleTransition({
        fromStatus: "archived",
        toStatus,
      })

      expect(decision).toMatchObject({
        allowed: false,
        reasonCode: "archived_agent_reactivation_forbidden",
      })
      expect(() => assertAgentLifecycleTransition({
        fromStatus: "archived",
        toStatus,
      })).toThrow(/archived ->/)
    },
  )

  it("blocks archived agent reactivation at the registry persistence boundary", () => {
    useTempState()
    const registry = createAgentRegistryService({ config: DEFAULT_CONFIG })
    registry.createOrUpdate(subAgentConfig())
    expect(registry.archive("agent:research")).toBe(true)

    expect(() => registry.createOrUpdate(subAgentConfig({
      status: "enabled",
      updatedAt: 2,
    }))).toThrow(/archived -> enabled/)
    expect(registry.get("agent:research")?.status).toBe("archived")
  })
})
