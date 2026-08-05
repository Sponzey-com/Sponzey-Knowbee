import { readFileSync } from "node:fs"
import { describe, expect, it, vi } from "vitest"
import type { LiveAcceptanceBundleCandidate } from "../packages/core/src/release/live-acceptance-bundle.ts"
import { runLiveAcceptanceCollection } from "../packages/core/src/release/live-acceptance-runner.ts"
import {
  createLiveAcceptanceRuntimePorts,
  runProductionLiveAcceptance,
} from "../packages/core/src/release/live-acceptance-runtime-ports.ts"

const NOW = Date.parse("2026-07-17T11:00:00.000Z")
const candidate: LiveAcceptanceBundleCandidate = {
  appVersion: "1.2.3",
  gitTag: "v1.2.3",
  gitCommit: "abc1234",
}

function dryRun(stage: "channels" | "web" | "extensions" | "yeonjang") {
  if (stage === "channels") {
    return {
      runId: "channel:160",
      mode: "dry-run",
      status: "passed",
      startedAt: NOW,
      finishedAt: NOW,
      summary: "hidden",
      counts: { total: 1, passed: 1, failed: 0, skipped: 0 },
      results: [{ scenario: { id: "webui.basic_query" } }],
    }
  }
  if (stage === "web") {
    return {
      kind: "web_retrieval.live_smoke",
      mode: "dry-run",
      smokeId: "web:160",
      policyVersion: "v2",
      startedAt: new Date(NOW).toISOString(),
      finishedAt: new Date(NOW).toISOString(),
      status: "passed",
      counts: { total: 1, passed: 1, failed: 0, skipped: 0 },
      results: [{ scenario: { id: "web-live" } }],
    }
  }
  if (stage === "extensions") {
    return {
      kind: "extension.live_smoke",
      mode: "dry-run",
      runId: "extension:160",
      status: "passed",
      startedAt: NOW,
      finishedAt: NOW,
      results: [{ scenario: { id: "skill-live", capability: "skill" } }],
    }
  }
  return {
    kind: "yeonjang.live_smoke",
    mode: "dry-run",
    runId: "yeonjang:160",
    status: "passed",
    startedAt: NOW,
    finishedAt: NOW,
    results: [{ scenario: { id: "yeonjang-live" } }],
  }
}

function factory(readiness: "ready" | "unavailable" = "ready") {
  const executors = {
    channels: vi.fn(async () => dryRun("channels") as never),
    web: vi.fn(async () => dryRun("web") as never),
    extensions: vi.fn(async () => dryRun("extensions") as never),
    yeonjang: vi.fn(async () => dryRun("yeonjang") as never),
  }
  const stageReadiness =
    readiness === "ready"
      ? ({ status: "ready" } as const)
      : ({ status: "unavailable", reasonCode: "credential_unavailable" } as const)
  const preflight = {
    capturedAt: NOW,
    stages: {
      channels: stageReadiness,
      web: stageReadiness,
      extensions: stageReadiness,
      yeonjang: stageReadiness,
    },
  }
  return {
    executors,
    preflight,
    ports: createLiveAcceptanceRuntimePorts({
      preflight,
      executors,
      maxWebSourceAgeMs: 60_000,
      maxYeonjangSessionAgeMs: 60_000,
      maxPreflightAgeMs: 60_000,
    }),
  }
}

