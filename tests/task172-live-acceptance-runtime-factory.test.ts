import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import { createLiveAcceptanceRuntimeFactory } from "../packages/core/src/api/live-acceptance-runtime-factory.ts"
import type { LiveAcceptanceExecutorFactoryInput } from "../packages/core/src/api/server-runtime-context.ts"
import type {
  ChannelSmokeRunnerOptions,
  PersistedChannelSmokeRunResult,
} from "../packages/core/src/channels/smoke-runner.ts"
import type { LiveAcceptanceLlmPorts } from "../packages/core/src/release/live-acceptance-llm-adapter.ts"
import type { LiveAcceptanceRuntimeSnapshotReaders } from "../packages/core/src/release/live-acceptance-runtime-snapshot-adapter.ts"
import type { ToolContext } from "../packages/core/src/tools/types.ts"

const NOW = Date.parse("2026-07-17T21:00:00.000Z")
const HASH = `sha256:${"a".repeat(64)}` as const

function channelRun(): PersistedChannelSmokeRunResult {
  const result = (channel: "webui" | "telegram" | "slack") => ({
    scenario: {
      id: `${channel}.basic_query`,
      channel,
      kind: "basic_query" as const,
      title: "Basic",
      request: "hidden",
      expectedTarget: channel,
      correlationKey:
        channel === "webui"
          ? ("webui_run_id" as const)
          : channel === "telegram"
            ? ("telegram_chat_thread" as const)
            : ("slack_thread" as const),
      requiresExternalCredential: channel !== "webui",
      releaseGate: "automated" as const,
    },
    status: "passed" as const,
    failures: [],
    auditLogId: `audit:${channel}:172`,
    trace: {
      sourceChannel: channel,
      responseChannel: channel,
      auditLogId: `audit:${channel}:172`,
      requestFlow: {
        requestGroupMatchesRunId: true,
        decisionTracePresent: true,
        topologyRunCreated: true,
        providerDirectUsed: false,
      },
    },
    finishedAt: NOW,
  })
  return {
    runId: "channel:172",
    mode: "live-run",
    status: "passed",
    startedAt: NOW,
    finishedAt: NOW,
    summary: "redacted",
    counts: { total: 3, passed: 3, failed: 0, skipped: 0 },
    results: [result("webui"), result("telegram"), result("slack")],
  }
}

function snapshotReaders(overrides: { owner?: string } = {}) {
  const readers: LiveAcceptanceRuntimeSnapshotReaders = {
    listBindings: vi.fn(() => [
      {
        binding_id: "binding:skill:172",
        agent_id: overrides.owner ?? "agent:release",
        capability_kind: "skill",
        catalog_id: "catalog:skill:172",
        status: "enabled",
        secret_scope_id: null,
        enabled_tool_names_json: '["skill.read"]',
        disabled_tool_names_json: "[]",
      } as never,
      {
        binding_id: "binding:mcp:172",
        agent_id: "agent:release",
        capability_kind: "mcp_server",
        catalog_id: "catalog:mcp:172",
        status: "enabled",
        secret_scope_id: "secret:mcp:172",
        enabled_tool_names_json: '["mcp.read"]',
        disabled_tool_names_json: "[]",
      } as never,
    ]),
    listSkillCatalogs: vi.fn(() => [
      {
        skill_id: "catalog:skill:172",
        status: "enabled",
        risk: "safe",
        tool_names_json: '["skill.read"]',
      } as never,
    ]),
    listMcpCatalogs: vi.fn(() => [
      {
        mcp_server_id: "catalog:mcp:172",
        status: "enabled",
        risk: "safe",
        tool_names_json: '["mcp.read"]',
      } as never,
    ]),
    listTools: vi.fn(() => [
      { name: "skill.read", riskLevel: "safe", requiresApproval: false },
      { name: "mcp.read", riskLevel: "safe", requiresApproval: false },
    ]),
    listYeonjangInstances: vi.fn(() => [
      {
        instanceId: "instance:office",
        displayName: "Office",
        state: "online",
        trustState: "trusted",
        scopeAccess: "allowed",
        runnableTarget: true,
        liveSessionCount: 1,
        duplicateLiveSessionDetected: false,
        session: {
          sessionId: "session:office:1",
          state: "online",
          lastSeenAt: NOW,
          endedAt: null,
          stale: false,
        },
      } as never,
    ]),
  }
  return readers
}

