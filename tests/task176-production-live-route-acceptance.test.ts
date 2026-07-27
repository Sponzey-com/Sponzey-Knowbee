import { mkdtempSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  type LiveAcceptanceBootstrapPorts,
  createLiveAcceptanceBootstrapDependencies,
} from "../packages/core/src/api/live-acceptance-bootstrap.ts"
import {
  type LiveAcceptanceRouteExecutor,
  registerLiveAcceptanceRoute,
} from "../packages/core/src/api/routes/live-acceptance.ts"
import { installApiRuntimeConfig } from "../packages/core/src/api/runtime-context.ts"
import {
  createApiServerRuntimeContext,
  resolveApiLiveAcceptanceExecutor,
} from "../packages/core/src/api/server-runtime-context.ts"
import type {
  ChannelSmokeRunnerOptions,
  PersistedChannelSmokeRunResult,
} from "../packages/core/src/channels/smoke-runner.ts"
import { createRuntimePaths } from "../packages/core/src/config/paths.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { createStartupProcessContext } from "../packages/core/src/runtime/startup-process-context.ts"
import type { ToolContext } from "../packages/core/src/tools/types.ts"

const require = createRequire(import.meta.url)
const Fastify = require("../packages/core/node_modules/fastify") as (options: {
  logger: boolean
}) => {
  ready(): Promise<void>
  close(): Promise<void>
  inject(options: {
    method: string
    url: string
    payload?: unknown
    headers?: Record<string, string>
  }): Promise<{ statusCode: number; json(): unknown }>
}

const NOW = Date.parse("2026-07-17T23:00:00.000Z")
const TOKEN = "task176-token"
const HASH = `sha256:${"a".repeat(64)}` as const
const roots: string[] = []

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop() ?? "", { recursive: true, force: true })
})

function requestFixture() {
  return {
    kind: "knowbee.release.live_acceptance_execution_request",
    schemaVersion: 2,
    candidate: { appVersion: "0.2.16", gitTag: "v0.2.16", gitCommit: "abc123" },
    authorization: {
      authorizationId: "authorization:176",
      auditEventId: "audit:authorization:176",
      approvedAt: NOW - 1_000,
      expiresAt: NOW + 60_000,
    },
    selection: {
      extensions: [
        {
          capability: "skill",
          agentId: "agent:release",
          bindingId: "binding:skill:176",
          catalogId: "catalog:skill:176",
          toolName: "skill.read",
          readOnly: true,
          params: {},
        },
        {
          capability: "mcp",
          agentId: "agent:release",
          bindingId: "binding:mcp:176",
          catalogId: "catalog:mcp:176",
          toolName: "mcp.read",
          readOnly: true,
          params: {},
        },
      ],
      yeonjang: {
        instanceId: "instance:office",
        sessionId: "session:office:1",
        method: "system.info",
        readOnly: true,
      },
    },
    requestedKeyId: `sha256:${"1".repeat(64)}`,
  }
}

async function routeApp(execute: LiveAcceptanceRouteExecutor) {
  const root = mkdtempSync(join(tmpdir(), "knowbee-task176-"))
  roots.push(root)
  const app = Fastify({ logger: false })
  const config = structuredClone(DEFAULT_CONFIG)
  config.webui.auth = { enabled: true, token: TOKEN }
  installApiRuntimeConfig(
    app as never,
    config,
    createRuntimePaths({ KNOWBEE_STATE_DIR: root }, { homeDir: root, exists: () => false }),
  )
  registerLiveAcceptanceRoute(app as never, { enabled: true, execute, now: () => NOW })
  await app.ready()
  return app
}

