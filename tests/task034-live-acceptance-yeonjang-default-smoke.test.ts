import { describe, expect, it, vi } from "vitest"
import type { PersistedChannelSmokeRunResult } from "../packages/core/src/channels/smoke-runner.ts"
import type { LiveAcceptanceBundleApproval } from "../packages/core/src/release/live-acceptance-bundle.ts"
import type { LiveAcceptanceLlmPorts } from "../packages/core/src/release/live-acceptance-llm-adapter.ts"
import type { LiveAcceptanceVerifiedExecutionContext } from "../packages/core/src/release/live-acceptance-preflighted-executor.ts"
import {
  createVerifiedLiveAcceptanceExecutor,
  expandYeonjangLiveAcceptanceSelections,
} from "../packages/core/src/release/live-acceptance-verified-executor.ts"
import type { WebRetrievalLiveCandidate } from "../packages/core/src/runs/web-retrieval-live-runner.ts"
import type { WebRetrievalLiveSmokeScenario } from "../packages/core/src/runs/web-retrieval-smoke.ts"
import type {
  YeonjangLiveSmokeExecutionInput,
  YeonjangLiveSmokeSelection,
} from "../packages/core/src/runs/yeonjang-live-smoke-runner.ts"

const NOW = Date.parse("2026-07-21T14:00:00.000Z")
const HASH = `sha256:${"b".repeat(64)}` as const

const webScenario: WebRetrievalLiveSmokeScenario = {
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
    auditLogId: `audit:${channel}:034`,
    trace: {
      sourceChannel: channel,
      responseChannel: channel,
      auditLogId: `audit:${channel}:034`,
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
    runId: "channel:034",
    mode: "live-run",
    status: "passed",
    startedAt: NOW,
    finishedAt: NOW,
    summary: "redacted",
    counts: { total: 3, passed: 3, failed: 0, skipped: 0 },
    results: [result("webui"), result("telegram"), result("slack")],
  }
}

function yeonjangSelection(
  params?: Readonly<Record<string, unknown>>,
  method: "system.info" | "file.list" = "file.list",
): YeonjangLiveSmokeSelection {
  return Object.freeze({
    scenario: Object.freeze({
      id: "live-acceptance:yeonjang-file-list",
      expectedInstanceId: "instance:office",
      expectedSessionId: "session:office:1",
      expectedMethod: method,
      ...(params ? { params } : {}),
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
  })
}

function context(): LiveAcceptanceVerifiedExecutionContext {
  return Object.freeze({
    candidate: Object.freeze({ appVersion: "1.2.3", gitTag: "v1.2.3", gitCommit: "abc123" }),
    approval: Object.freeze({
      decision: "approved",
      authorizationStatus: "active",
      authorizationId: "authorization:034",
      auditEventId: "audit:approval:034",
      principalType: "authenticated_user",
      principalId: "operator:034",
      authenticationId: "authentication:034",
      roles: Object.freeze(["release_administrator"]),
      approvedAt: NOW - 1_000,
      expiresAt: NOW + 60_000,
      redactionStatus: "verified",
    } satisfies LiveAcceptanceBundleApproval),
    requestedKeyId: `sha256:${"1".repeat(64)}`,
    observedAt: NOW,
    signal: new AbortController().signal,
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
              expectedBindingId: `binding:${capability}:034`,
              expectedCatalogId: `catalog:${capability}:034`,
              expectedToolName: `${capability}.read`,
              readOnly: true,
            }),
            params: Object.freeze({ probe: capability }),
            authorization: Object.freeze({
              snapshotCapturedAt: NOW,
              capability,
              agentId: "agent:release",
              bindingId: `binding:${capability}:034`,
              catalogId: `catalog:${capability}:034`,
              toolName: `${capability}.read`,
              ...(capability === "mcp" ? { secretScopeId: "secret:mcp:034" } : {}),
            }),
          }),
        ),
      ),
      yeonjang: yeonjangSelection(Object.freeze({ path: "/Users/example/Documents" })),
    }),
  })
}

