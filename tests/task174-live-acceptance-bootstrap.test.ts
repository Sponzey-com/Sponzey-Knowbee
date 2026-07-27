import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  type LiveAcceptanceBootstrapPorts,
  createLiveAcceptanceBootstrapDependencies,
  resolveConfiguredTelegramLiveSmokeTarget,
} from "../packages/core/src/api/live-acceptance-bootstrap.ts"
import type { ChannelSmokeRunnerOptions } from "../packages/core/src/channels/smoke-runner.ts"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { closeDb, getDb, insertAuditLog } from "../packages/core/src/db/index.ts"
import type { ToolContext } from "../packages/core/src/tools/types.ts"

const NOW = Date.parse("2026-07-17T22:00:00.000Z")
const roots: string[] = []

afterEach(() => {
  closeDb()
  while (roots.length > 0) rmSync(roots.pop() ?? "", { recursive: true, force: true })
})

function ports(): LiveAcceptanceBootstrapPorts {
  return {
    readers: {
      listBindings: vi.fn(() => []),
      listSkillCatalogs: vi.fn(() => []),
      listMcpCatalogs: vi.fn(() => []),
      listTools: vi.fn(() => []),
      listYeonjangInstances: vi.fn(() => []),
    },
    llm: {
      webPlan: vi.fn(),
      webDiagnosis: vi.fn(),
      extensionDiagnosis: vi.fn(),
      yeonjangDiagnosis: vi.fn(),
    },
    artifactStorage: {} as ToolContext["artifactStorage"],
    findAuditEventId: vi.fn(() => null),
    invokeYeonjang: vi.fn(),
    recordYeonjangAuditEvent: vi.fn(() => null),
    runChannels: vi.fn(),
    requestSink: { write: vi.fn() },
    now: vi.fn(() => NOW),
    createId: vi.fn(() => "id:174"),
  }
}

describe("Task 174 live acceptance bootstrap binding", () => {
  it("derives only an unambiguous configured Telegram private-chat target", () => {
    const config = structuredClone(DEFAULT_CONFIG)
    config.telegram = {
      enabled: true,
      botToken: "test-token",
      allowedUserIds: [174],
      allowedGroupIds: [],
    }

    expect(resolveConfiguredTelegramLiveSmokeTarget(config)).toEqual({ chatId: 174, userId: 174 })

    config.telegram.allowedUserIds.push(175)
    expect(resolveConfiguredTelegramLiveSmokeTarget(config)).toBeUndefined()
    config.telegram.allowedUserIds = [174]
    config.telegram.allowedGroupIds = [-100174]
    expect(resolveConfiguredTelegramLiveSmokeTarget(config)).toBeUndefined()
  })

  it("creates one server dependency factory from explicit immutable inputs", () => {
    const value = createLiveAcceptanceBootstrapDependencies({
      config: DEFAULT_CONFIG,
      dispatcher: { dispatch: vi.fn(), dispatchAgentScoped: vi.fn() } as never,
      ports: ports(),
    })

    expect(value.liveAcceptanceExecutorFactory).toBeTypeOf("function")
    expect(value.liveAcceptanceSelectionAvailabilityInspector).toBeTypeOf("function")
    expect(value.liveAcceptanceSelectionAvailabilityInspector?.()).toEqual([
      {
        capability: "skill",
        status: "unavailable",
        reasonCode: "live_acceptance_skill_selection_unavailable",
      },
      {
        capability: "mcp",
        status: "unavailable",
        reasonCode: "live_acceptance_mcp_selection_unavailable",
      },
      {
        capability: "yeonjang",
        status: "unavailable",
        reasonCode: "live_acceptance_yeonjang_selection_unavailable",
      },
    ])
    expect(value.liveAcceptanceExecutorFactory?.({})).toBeUndefined()
    const channelExecutor: ChannelSmokeRunnerOptions["executeScenario"] = vi.fn()
    expect(
      value.liveAcceptanceExecutorFactory?.({ channelSmokeLiveExecutor: channelExecutor }),
    ).toBeTypeOf("function")
  })

  it("keeps environment and service locators outside the bootstrap builder", () => {
    const source = readFileSync("packages/core/src/api/live-acceptance-bootstrap.ts", "utf8")
    expect(source).not.toMatch(/process\.env|getToolDispatcher\(|loadConfig/u)
    expect(source).toContain("createFileBackedLiveAcceptanceLlmPorts")
    expect(source).toContain("createLiveAcceptanceSigningRequestFileSink")
    expect(source).toContain("listYeonjangRegistryInstances")
    expect(source.match(/getProvider\(/gu)).toHaveLength(1)
    expect(source.match(/getDefaultModel\(/gu)).toHaveLength(1)
  })

  it("binds the factory only from the startup process snapshot", () => {
    const source = readFileSync("packages/core/src/runtime/bootstrap.ts", "utf8")
    expect(source).toContain("createDefaultLiveAcceptanceBootstrapDependencies")
    expect(source).toMatch(/processContext\.env\.KNOWBEE_LIVE_ACCEPTANCE\s*===\s*["']1["']/u)
    expect(source).toMatch(/createApiServerRuntimeContext\(processContext,\s*apiDependencies\)/u)
  })

  it("returns the generated Audit ID for exact downstream evidence binding", () => {
    const root = mkdtempSync(join(tmpdir(), "knowbee-task174-"))
    roots.push(root)
    const paths = createRuntimePaths(
      { KNOWBEE_STATE_DIR: root },
      { homeDir: root, exists: () => false },
    )
    getDb({ paths })

    const id = insertAuditLog({
      timestamp: NOW,
      session_id: null,
      run_id: "run:174",
      request_group_id: "run:174",
      source: "system",
      tool_name: "live_acceptance_yeonjang",
      params: null,
      output: null,
      result: "success",
      duration_ms: null,
      approval_required: 0,
      approved_by: null,
    })

    expect(id).toMatch(/^[0-9a-f-]{36}$/u)
  })
})
