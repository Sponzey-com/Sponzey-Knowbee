import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  closeDb,
  upsertAgentConfig,
  upsertMcpServerCatalogEntry,
} from "../packages/core/src/db/index.js"
import {
  CONTRACT_SCHEMA_VERSION,
  type MemoryPolicy,
  type ModelProfile,
  type PermissionProfile,
  type RuntimeIdentity,
  type SubAgentConfig,
} from "../packages/core/src/index.ts"
import { resolveAgentCapabilityModelSummary } from "../packages/core/src/orchestration/capability-model.js"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []
const now = Date.UTC(2026, 6, 6, 0, 0, 0)

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task0467-capability-wording-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
}

function owner(ownerId = "agent:alpha"): RuntimeIdentity["owner"] {
  return { ownerType: "sub_agent", ownerId }
}

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

function memoryPolicy(agentId: string): MemoryPolicy {
  return {
    owner: owner(agentId),
    visibility: "private",
    readScopes: [owner(agentId)],
    writeScope: owner(agentId),
    retentionPolicy: "short_term",
    writebackReviewRequired: true,
  }
}

const modelProfile: ModelProfile = {
  providerId: "openai",
  modelId: "gpt-5.4",
  timeoutMs: 30_000,
  retryCount: 2,
  costBudget: 5,
}

function subAgentConfig(agentId: string): SubAgentConfig {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    agentType: "sub_agent",
    agentId,
    displayName: "Alpha",
    nickname: "Alpha",
    status: "enabled",
    role: "Research worker",
    personality: "Precise and concise",
    specialtyTags: ["research"],
    avoidTasks: [],
    modelProfile,
    memoryPolicy: memoryPolicy(agentId),
    capabilityPolicy: {
      permissionProfile,
      skillMcpAllowlist: {
        enabledSkillIds: [],
        enabledMcpServerIds: ["mcp:browser", "mcp:files"],
        enabledToolNames: [],
        disabledToolNames: [],
      },
      rateLimit: { maxConcurrentCalls: 1 },
    },
    delegationPolicy: {
      enabled: true,
      maxParallelSessions: 1,
    },
    teamIds: [],
    delegation: {
      enabled: true,
      maxParallelSessions: 1,
    },
    profileVersion: 1,
    createdAt: now,
    updatedAt: now,
  }
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

describe("task0467 capability model external feature wording", () => {
  it("uses external feature connection wording for catalog and secret scope diagnostics", () => {
    upsertMcpServerCatalogEntry(
      {
        mcpServerId: "mcp:browser",
        displayName: "Browser",
        status: "disabled",
        risk: "external",
        toolNames: ["mcp__browser__search"],
      },
      { now },
    )
    upsertMcpServerCatalogEntry(
      {
        mcpServerId: "mcp:files",
        displayName: "Files",
        status: "enabled",
        risk: "external",
        toolNames: ["mcp__files__read"],
      },
      { now },
    )
    const agent = subAgentConfig("agent:alpha")
    upsertAgentConfig(agent, { source: "manual", now })

    const summary = resolveAgentCapabilityModelSummary(agent)
    const messages = summary.capabilitySummary.diagnostics.map((item) => item.message)

    expect(messages).toEqual(
      expect.arrayContaining([
        "External feature connection catalog item mcp:browser is disabled or archived.",
        "External feature connection mcp:browser has no configured secret scope.",
        "External feature connection mcp:files has no configured secret scope.",
      ]),
    )
    expect(messages.join("\n")).not.toContain("MCP server")
  })

  it("does not keep old MCP server diagnostic wording in capability model sources", () => {
    const sourceFiles = [
      "packages/core/src/orchestration/capability-model.ts",
      "packages/core/src/orchestration/capability-model.js",
    ]
    const combined = sourceFiles
      .map((filePath) => readFileSync(join(process.cwd(), filePath), "utf8"))
      .join("\n")

    expect(combined).not.toContain("MCP server catalog item")
    expect(combined).not.toContain("MCP server ${catalogId")
    expect(combined).toContain("External feature connection catalog item")
    expect(combined).toContain("External feature connection ${catalogId")
  })
})