function executionInput(signal = new AbortController().signal) {
  return {
    candidate: { appVersion: "1.2.3", gitTag: "v1.2.3", gitCommit: "abc123" },
    approval: {
      decision: "approved" as const,
      authorizationStatus: "active" as const,
      authorizationId: "authorization:172",
      auditEventId: "audit:approval:172",
      principalType: "authenticated_user" as const,
      principalId: "operator:172",
      authenticationId: "authentication:172",
      roles: ["release_administrator"],
      approvedAt: NOW - 1_000,
      expiresAt: NOW + 60_000,
      redactionStatus: "verified" as const,
    },
    selection: {
      extensions: [
        {
          capability: "skill" as const,
          agentId: "agent:release",
          bindingId: "binding:skill:172",
          catalogId: "catalog:skill:172",
          toolName: "skill.read",
          readOnly: true as const,
          params: { probe: "skill" },
        },
        {
          capability: "mcp" as const,
          agentId: "agent:release",
          bindingId: "binding:mcp:172",
          catalogId: "catalog:mcp:172",
          toolName: "mcp.read",
          readOnly: true as const,
          params: { probe: "mcp" },
        },
      ],
      yeonjang: {
        instanceId: "instance:office",
        sessionId: "session:office:1",
        method: "system.info" as const,
        readOnly: true as const,
      },
    },
    requestedKeyId: `sha256:${"1".repeat(64)}`,
    signal,
  }
}

function harness(readers = snapshotReaders()) {
  const searchCandidate = {
    sourceUrl: "https://quote.example/current",
    sourceDomain: "quote.example",
    sourceTimestamp: new Date(NOW - 1_000).toISOString(),
    fetchTimestamp: new Date(NOW - 500).toISOString(),
  }
  const dispatch = vi.fn(async (toolName: string) => ({
    success: true,
    output: "private raw output",
    details:
      toolName === "web_search"
        ? { sourceEvidence: [searchCandidate] }
        : { sourceEvidence: searchCandidate },
  }))
  const dispatchAgentScoped = vi.fn(async (value: { toolName: string; ctx: ToolContext }) => ({
    success: true,
    output: `private ${value.toolName} output`,
  }))
  const audit = vi.fn(({ toolName }: { toolName: string }) => `audit:${toolName}:172`)
  const evidenceRef = (kind: string) => `tool-result:${kind}:${"e".repeat(64)}`
  const llm: LiveAcceptanceLlmPorts = {
    webPlan: async ({ candidates }) => ({
      diagnosedBy: "llm",
      status: "selected",
      contextFingerprint: HASH,
      selectedEvidenceRef: candidates[0]?.evidenceRef,
      selectedSourceUrl: candidates[0]?.sourceUrl,
      requestedTargetFingerprint: HASH,
    }),
    webDiagnosis: async ({ evidenceRef: ref, scenario }) => ({
      diagnosedBy: "llm",
      status: "complete",
      contextFingerprint: HASH,
      criterionKeys: ["existence", "accuracy", "freshness", "target_match"],
      conditionCount: scenario.completionConditions.length,
      evidenceRefs: [ref],
      targetBinding: {
        status: "verified",
        requestedTargetFingerprint: HASH,
        evidenceTargetFingerprint: HASH,
      },
    }),
    extensionDiagnosis: async ({ evidenceRef: ref }) => ({
      diagnosedBy: "llm",
      status: "complete",
      contextFingerprint: HASH,
      criterionKeys: ["existence", "accuracy", "target_match", "constraint_compliance"],
      evidenceRefs: [ref],
    }),
    yeonjangDiagnosis: async ({ evidenceRef: ref }) => ({
      diagnosedBy: "llm",
      status: "complete",
      contextFingerprint: HASH,
      criterionKeys: ["existence", "accuracy", "target_match", "constraint_compliance"],
      evidenceRefs: [ref],
    }),
  }
  const invokeYeonjang = vi.fn(async () => ({ ok: true, node: "office" }))
  const requestSink = { write: vi.fn(async () => ({ status: "written" as const })) }
  const runChannels = vi.fn(async () => channelRun())
  const baseContext = {
    artifactStorage: {} as ToolContext["artifactStorage"],
    sessionId: "session:172",
    runId: "run:172",
    workDir: "/workspace",
    userMessage: "live acceptance",
    source: "webui" as const,
    allowWebAccess: true,
    onProgress: () => undefined,
    signal: new AbortController().signal,
  }
  const factory = createLiveAcceptanceRuntimeFactory({
    readers,
    dispatcher: { dispatch, dispatchAgentScoped } as never,
    webContextFor: ({ runId, signal }) => ({ ...baseContext, runId, signal }),
    extensionBaseContextFor: ({ runId }) => ({
      artifactStorage: baseContext.artifactStorage,
      sessionId: baseContext.sessionId,
      workDir: baseContext.workDir,
      userMessage: baseContext.userMessage,
      source: baseContext.source,
      onProgress: baseContext.onProgress,
      auditId: `audit:${runId}`,
    }),
    findAuditEventId: audit,
    llm,
    invokeYeonjang,
    yeonjangTimeoutMs: 5_000,
    createCommandId: () => "command:172",
    createAuditCorrelationId: () => "audit-correlation:172",
    recordYeonjangAuditEvent: () => "audit:yeonjang:172",
    runChannels,
    requestSink,
    createRunId: ({ stage, scenarioId }) => `live:172:${stage}:${scenarioId ?? "all"}`,
    now: () => NOW,
    policy: {
      failurePolicy: "continue_diagnostics",
      maxPreflightAgeMs: 60_000,
      maxWebSourceAgeMs: 60_000,
      maxYeonjangSessionAgeMs: 60_000,
      maxEvidenceAgeMs: 60_000,
      maxYeonjangInstanceAgeMs: 60_000,
      webScenarios: [
        {
          id: "current-fact",
          title: "Current fact",
          request: "현재 값을 확인해줘",
          target: { rawQuery: "current fact" },
          freshnessPolicy: "strict_timestamp",
          minimumMethods: ["fast_text_search", "direct_fetch"],
          completionConditions: ["value, target, source and basis time are verified"],
        },
      ],
    },
  })
  return {
    factory,
    readers,
    dispatch,
    dispatchAgentScoped,
    audit,
    invokeYeonjang,
    requestSink,
    runChannels,
    evidenceRef,
  }
}

