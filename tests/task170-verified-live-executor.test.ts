import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import type { PersistedChannelSmokeRunResult } from "../packages/core/src/channels/smoke-runner.ts"
import type { LiveAcceptanceBundleApproval } from "../packages/core/src/release/live-acceptance-bundle.ts"
import type { LiveAcceptanceLlmPorts } from "../packages/core/src/release/live-acceptance-llm-adapter.ts"
import type { LiveAcceptanceVerifiedExecutionContext } from "../packages/core/src/release/live-acceptance-preflighted-executor.ts"
import { createVerifiedLiveAcceptanceExecutor } from "../packages/core/src/release/live-acceptance-verified-executor.ts"
import type { ExtensionLiveSmokeExecutionInput } from "../packages/core/src/runs/extension-live-smoke-runner.ts"
import type { WebRetrievalLiveCandidate } from "../packages/core/src/runs/web-retrieval-live-runner.ts"
import type { WebRetrievalLiveSmokeScenario } from "../packages/core/src/runs/web-retrieval-smoke.ts"
import type { YeonjangLiveSmokeExecutionInput } from "../packages/core/src/runs/yeonjang-live-smoke-runner.ts"

const NOW = Date.parse("2026-07-17T20:00:00.000Z")
const HASH = `sha256:${"a".repeat(64)}` as const
const scenario: WebRetrievalLiveSmokeScenario = {
  id: "current-fact",
  title: "Current fact",
  request: "현재 값을 확인해줘",
  target: { rawQuery: "current fact" },
  freshnessPolicy: "strict_timestamp",
  minimumMethods: ["fast_text_search", "direct_fetch"],
  completionConditions: ["current value, target, source and basis time are verified"],
}

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
    auditLogId: `audit:${channel}:170`,
    trace: {
      sourceChannel: channel,
      responseChannel: channel,
      auditLogId: `audit:${channel}:170`,
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
    runId: "channel:170",
    mode: "live-run",
    status: "passed",
    startedAt: NOW,
    finishedAt: NOW,
    summary: "redacted",
    counts: { total: 3, passed: 3, failed: 0, skipped: 0 },
    results: [result("webui"), result("telegram"), result("slack")],
  }
}

function context(signal = new AbortController().signal): LiveAcceptanceVerifiedExecutionContext {
  return Object.freeze({
    candidate: Object.freeze({ appVersion: "1.2.3", gitTag: "v1.2.3", gitCommit: "abc123" }),
    approval: Object.freeze({
      decision: "approved",
      authorizationStatus: "active",
      authorizationId: "authorization:170",
      auditEventId: "audit:approval:170",
      principalType: "authenticated_user",
      principalId: "operator:170",
      authenticationId: "authentication:170",
      roles: Object.freeze(["release_administrator"]),
      approvedAt: NOW - 1_000,
      expiresAt: NOW + 60_000,
      redactionStatus: "verified",
    } satisfies LiveAcceptanceBundleApproval),
    requestedKeyId: `sha256:${"1".repeat(64)}`,
    observedAt: NOW,
    signal,
    preflight: Object.freeze({
      status: "verified",
      snapshotCapturedAt: NOW,
      extensions: Object.freeze(
        (["skill", "mcp"] as const).map((capability) =>
          Object.freeze({
            scenario: Object.freeze({
              id: `live-acceptance:${capability}`,
              capability,
              expectedAgentId: "agent:release",
              expectedBindingId: `binding:${capability}:170`,
              expectedCatalogId: `catalog:${capability}:170`,
              expectedToolName: `${capability}.read`,
              readOnly: true,
            }),
            params: Object.freeze({ probe: capability }),
            authorization: Object.freeze({
              snapshotCapturedAt: NOW,
              capability,
              agentId: "agent:release",
              bindingId: `binding:${capability}:170`,
              catalogId: `catalog:${capability}:170`,
              toolName: `${capability}.read`,
              ...(capability === "mcp" ? { secretScopeId: "secret:mcp:170" } : {}),
            }),
          }),
        ),
      ),
      yeonjang: Object.freeze({
        scenario: Object.freeze({
          id: "live-acceptance:yeonjang-system-info",
          expectedInstanceId: "instance:office",
          expectedSessionId: "session:office:1",
          expectedMethod: "system.info",
          readOnly: true,
        }),
        instance: Object.freeze({
          instanceId: "instance:office",
          publicName: "Office",
          sessionId: "session:office:1",
          status: "connected",
          observedAt: NOW,
          duplicateActiveIdentityCount: 0,
          trustState: "trusted",
          runnableTarget: true,
        }),
      }),
    }),
  })
}

