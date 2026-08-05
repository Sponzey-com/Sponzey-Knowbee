import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import type { CapabilityPolicy } from "../packages/core/src/contracts/sub-agent-orchestration.ts"
import {
  closeDb,
  listAuditLogsForRun,
  upsertAgentCapabilityBinding,
} from "../packages/core/src/db/index.js"
import { produceExtensionLiveAcceptanceEvidence } from "../packages/core/src/release/extension-live-acceptance-evidence.ts"
import {
  ExtensionLiveSmokeRunnerError,
  type ExtensionLiveSmokeSelection,
  runExtensionLiveSmokeScenarios,
} from "../packages/core/src/runs/extension-live-smoke-runner.ts"
import { createExtensionLiveToolDispatchAdapter } from "../packages/core/src/runs/extension-live-tool-dispatch-adapter.ts"
import { ToolDispatcher } from "../packages/core/src/tools/dispatcher.ts"
import type { ToolContext } from "../packages/core/src/tools/types.ts"
import { createTestAgentRuntimeDependencies } from "./fixtures/agent-runtime.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const NOW = Date.parse("2026-07-17T15:00:00.000Z")
const RUN_ID = "extension-run:162"
const tempDirs: string[] = []

function selection(capability: "skill" | "mcp"): ExtensionLiveSmokeSelection {
  const catalogId = capability === "skill" ? "skill:task162" : "task162"
  return {
    scenario: {
      id: `${capability}-read-only-call`,
      capability,
      expectedAgentId: "agent:task162",
      expectedBindingId: `binding:agent:task162:${capability}`,
      expectedCatalogId: catalogId,
      expectedToolName: capability === "skill" ? "task162_skill_read" : "mcp__task162__read",
      readOnly: true,
    },
    params: Object.freeze({ probe: "health" }),
    authorization: Object.freeze({
      snapshotCapturedAt: NOW,
      capability,
      agentId: "agent:task162",
      bindingId: `binding:agent:task162:${capability}`,
      catalogId,
      toolName: capability === "skill" ? "task162_skill_read" : "mcp__task162__read",
      ...(capability === "mcp" ? { secretScopeId: "secret:task162:mcp" } : {}),
    }),
  }
}

function validDiagnosis(evidenceRef: string) {
  return {
    diagnosedBy: "llm" as const,
    status: "complete" as const,
    contextFingerprint: `sha256:${"a".repeat(64)}` as const,
    criterionKeys: ["existence", "accuracy", "target_match", "constraint_compliance"],
    evidenceRefs: [evidenceRef],
  }
}

function observed(capability: "skill" | "mcp") {
  const current = selection(capability).scenario
  const evidenceRef = `tool-result:${capability}:${capability === "skill" ? "b" : "c"}${"0".repeat(63)}`
  return {
    toolExecution: {
      runId: RUN_ID,
      requestGroupId: RUN_ID,
      capability,
      agentId: current.expectedAgentId,
      bindingId: current.expectedBindingId,
      catalogId: current.expectedCatalogId,
      toolName: current.expectedToolName,
      status: "succeeded" as const,
      executionObserved: true,
      evidenceRef,
    },
    auditEventId: `audit:${capability}:162`,
    diagnosisPayload: Object.freeze({ success: true, output: "internal-only" }),
  }
}