const channelExecutor: ChannelSmokeRunnerOptions["executeScenario"] = vi.fn(async () => ({
  sourceChannel: "webui",
}))

describe("Task 172 live acceptance runtime factory", () => {
  it("returns unavailable without a server-owned channel executor", () => {
    const value = harness()
    expect(value.factory(Object.freeze({}))).toBeUndefined()
    expect(value.runChannels).not.toHaveBeenCalled()
  })

  it("captures one snapshot and collects nine capability results through actual adapters", async () => {
    const value = harness()
    const executor = value.factory(
      Object.freeze({
        channelSmokeLiveExecutor: channelExecutor,
      }) satisfies LiveAcceptanceExecutorFactoryInput,
    )
    expect(executor).toBeTypeOf("function")
    const result = await executor?.(executionInput())

    expect(result?.status, JSON.stringify(result)).toBe("collected")
    for (const reader of Object.values(value.readers)) expect(reader).toHaveBeenCalledOnce()
    expect(value.runChannels).toHaveBeenCalledOnce()
    expect(value.dispatch).toHaveBeenCalledTimes(2)
    expect(value.dispatchAgentScoped).toHaveBeenCalledTimes(2)
    const skillContext = value.dispatchAgentScoped.mock.calls[0]?.[0].ctx
    const mcpContext = value.dispatchAgentScoped.mock.calls[1]?.[0].ctx
    expect(skillContext).toMatchObject({
      agentId: "agent:release",
      capabilityBindingId: "binding:skill:172",
      allowWebAccess: false,
      capabilityPolicy: {
        skillMcpAllowlist: {
          enabledSkillIds: ["catalog:skill:172"],
          enabledMcpServerIds: [],
          enabledToolNames: ["skill.read"],
        },
      },
    })
    expect(mcpContext).toMatchObject({
      agentId: "agent:release",
      capabilityBindingId: "binding:mcp:172",
      secretScopeId: "secret:mcp:172",
      capabilityPolicy: {
        skillMcpAllowlist: {
          enabledSkillIds: [],
          enabledMcpServerIds: ["catalog:mcp:172"],
          enabledToolNames: ["mcp.read"],
          secretScopeId: "secret:mcp:172",
        },
      },
    })
    expect(Object.isFrozen(mcpContext.capabilityPolicy)).toBe(true)
    expect(Object.isFrozen(mcpContext.capabilityPolicy.skillMcpAllowlist)).toBe(true)
    expect(value.invokeYeonjang).toHaveBeenCalledTimes(3)
    expect(value.invokeYeonjang.mock.calls.map(([method]) => method)).toEqual([
      "node.capabilities",
      "system.info",
      "camera.list",
    ])
    expect(value.requestSink.write).toHaveBeenCalledOnce()
    expect(value.requestSink.write.mock.calls[0]?.[0].payload.evidence).toHaveLength(9)
  })

  it("rejects a selection mismatch before all external execution", async () => {
    const value = harness(snapshotReaders({ owner: "agent:other" }))
    const executor = value.factory({ channelSmokeLiveExecutor: channelExecutor })
    const result = await executor?.(executionInput())

    expect(result).toMatchObject({
      status: "blocked",
      blockers: [{ reasonCode: "live_preflight_binding_owner_mismatch" }],
    })
    expect(value.runChannels).not.toHaveBeenCalled()
    expect(value.dispatch).not.toHaveBeenCalled()
    expect(value.dispatchAgentScoped).not.toHaveBeenCalled()
    expect(value.invokeYeonjang).not.toHaveBeenCalled()
    expect(value.requestSink.write).not.toHaveBeenCalled()
  })

  it("keeps global runtime and environment lookup outside the factory", () => {
    const source = readFileSync("packages/core/src/api/live-acceptance-runtime-factory.ts", "utf8")
    expect(source).not.toMatch(
      /process\.env|getToolDispatcher\(|getProvider\(|getDb\(|listAgentCapabilityBindings\(|invokeYeonjangMethod\(/u,
    )
  })
})