function candidate(): WebRetrievalLiveCandidate {
  return {
    evidenceRef: `tool-result:web-search:${"b".repeat(64)}`,
    sourceUrl: "https://quote.example/current",
    sourceDomain: "quote.example",
    sourceTimestamp: new Date(NOW - 1_000).toISOString(),
    fetchedAt: new Date(NOW - 500).toISOString(),
  }
}

function harness(options: { failExtension?: boolean } = {}) {
  const selected = candidate()
  const calls: string[] = []
  const requestSink = { write: vi.fn(async () => ({ status: "written" as const })) }
  const llm: LiveAcceptanceLlmPorts = {
    webPlan: async ({ candidates }) => {
      calls.push("web-plan")
      return {
        diagnosedBy: "llm",
        status: "selected",
        contextFingerprint: HASH,
        selectedEvidenceRef: candidates[0]?.evidenceRef,
        selectedSourceUrl: candidates[0]?.sourceUrl,
        requestedTargetFingerprint: HASH,
      }
    },
    webDiagnosis: async ({ evidenceRef, scenario: item }) => {
      calls.push("web-diagnose")
      return {
        diagnosedBy: "llm",
        status: "complete",
        contextFingerprint: HASH,
        criterionKeys: ["existence", "accuracy", "freshness", "target_match"],
        conditionCount: item.completionConditions.length,
        evidenceRefs: [evidenceRef],
        targetBinding: {
          status: "verified",
          requestedTargetFingerprint: HASH,
          evidenceTargetFingerprint: HASH,
        },
      }
    },
    extensionDiagnosis: async ({ evidenceRef }) => {
      calls.push("extension-diagnose")
      return {
        diagnosedBy: "llm",
        status: "complete",
        contextFingerprint: HASH,
        criterionKeys: ["existence", "accuracy", "target_match", "constraint_compliance"],
        evidenceRefs: [evidenceRef],
      }
    },
    yeonjangDiagnosis: async ({ evidenceRef }) => {
      calls.push("yeonjang-diagnose")
      return {
        diagnosedBy: "llm",
        status: "complete",
        contextFingerprint: HASH,
        criterionKeys: ["existence", "accuracy", "target_match", "constraint_compliance"],
        evidenceRefs: [evidenceRef],
      }
    },
  }
  const channels = vi.fn(async () => {
    calls.push("channels")
    return channelRun()
  })
  const search = vi.fn(async () => {
    calls.push("web-search")
    return { candidates: [selected], auditEventId: "audit:web-search:170", diagnosisPayload: {} }
  })
  const fetch = vi.fn(async () => {
    calls.push("web-fetch")
    return {
      evidenceRef: `tool-result:web-fetch:${"c".repeat(64)}`,
      sourceDomain: selected.sourceDomain,
      sourceTimestamp: selected.sourceTimestamp,
      fetchedAt: selected.fetchedAt,
      auditEventId: "audit:web-fetch:170",
      diagnosisPayload: {},
    }
  })
  const extensions = vi.fn(async ({ runId, selection }: ExtensionLiveSmokeExecutionInput) => {
    calls.push(`extension:${selection.scenario.capability}`)
    if (options.failExtension) throw new Error("private extension failure")
    const evidenceRef = `tool-result:${selection.scenario.capability}:${"d".repeat(64)}`
    return {
      toolExecution: {
        runId,
        requestGroupId: runId,
        capability: selection.scenario.capability,
        agentId: selection.scenario.expectedAgentId,
        bindingId: selection.scenario.expectedBindingId,
        catalogId: selection.scenario.expectedCatalogId,
        toolName: selection.scenario.expectedToolName,
        status: "succeeded",
        executionObserved: true,
        evidenceRef,
      },
      auditEventId: `audit:${selection.scenario.capability}:170`,
      diagnosisPayload: {},
    }
  })
  const yeonjang = vi.fn(async ({ runId, selection }: YeonjangLiveSmokeExecutionInput) => {
    calls.push(`yeonjang:${selection.scenario.expectedMethod}`)
    const commandId = "command:170"
    const evidenceRef = `tool-result:yeonjang:${"e".repeat(64)}`
    return {
      command: {
        runId,
        requestGroupId: runId,
        commandId,
        instanceId: selection.scenario.expectedInstanceId,
        sessionId: selection.scenario.expectedSessionId,
        method: selection.scenario.expectedMethod,
        readOnly: true,
        deliveryStatus: "acked",
      },
      observedResult: {
        runId,
        commandId,
        instanceId: selection.scenario.expectedInstanceId,
        sessionId: selection.scenario.expectedSessionId,
        status: "observed",
        evidenceRef,
      },
      auditEventId: "audit:yeonjang:170",
      diagnosisPayload: {},
    }
  })
  const execute = createVerifiedLiveAcceptanceExecutor({
    channels,
    web: { search, fetch },
    extensions,
    yeonjang,
    llm,
    requestSink,
    webScenarios: [scenario],
    createRunId: ({ stage, scenarioId }) => `live:170:${stage}:${scenarioId ?? "all"}`,
    failurePolicy: "continue_diagnostics",
    maxPreflightAgeMs: 60_000,
    maxWebSourceAgeMs: 60_000,
    maxYeonjangSessionAgeMs: 60_000,
    maxEvidenceAgeMs: 60_000,
    maxYeonjangInstanceAgeMs: 60_000,
  })
  return { execute, calls, requestSink, channels, search, fetch, extensions, yeonjang }
}