function webCandidate(): WebRetrievalLiveCandidate {
  return {
    evidenceRef: `tool-result:web-search:${"c".repeat(64)}`,
    sourceUrl: "https://quote.example/current",
    sourceDomain: "quote.example",
    sourceTimestamp: new Date(NOW - 1_000).toISOString(),
    fetchedAt: new Date(NOW - 500).toISOString(),
  }
}

describe("Task 034 live acceptance Yeonjang default smoke", () => {
  it("expands a path-backed Yeonjang selection into default read-only smoke methods", () => {
    const expanded = expandYeonjangLiveAcceptanceSelections(
      yeonjangSelection(Object.freeze({ path: "/Users/example/Documents" })),
    )

    expect(expanded.map((item) => item.scenario.expectedMethod)).toEqual([
      "node.capabilities",
      "system.info",
      "camera.list",
      "file.list",
      "disk.usage",
    ])
    expect(expanded.find((item) => item.scenario.expectedMethod === "file.list")?.scenario.params)
      .toEqual({ path: "/Users/example/Documents" })
    expect(expanded.find((item) => item.scenario.expectedMethod === "disk.usage")?.scenario.params)
      .toEqual({ path: "/Users/example/Documents" })
  })

  it("keeps file and disk smoke out when no path param is available", () => {
    const expanded = expandYeonjangLiveAcceptanceSelections(yeonjangSelection(undefined, "system.info"))

    expect(expanded.map((item) => item.scenario.expectedMethod)).toEqual([
      "node.capabilities",
      "system.info",
      "camera.list",
    ])
    expect(expanded.some((item) => item.scenario.expectedMethod === "file.list")).toBe(false)
    expect(expanded.some((item) => item.scenario.expectedMethod === "disk.usage")).toBe(false)
  })

  it("runs expanded Yeonjang smoke selections through the verified executor", async () => {
    const selected = webCandidate()
    const requestSink = { write: vi.fn(async () => ({ status: "written" as const })) }
    const yeonjangMethods: string[] = []
    const llm: LiveAcceptanceLlmPorts = {
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
    }
    const execute = createVerifiedLiveAcceptanceExecutor({
      channels: async () => channelRun(),
      web: {
        search: async () => ({
          candidates: [selected],
          auditEventId: "audit:web-search:034",
          diagnosisPayload: {},
        }),
        fetch: async () => ({
          evidenceRef: `tool-result:web-fetch:${"d".repeat(64)}`,
          sourceDomain: selected.sourceDomain,
          sourceTimestamp: selected.sourceTimestamp,
          fetchedAt: selected.fetchedAt,
          auditEventId: "audit:web-fetch:034",
          diagnosisPayload: {},
        }),
      },
      extensions: async ({ runId, selection }) => {
        const evidenceRef = `tool-result:${selection.scenario.capability}:${"e".repeat(64)}`
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
          auditEventId: `audit:${selection.scenario.capability}:034`,
          diagnosisPayload: {},
        }
      },
      yeonjang: async ({ runId, selection }: YeonjangLiveSmokeExecutionInput) => {
        yeonjangMethods.push(selection.scenario.expectedMethod)
        const commandId = `command:${selection.scenario.expectedMethod}`
        const evidenceRef = `tool-result:yeonjang:${selection.scenario.expectedMethod}`
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
          auditEventId: `audit:yeonjang:${selection.scenario.expectedMethod}`,
          diagnosisPayload: {},
        }
      },
      llm,
      requestSink,
      webScenarios: [webScenario],
      createRunId: ({ stage, scenarioId }) => `live:034:${stage}:${scenarioId ?? "all"}`,
      failurePolicy: "continue_diagnostics",
      maxPreflightAgeMs: 60_000,
      maxWebSourceAgeMs: 60_000,
      maxYeonjangSessionAgeMs: 60_000,
      maxEvidenceAgeMs: 60_000,
      maxYeonjangInstanceAgeMs: 60_000,
    })

    const result = await execute(context())

    expect(result.status, JSON.stringify({ result, yeonjangMethods })).toBe("collected")
    expect(yeonjangMethods).toEqual([
      "node.capabilities",
      "system.info",
      "camera.list",
      "file.list",
      "disk.usage",
    ])
    expect(requestSink.write).toHaveBeenCalledOnce()
    expect(requestSink.write.mock.calls[0]?.[0].payload.evidence).toHaveLength(11)
  })
})