function channelRun(): PersistedChannelSmokeRunResult {
  const result = (channel: "webui" | "telegram" | "slack") => ({
    scenario: {
      id: `${channel}.basic_query`,
      channel,
      kind: "basic_query" as const,
      title: "Basic",
      request: "private request",
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
    auditLogId: `audit:${channel}:176`,
    trace: {
      sourceChannel: channel,
      responseChannel: channel,
      auditLogId: `audit:${channel}:176`,
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
    runId: "channel:176",
    mode: "live-run",
    status: "passed",
    startedAt: NOW,
    finishedAt: NOW,
    summary: "redacted",
    counts: { total: 3, passed: 3, failed: 0, skipped: 0 },
    results: [result("webui"), result("telegram"), result("slack")],
  }
}

function productionHarness() {
  const sourceEvidence = {
    sourceUrl: "https://quote.example/current",
    sourceDomain: "quote.example",
    sourceTimestamp: new Date(NOW - 1_000).toISOString(),
    fetchTimestamp: new Date(NOW - 500).toISOString(),
  }
  const dispatch = vi.fn(async (toolName: string) => ({
    success: true,
    output: "private raw web output",
    details: toolName === "web_search" ? { sourceEvidence: [sourceEvidence] } : { sourceEvidence },
  }))
  const dispatchAgentScoped = vi.fn(async (value: { toolName: string }) => ({
    success: true,
    output: `private ${value.toolName} output`,
  }))
  const requestSink = { write: vi.fn(async () => ({ status: "written" as const })) }
  const invokeYeonjang = vi.fn(async () => ({ ok: true, node: "office" }))
  const runChannels = vi.fn(async () => channelRun())
  let id = 0
  const ports: LiveAcceptanceBootstrapPorts = {
    readers: {
      listBindings: vi.fn(() => [
        {
          binding_id: "binding:skill:176",
          agent_id: "agent:release",
          capability_kind: "skill",
          catalog_id: "catalog:skill:176",
          status: "enabled",
          secret_scope_id: null,
          enabled_tool_names_json: '["skill.read"]',
          disabled_tool_names_json: "[]",
        } as never,
        {
          binding_id: "binding:mcp:176",
          agent_id: "agent:release",
          capability_kind: "mcp_server",
          catalog_id: "catalog:mcp:176",
          status: "enabled",
          secret_scope_id: "secret:mcp:176",
          enabled_tool_names_json: '["mcp.read"]',
          disabled_tool_names_json: "[]",
        } as never,
      ]),
      listSkillCatalogs: vi.fn(() => [
        {
          skill_id: "catalog:skill:176",
          status: "enabled",
          risk: "safe",
          tool_names_json: '["skill.read"]',
        } as never,
      ]),
      listMcpCatalogs: vi.fn(() => [
        {
          mcp_server_id: "catalog:mcp:176",
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
    },
    llm: {
      webPlan: async ({ candidates }) => ({
        diagnosedBy: "llm",
        status: "selected",
        contextFingerprint: HASH,
        selectedEvidenceRef: candidates[0]?.evidenceRef,
        selectedSourceUrl: candidates[0]?.sourceUrl,
        requestedTargetFingerprint: HASH,
      }),
      webDiagnosis: async ({ evidenceRef, scenario }) => ({
        diagnosedBy: "llm",
        status: "complete",
        contextFingerprint: HASH,
        criterionKeys: ["existence", "accuracy", "freshness", "target_match"],
        conditionCount: scenario.completionConditions.length,
        evidenceRefs: [evidenceRef],
        targetBinding: {
          status: "verified",
          requestedTargetFingerprint: HASH,
          evidenceTargetFingerprint: HASH,
        },
      }),
      extensionDiagnosis: async ({ evidenceRef }) => ({
        diagnosedBy: "llm",
        status: "complete",
        contextFingerprint: HASH,
        criterionKeys: ["existence", "accuracy", "target_match", "constraint_compliance"],
        evidenceRefs: [evidenceRef],
      }),
      yeonjangDiagnosis: async ({ evidenceRef }) => ({
        diagnosedBy: "llm",
        status: "complete",
        contextFingerprint: HASH,
        criterionKeys: ["existence", "accuracy", "target_match", "constraint_compliance"],
        evidenceRefs: [evidenceRef],
      }),
    },
    artifactStorage: {} as ToolContext["artifactStorage"],
    findAuditEventId: vi.fn(({ toolName }) => `audit:${toolName}:176`),
    invokeYeonjang,
    recordYeonjangAuditEvent: vi.fn(() => "audit:yeonjang:176"),
    runChannels,
    requestSink,
    now: () => NOW,
    createId: () => `id:${++id}`,
  }
  const dependencies = createLiveAcceptanceBootstrapDependencies({
    config: DEFAULT_CONFIG,
    dispatcher: { dispatch, dispatchAgentScoped } as never,
    ports,
  })
  const channelExecutor: ChannelSmokeRunnerOptions["executeScenario"] = vi.fn(async () => ({
    sourceChannel: "webui",
  }))
  const runtime = createApiServerRuntimeContext(
    createStartupProcessContext({
      env: { KNOWBEE_LIVE_ACCEPTANCE: "1", KNOWBEE_CHANNEL_SMOKE_LIVE: "1" },
      argv: ["node", "knowbee"],
      cwd: "/workspace",
    }),
    { ...dependencies, channelSmokeLiveExecutor: channelExecutor },
  )
  return {
    runtime,
    resolution: resolveApiLiveAcceptanceExecutor({
      runtime,
      channelSmokeLiveExecutor: runtime.channelSmokeLiveExecutor,
    }),
    dispatch,
    dispatchAgentScoped,
    invokeYeonjang,
    runChannels,
    requestSink,
  }
}

describe("Task 176 production-like live route acceptance", () => {
  it("runs bootstrap, startup context, executor resolution and the HTTP route as one path", async () => {
    const harness = productionHarness()
    expect(harness.resolution.status).toBe("ready")
    if (harness.resolution.status !== "ready") throw new Error(harness.resolution.reasonCode)
    const app = await routeApp(harness.resolution.executor)
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/live-acceptance/runs",
        payload: requestFixture(),
        headers: { authorization: `Bearer ${TOKEN}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json(), JSON.stringify(response.json())).toMatchObject({
        status: "collected",
        evidenceCount: 9,
      })
      expect(harness.runChannels).toHaveBeenCalledOnce()
      expect(harness.dispatch).toHaveBeenCalledTimes(8)
      expect(harness.dispatchAgentScoped).toHaveBeenCalledTimes(2)
      expect(harness.invokeYeonjang).toHaveBeenCalledTimes(3)
      expect(harness.requestSink.write).toHaveBeenCalledOnce()
      expect(harness.requestSink.write.mock.calls[0]?.[0].payload.evidence).toHaveLength(9)
      expect(JSON.stringify(response.json())).not.toMatch(
        /private|secret:mcp:176|authorization:176|audit:/u,
      )
    } finally {
      await app.close()
    }
  })

  it("fails closed before outbound calls when the channel executor is unavailable", () => {
    const harness = productionHarness()
    const resolution = resolveApiLiveAcceptanceExecutor({
      runtime: {
        liveAcceptanceExecutorFactory: harness.runtime.liveAcceptanceExecutorFactory,
      },
    })

    expect(resolution).toEqual({
      status: "unavailable",
      reasonCode: "live_acceptance_executor_factory_unavailable",
    })
    expect(harness.runChannels).not.toHaveBeenCalled()
    expect(harness.dispatch).not.toHaveBeenCalled()
    expect(harness.dispatchAgentScoped).not.toHaveBeenCalled()
    expect(harness.invokeYeonjang).not.toHaveBeenCalled()
    expect(harness.requestSink.write).not.toHaveBeenCalled()
  })

  it("maps an untrusted internal blocker to a bounded public reason", async () => {
    const privateValue = "private /Users/operator/.knowbee secret-scope:production"
    const execute = vi.fn<LiveAcceptanceRouteExecutor>(async () => ({
      status: "blocked",
      blockers: [{ capability: "collection", reasonCode: privateValue }],
      events: [{ state: "blocked" }],
    }))
    const app = await routeApp(execute)
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/live-acceptance/runs",
        payload: requestFixture(),
        headers: { authorization: `Bearer ${TOKEN}` },
      })

      expect(response.statusCode).toBe(200)
      expect(response.json()).toEqual({
        status: "blocked",
        blockers: [{ capability: "collection", reasonCode: "live_acceptance_blocked" }],
        events: [{ state: "blocked" }],
      })
      expect(JSON.stringify(response.json())).not.toContain(privateValue)
    } finally {
      await app.close()
    }
  })
})