function validSummaries() {
  const channelResult = (channel: "webui" | "telegram" | "slack") => ({
    scenario: {
      id: `${channel}.basic_query`,
      channel,
      kind: "basic_query",
      title: "Basic",
      request: "hidden",
      expectedTarget: channel,
      correlationKey:
        channel === "webui"
          ? "webui_run_id"
          : channel === "telegram"
            ? "telegram_chat_thread"
            : "slack_thread",
      requiresExternalCredential: channel !== "webui",
      releaseGate: "automated",
    },
    status: "passed",
    failures: [],
    auditLogId: `audit-${channel}-160`,
    trace: {
      sourceChannel: channel,
      responseChannel: channel,
      auditLogId: `audit-${channel}-160`,
      requestFlow: {
        requestGroupMatchesRunId: true,
        decisionTracePresent: true,
        topologyRunCreated: true,
        providerDirectUsed: false,
      },
    },
    finishedAt: NOW - 1_000,
  })
  const extensionResult = (capability: "skill" | "mcp") => {
    const suffix = `${capability}:weather`
    const evidenceRef = `tool-result:${capability}:${"b".repeat(64)}`
    return {
      scenario: {
        id: `${capability}-read-only-call`,
        capability,
        expectedAgentId: "agent:main",
        expectedBindingId: `binding:${suffix}`,
        expectedCatalogId: suffix,
        expectedToolName: "weather.read",
        readOnly: true,
      },
      state: "verified",
      status: "passed",
      trace: {
        requestGroupId: "extension-run:160",
        selectedCapability: capability,
        selectedAgentId: "agent:main",
        selectedBindingId: `binding:${suffix}`,
        selectedCatalogId: suffix,
        discoveryOnly: false,
        toolExecution: {
          runId: "extension-run:160",
          requestGroupId: "extension-run:160",
          capability,
          agentId: "agent:main",
          bindingId: `binding:${suffix}`,
          catalogId: suffix,
          toolName: "weather.read",
          status: "succeeded",
          executionObserved: true,
          evidenceRef,
        },
        resultDiagnosis: {
          diagnosedBy: "llm",
          status: "complete",
          contextFingerprint: `sha256:${"a".repeat(64)}`,
          criterionKeys: ["existence", "accuracy", "target_match", "constraint_compliance"],
          evidenceRefs: [evidenceRef],
        },
        auditEventId: `audit:${capability}:160`,
        redactionStatus: "verified",
      },
      startedAt: NOW - 2_000,
      finishedAt: NOW - 1_000,
    }
  }
  const webEvidenceRef = `tool-result:web:${"c".repeat(64)}`
  const yeonjangEvidenceRef = `tool-result:yeonjang:${"d".repeat(64)}`
  return {
    channels: {
      runId: "channel-run:160",
      mode: "live-run",
      status: "passed",
      startedAt: NOW - 2_000,
      finishedAt: NOW - 1_000,
      summary: "hidden",
      counts: { total: 3, passed: 3, failed: 0, skipped: 0 },
      results: [channelResult("webui"), channelResult("telegram"), channelResult("slack")],
    },
    web: {
      kind: "web_retrieval.live_smoke",
      mode: "live-run",
      smokeId: "web-run:160",
      policyVersion: "v2",
      startedAt: new Date(NOW - 2_000).toISOString(),
      finishedAt: new Date(NOW - 1_000).toISOString(),
      status: "passed",
      counts: { total: 1, passed: 1, failed: 0, skipped: 0 },
      results: [
        {
          scenario: {
            id: "web-current-fact",
            title: "Current fact",
            request: "hidden",
            target: { kind: "fact" },
            freshnessPolicy: "current",
            minimumMethods: ["search"],
            completionConditions: ["verified"],
          },
          status: "passed",
          failures: [],
          trace: {
            attemptedMethods: ["search"],
            answerProduced: true,
            resultDiagnosis: {
              diagnosedBy: "llm",
              status: "complete",
              contextFingerprint: `sha256:${"a".repeat(64)}`,
              criterionKeys: ["existence", "accuracy", "freshness", "target_match"],
              conditionCount: 1,
              evidenceRefs: [webEvidenceRef],
            },
            liveAcceptance: {
              auditEventId: "audit:web:160",
              redactionStatus: "verified",
              targetBinding: {
                status: "verified",
                requestedTargetFingerprint: `sha256:${"e".repeat(64)}`,
                evidenceTargetFingerprint: `sha256:${"e".repeat(64)}`,
              },
              sourceEvidence: [
                {
                  evidenceRef: webEvidenceRef,
                  sourceDomain: "example.com",
                  sourceTimestamp: new Date(NOW - 2_000).toISOString(),
                  fetchedAt: new Date(NOW - 1_500).toISOString(),
                },
              ],
            },
          },
          startedAt: new Date(NOW - 2_000).toISOString(),
          finishedAt: new Date(NOW - 1_000).toISOString(),
        },
      ],
    },
    extensions: {
      kind: "extension.live_smoke",
      mode: "live-run",
      runId: "extension-run:160",
      status: "passed",
      startedAt: NOW - 2_000,
      finishedAt: NOW - 1_000,
      results: [extensionResult("skill"), extensionResult("mcp")],
    },
    yeonjang: {
      kind: "yeonjang.live_smoke",
      mode: "live-run",
      runId: "yeonjang-run:160",
      status: "passed",
      startedAt: NOW - 2_000,
      finishedAt: NOW - 1_000,
      results: [
        {
          scenario: {
            id: "yeonjang-status",
            expectedInstanceId: "instance:office",
            expectedSessionId: "session:office:1",
            expectedMethod: "system.info",
            readOnly: true,
          },
          state: "verified",
          status: "passed",
          trace: {
            requestGroupId: "yeonjang-run:160",
            instance: {
              instanceId: "instance:office",
              publicName: "Office",
              sessionId: "session:office:1",
              status: "connected",
              observedAt: NOW - 1_000,
              duplicateActiveIdentityCount: 0,
              trustState: "trusted",
              runnableTarget: true,
            },
            command: {
              runId: "yeonjang-run:160",
              requestGroupId: "yeonjang-run:160",
              commandId: "command:160",
              instanceId: "instance:office",
              sessionId: "session:office:1",
              method: "system.info",
              readOnly: true,
              deliveryStatus: "acked",
            },
            observedResult: {
              runId: "yeonjang-run:160",
              commandId: "command:160",
              instanceId: "instance:office",
              sessionId: "session:office:1",
              status: "observed",
              evidenceRef: yeonjangEvidenceRef,
            },
            resultDiagnosis: {
              diagnosedBy: "llm",
              status: "complete",
              contextFingerprint: `sha256:${"f".repeat(64)}`,
              criterionKeys: ["existence", "accuracy", "target_match", "constraint_compliance"],
              evidenceRefs: [yeonjangEvidenceRef],
            },
            auditEventId: "audit:yeonjang:160",
            redactionStatus: "verified",
          },
          startedAt: NOW - 2_000,
          finishedAt: NOW - 1_000,
        },
      ],
    },
  }
}