describe("Task 162 extension live smoke runner", () => {
  it("keeps environment, storage and dispatcher access behind injected ports", () => {
    const source = readFileSync(
      join(process.cwd(), "packages/core/src/runs/extension-live-smoke-runner.ts"),
      "utf8",
    )

    expect(source).not.toContain("process.env")
    expect(source).not.toMatch(/from ["'][^"']*(?:db|dispatcher|mcp)[^"']*["']/u)
    expect(source).not.toContain("getToolDispatcher")
  })

  it("verifies exact Skill and MCP executions only after LLM diagnosis", async () => {
    const execute = vi.fn(
      async ({ selection: current }: { selection: ExtensionLiveSmokeSelection }) =>
        observed(current.scenario.capability),
    )
    const diagnose = vi.fn(async ({ evidenceRef }: { evidenceRef: string }) =>
      validDiagnosis(evidenceRef),
    )

    const result = await runExtensionLiveSmokeScenarios({
      runId: RUN_ID,
      selections: [selection("skill"), selection("mcp")],
      execute,
      diagnose,
      now: (() => {
        let current = NOW
        return () => current++
      })(),
      signal: new AbortController().signal,
    })

    expect(result.status).toBe("passed")
    expect(
      result.results.map((item) => [item.scenario.capability, item.state, item.status]),
    ).toEqual([
      ["skill", "verified", "passed"],
      ["mcp", "verified", "passed"],
    ])
    expect(execute).toHaveBeenCalledTimes(2)
    expect(diagnose).toHaveBeenCalledTimes(2)
    expect(produceExtensionLiveAcceptanceEvidence(result).accepted).toHaveLength(2)
    expect(JSON.stringify(result)).not.toContain("internal-only")
  })

  it.each([
    [[selection("skill")], "extension_smoke_scenario_set_invalid"],
    [[selection("skill"), selection("skill")], "extension_smoke_scenario_set_invalid"],
    [
      [
        { ...selection("skill"), scenario: { ...selection("skill").scenario, readOnly: false } },
        selection("mcp"),
      ],
      "extension_smoke_read_only_required",
    ],
  ])("rejects an unsafe scenario set before dispatch", async (selections, code) => {
    const execute = vi.fn()
    await expect(
      runExtensionLiveSmokeScenarios({
        runId: RUN_ID,
        selections,
        execute,
        diagnose: vi.fn(),
        now: () => NOW,
        signal: new AbortController().signal,
      }),
    ).rejects.toEqual(expect.objectContaining({ code }))
    expect(execute).not.toHaveBeenCalled()
  })

  it("rejects tool success without an audit row or matching LLM evidence", async () => {
    const execute = vi.fn(
      async ({ selection: current }: { selection: ExtensionLiveSmokeSelection }) => ({
        ...observed(current.scenario.capability),
        auditEventId: null,
      }),
    )
    const diagnose = vi.fn(async () => validDiagnosis(`tool-result:wrong:${"d".repeat(64)}`))

    const result = await runExtensionLiveSmokeScenarios({
      runId: RUN_ID,
      selections: [selection("skill"), selection("mcp")],
      execute,
      diagnose,
      now: () => NOW,
      signal: new AbortController().signal,
    })

    expect(result.status).toBe("failed")
    expect(result.results.every((item) => item.state === "rejected")).toBe(true)
    expect(
      result.results.every((item) => item.reasonCode === "extension_smoke_audit_missing"),
    ).toBe(true)
  })

  it("rejects a diagnosis that is not explicitly produced by an LLM", async () => {
    const result = await runExtensionLiveSmokeScenarios({
      runId: RUN_ID,
      selections: [selection("skill"), selection("mcp")],
      execute: async ({ selection: current }) => observed(current.scenario.capability),
      diagnose: async ({ evidenceRef }) => ({
        ...validDiagnosis(evidenceRef),
        diagnosedBy: "rule",
      }),
      now: () => NOW,
      signal: new AbortController().signal,
    })

    expect(result.status).toBe("failed")
    expect(result.results.every((item) => item.state === "rejected")).toBe(true)
    expect(
      result.results.every((item) => item.reasonCode === "extension_smoke_llm_diagnosis_invalid"),
    ).toBe(true)
  })

  it("stops before dispatch when cancellation is already signalled", async () => {
    const controller = new AbortController()
    controller.abort()
    const execute = vi.fn()

    await expect(
      runExtensionLiveSmokeScenarios({
        runId: RUN_ID,
        selections: [selection("skill"), selection("mcp")],
        execute,
        diagnose: vi.fn(),
        now: () => NOW,
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(ExtensionLiveSmokeRunnerError)
    expect(execute).not.toHaveBeenCalled()
  })
})

describe("Task 162 ToolDispatcher integration", () => {
  let stateDir: string

  beforeEach(() => {
    closeDb()
    stateDir = mkdtempSync(join(tmpdir(), "knowbee-task162-extension-"))
    tempDirs.push(stateDir)
    initializeTestDbRuntime(stateDir)
  })

  afterEach(() => {
    closeDb()
    while (tempDirs.length > 0) {
      const path = tempDirs.pop()
      if (path) rmSync(path, { recursive: true, force: true })
    }
  })

  it("uses owning bindings, actual dispatcher execution and persisted audit rows", async () => {
    for (const current of [selection("skill"), selection("mcp")]) {
      upsertAgentCapabilityBinding({
        bindingId: current.scenario.expectedBindingId,
        agentId: current.scenario.expectedAgentId,
        capabilityKind: current.scenario.capability === "skill" ? "skill" : "mcp_server",
        catalogId: current.scenario.expectedCatalogId,
        status: "enabled",
        ...(current.scenario.capability === "mcp" ? { secretScopeId: "secret:task162" } : {}),
        enabledToolNames: [current.scenario.expectedToolName],
      })
    }

    const dispatcher = new ToolDispatcher({
      config: {
        ...DEFAULT_CONFIG,
        security: { ...DEFAULT_CONFIG.security, approvalMode: "off" },
      },
    })
    for (const current of [selection("skill"), selection("mcp")]) {
      dispatcher.register({
        name: current.scenario.expectedToolName,
        description: "read-only live smoke probe",
        parameters: { type: "object", properties: { probe: { type: "string" } } },
        riskLevel: "safe",
        requiresApproval: false,
        async execute() {
          return { success: true, output: `${current.scenario.capability}:internal-result` }
        },
      })
    }
    const capabilityPolicy: CapabilityPolicy = {
      permissionProfile: {
        profileId: "profile:task162",
        riskCeiling: "moderate",
        approvalRequiredFrom: "sensitive",
        allowExternalNetwork: true,
        allowFilesystemWrite: false,
        allowShellExecution: false,
        allowScreenControl: false,
        allowedPaths: [],
      },
      skillMcpAllowlist: {
        enabledSkillIds: ["skill:task162"],
        enabledMcpServerIds: ["task162"],
        enabledToolNames: ["task162_skill_read", "mcp__task162__read", "read"],
        disabledToolNames: [],
        secretScopeId: "secret:task162",
      },
      rateLimit: { maxConcurrentCalls: 2, maxCallsPerMinute: 10 },
    }
    const runtime = createTestAgentRuntimeDependencies(stateDir)
    const adapter = createExtensionLiveToolDispatchAdapter({
      dispatcher,
      contextFor({ selection: current, runId, signal }) {
        const context: ToolContext & {
          agentId: string
          capabilityPolicy: CapabilityPolicy
          auditId: string
        } = {
          artifactStorage: runtime.artifactStorage,
          sessionId: "session:task162",
          runId,
          requestGroupId: runId,
          workDir: stateDir,
          userMessage: "read-only extension live smoke",
          source: "webui",
          allowWebAccess: false,
          onProgress: () => undefined,
          signal,
          agentId: current.scenario.expectedAgentId,
          agentType: "knowbee",
          capabilityPolicy,
          auditId: `audit-correlation:${current.scenario.capability}`,
          secretScopeId: "secret:task162",
        }
        return context
      },
      findAuditEventId({ runId, toolName }) {
        return listAuditLogsForRun(runId).findLast((row) => row.tool_name === toolName)?.id ?? null
      },
    })

    const result = await runExtensionLiveSmokeScenarios({
      runId: RUN_ID,
      selections: [selection("skill"), selection("mcp")],
      execute: adapter,
      diagnose: async ({ evidenceRef }) => validDiagnosis(evidenceRef),
      now: () => NOW,
      signal: new AbortController().signal,
    })

    expect(result.status).toBe("passed")
    expect(listAuditLogsForRun(RUN_ID).map((row) => row.tool_name)).toEqual([
      "task162_skill_read",
      "mcp__task162__read",
    ])
    expect(result.results.every((item) => item.trace?.toolExecution?.executionObserved)).toBe(true)
    expect(JSON.stringify(result)).not.toContain("internal-result")
    expect(produceExtensionLiveAcceptanceEvidence(result).rejected).toEqual([])
  })

  it("rejects a capability binding owned by another agent", async () => {
    const current = selection("skill")
    upsertAgentCapabilityBinding({
      bindingId: current.scenario.expectedBindingId,
      agentId: "agent:other",
      capabilityKind: "skill",
      catalogId: current.scenario.expectedCatalogId,
      status: "enabled",
      enabledToolNames: [current.scenario.expectedToolName],
    })
    const dispatcher = new ToolDispatcher({
      config: {
        ...DEFAULT_CONFIG,
        security: { ...DEFAULT_CONFIG.security, approvalMode: "off" },
      },
    })
    dispatcher.register({
      name: current.scenario.expectedToolName,
      description: "read-only live smoke probe",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      async execute() {
        return { success: true, output: "must-not-execute" }
      },
    })
    const runtime = createTestAgentRuntimeDependencies(stateDir)
    const capabilityPolicy: CapabilityPolicy = {
      permissionProfile: {
        profileId: "profile:task162",
        riskCeiling: "safe",
        approvalRequiredFrom: "sensitive",
        allowExternalNetwork: false,
        allowFilesystemWrite: false,
        allowShellExecution: false,
        allowScreenControl: false,
        allowedPaths: [],
      },
      skillMcpAllowlist: {
        enabledSkillIds: [current.scenario.expectedCatalogId],
        enabledMcpServerIds: [],
        enabledToolNames: [current.scenario.expectedToolName],
        disabledToolNames: [],
      },
      rateLimit: { maxConcurrentCalls: 1, maxCallsPerMinute: 2 },
    }
    const adapter = createExtensionLiveToolDispatchAdapter({
      dispatcher,
      contextFor({ runId, signal }) {
        return {
          artifactStorage: runtime.artifactStorage,
          sessionId: "session:task162:owner-mismatch",
          runId,
          requestGroupId: runId,
          workDir: stateDir,
          userMessage: "read-only extension owner isolation smoke",
          source: "webui",
          allowWebAccess: false,
          onProgress: () => undefined,
          signal,
          agentId: current.scenario.expectedAgentId,
          agentType: "knowbee",
          capabilityPolicy,
          auditId: "audit-correlation:owner-mismatch",
        }
      },
      findAuditEventId({ runId, toolName }) {
        return listAuditLogsForRun(runId).findLast((row) => row.tool_name === toolName)?.id ?? null
      },
    })

    const execution = await adapter({
      runId: RUN_ID,
      selection: current,
      signal: new AbortController().signal,
    })

    expect(execution.toolExecution.status).toBe("failed")
    expect(execution.toolExecution.executionObserved).toBe(false)
    expect(execution.diagnosisPayload).toEqual(
      expect.objectContaining({ success: false, error: "capability_binding_owner_mismatch" }),
    )
    expect(JSON.stringify(execution)).not.toContain("must-not-execute")
  })
})