describe("Task 170 verified live acceptance executor", () => {
  it("runs actual live runners with exact selections and writes a multi-Yeonjang signing request", async () => {
    const value = harness()
    const result = await value.execute(context())

    expect(result.status, JSON.stringify({ result, calls: value.calls })).toBe("collected")
    expect(value.channels).toHaveBeenCalledOnce()
    expect(value.search).toHaveBeenCalledOnce()
    expect(value.fetch).toHaveBeenCalledOnce()
    expect(value.extensions).toHaveBeenCalledTimes(2)
    expect(value.yeonjang).toHaveBeenCalledTimes(3)
    expect(value.requestSink.write).toHaveBeenCalledOnce()
    expect(value.requestSink.write.mock.calls[0]?.[0].payload.evidence).toHaveLength(9)
    expect(value.calls.filter((call) => call.startsWith("yeonjang:"))).toEqual([
      "yeonjang:node.capabilities",
      "yeonjang:system.info",
      "yeonjang:camera.list",
    ])
    expect(
      value.extensions.mock.calls.map((call) => call[0].selection.scenario.expectedBindingId),
    ).toEqual(["binding:skill:170", "binding:mcp:170"])
  })

  it("blocks the signing request when an actual stage rejects", async () => {
    const value = harness({ failExtension: true })
    const result = await value.execute(context())

    expect(result.status).toBe("blocked")
    expect(value.requestSink.write).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain("private extension failure")
  })

  it("cancels before all external execution and never writes a signing request", async () => {
    const controller = new AbortController()
    controller.abort()
    const value = harness()
    const result = await value.execute(context(controller.signal))

    expect(result.status).toBe("cancelled")
    expect(value.channels).not.toHaveBeenCalled()
    expect(value.search).not.toHaveBeenCalled()
    expect(value.requestSink.write).not.toHaveBeenCalled()
  })

  it("keeps infrastructure, provider resolution, environment and wall clock outside composition", () => {
    const source = readFileSync(
      "packages/core/src/release/live-acceptance-verified-executor.ts",
      "utf8",
    )
    expect(source).not.toMatch(
      /process\.env|loadConfig|getProvider\(|ToolDispatcher|node:fs|globalThis\.fetch|Date\.now\(/u,
    )
  })
})