const context = (
  requiredCapabilities: Array<
    "webui" | "telegram" | "slack" | "web" | "skill" | "mcp" | "yeonjang"
  >,
) => ({
  candidate,
  observedAt: NOW,
  requiredCapabilities,
})

describe("Task 160 live runtime port factory", () => {
  it("routes executor summaries through the canonical producers", async () => {
    const { ports } = factory()
    await expect(
      ports.channels.execute(context(["webui", "telegram", "slack"])),
    ).resolves.toMatchObject({
      status: "produced",
      result: { rejected: [{ reasonCode: "channel_smoke_not_live" }] },
    })
    await expect(ports.web.execute(context(["web"]))).resolves.toMatchObject({
      status: "produced",
      result: { rejected: [{ reasonCode: "web_smoke_not_live" }] },
    })
    await expect(ports.extensions.execute(context(["skill", "mcp"]))).resolves.toMatchObject({
      status: "produced",
      result: { rejected: [{ reasonCode: "extension_smoke_not_live" }] },
    })
    await expect(ports.yeonjang.execute(context(["yeonjang"]))).resolves.toMatchObject({
      status: "produced",
      result: { rejected: [{ reasonCode: "yeonjang_smoke_not_live" }] },
    })
  })

  it("collects all seven capabilities through actual canonical producers", async () => {
    const summaries = validSummaries()
    const executors = {
      channels: vi.fn(async () => summaries.channels as never),
      web: vi.fn(async () => summaries.web as never),
      extensions: vi.fn(async () => summaries.extensions as never),
      yeonjang: vi.fn(async () => summaries.yeonjang as never),
    }
    const preflight = {
      capturedAt: NOW,
      stages: {
        channels: { status: "ready" } as const,
        web: { status: "ready" } as const,
        extensions: { status: "ready" } as const,
        yeonjang: { status: "ready" } as const,
      },
    }
    const ports = createLiveAcceptanceRuntimePorts({
      preflight,
      executors,
      maxWebSourceAgeMs: 60_000,
      maxYeonjangSessionAgeMs: 60_000,
      maxPreflightAgeMs: 60_000,
    })
    const payloadSink = { write: vi.fn(async () => ({ status: "written" as const })) }
    const result = await runLiveAcceptanceCollection({
      candidate,
      approval: {
        decision: "approved",
        authorizationStatus: "active",
        authorizationId: "authorization:160",
        auditEventId: "audit:approval:160",
        principalType: "authenticated_user",
        principalId: "operator:160",
        authenticationId: "authentication:160",
        roles: ["release_administrator"],
        approvedAt: NOW - 1_000,
        expiresAt: NOW + 60_000,
        redactionStatus: "verified",
      },
      ports,
      payloadSink,
      failurePolicy: "continue_diagnostics",
      now: NOW,
      maxEvidenceAgeMs: 60_000,
      isCancelled: () => false,
    })
    expect(result.status).toBe("collected")
    expect(payloadSink.write).toHaveBeenCalledOnce()
    expect(payloadSink.write.mock.calls[0]?.[0].evidence).toHaveLength(7)
  })

  it("uses an immutable unavailable preflight without calling executors", async () => {
    const { ports, executors, preflight } = factory("unavailable")
    preflight.stages.web = { status: "ready" }
    await expect(ports.web.execute(context(["web"]))).resolves.toEqual({
      status: "unavailable",
      reasonCode: "credential_unavailable",
    })
    expect(executors.web).not.toHaveBeenCalled()
  })

  it("rejects a stale preflight before executor invocation", async () => {
    const { executors, preflight } = factory()
    const ports = createLiveAcceptanceRuntimePorts({
      preflight: { ...preflight, capturedAt: NOW - 60_001 },
      executors,
      maxPreflightAgeMs: 60_000,
      maxWebSourceAgeMs: 60_000,
      maxYeonjangSessionAgeMs: 60_000,
    })
    await expect(ports.web.execute(context(["web"]))).resolves.toEqual({
      status: "unavailable",
      reasonCode: "live_preflight_stale",
    })
    expect(executors.web).not.toHaveBeenCalled()
  })

  it("rejects capability order mismatch before executor invocation", async () => {
    const { ports, executors } = factory()
    await expect(ports.channels.execute(context(["telegram", "webui", "slack"]))).resolves.toEqual({
      status: "unavailable",
      reasonCode: "live_stage_capability_contract_mismatch",
    })
    expect(executors.channels).not.toHaveBeenCalled()
  })

  it("does not read environment, filesystem, provider, network, or private signer state", () => {
    const source = readFileSync(
      "packages/core/src/release/live-acceptance-runtime-ports.ts",
      "utf8",
    )
    expect(source).not.toMatch(/process\.env|node:fs|fetch\(|provider|privateKey|createPrivateKey/u)
  })

  it("composes runtime producers through an unsigned signing-request sink", async () => {
    const summaries = validSummaries()
    const requestSink = { write: vi.fn(async () => ({ status: "written" as const })) }
    const result = await runProductionLiveAcceptance({
      candidate,
      approval: {
        decision: "approved",
        authorizationStatus: "active",
        authorizationId: "authorization:composition:160",
        auditEventId: "audit:composition:160",
        principalType: "authenticated_user",
        principalId: "operator:160",
        authenticationId: "authentication:160",
        roles: ["release_administrator"],
        approvedAt: NOW - 1_000,
        expiresAt: NOW + 60_000,
        redactionStatus: "verified",
      },
      preflight: {
        capturedAt: NOW,
        stages: {
          channels: { status: "ready" },
          web: { status: "ready" },
          extensions: { status: "ready" },
          yeonjang: { status: "ready" },
        },
      },
      executors: {
        channels: async () => summaries.channels as never,
        web: async () => summaries.web as never,
        extensions: async () => summaries.extensions as never,
        yeonjang: async () => summaries.yeonjang as never,
      },
      maxPreflightAgeMs: 60_000,
      maxWebSourceAgeMs: 60_000,
      maxYeonjangSessionAgeMs: 60_000,
      maxEvidenceAgeMs: 60_000,
      failurePolicy: "continue_diagnostics",
      requestedKeyId: `sha256:${"1".repeat(64)}`,
      requestSink,
      now: NOW,
      isCancelled: () => false,
    })
    expect(result.status).toBe("collected")
    expect(requestSink.write).toHaveBeenCalledOnce()
    expect(requestSink.write.mock.calls[0]?.[0].payload.evidence).toHaveLength(7)
    expect(JSON.stringify(requestSink.write.mock.calls[0]?.[0])).not.toMatch(
      /signatureBase64|privateKey|rawResult/u,
    )
  })
})
