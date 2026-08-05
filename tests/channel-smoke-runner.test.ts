import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG, type KnowbeeConfig } from "../packages/core/src/config/types.ts"
import {
  closeDb,
  getChannelSmokeRun,
  insertChannelSmokeRun,
  listChannelSmokeRuns,
  listChannelSmokeSteps,
} from "../packages/core/src/db/index.js"
import {
  createDryRunChannelSmokeExecutor,
  getDefaultChannelSmokeScenarios,
  resolveChannelSmokeReadiness,
  recoverInterruptedGatewayChannelSmokeRuns,
  runChannelSmokeScenarios,
  runPersistedChannelSmokeScenarios,
  validateChannelSmokeTrace,
  type ChannelSmokeScenario,
  type ChannelSmokeTrace,
} from "../packages/core/src/channels/smoke-runner.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

function configWithChannels(patch: Partial<KnowbeeConfig> = {}): KnowbeeConfig {
  return {
    ...structuredClone(DEFAULT_CONFIG),
    ...patch,
  }
}

function scenario(id: string): ChannelSmokeScenario {
  const match = getDefaultChannelSmokeScenarios().find((candidate) => candidate.id === id)
  if (!match) throw new Error(`missing scenario: ${id}`)
  return match
}

function passingTrace(current: ChannelSmokeScenario): ChannelSmokeTrace {
  return {
    sourceChannel: current.channel,
    responseChannel: current.expectedTarget,
    correlationKey: current.correlationKey,
    requestFlow: {
      runId: `run-${current.id}`,
      requestGroupId: `run-${current.id}`,
      requestGroupMatchesRunId: true,
      decisionTracePresent: true,
      requestDiagnosisReceiptId: `diagnosis-${current.id}`,
      solutionPlanReceiptId: `plan-${current.id}`,
      resultReviewReceiptId: `review-${current.id}`,
      finalResponseReceiptId: `final-response-${current.id}`,
      decisionReceiptOrderValid: true,
      ...(current.kind === "web_skill" ||
      current.kind === "approval_required_tool" ||
      current.kind === "artifact_delivery"
        ? {
            capabilityAdmissionRequired: true,
            capabilityAdmissionReceiptId: `capability-admission-${current.id}`,
          }
        : {}),
      topologyRunCreated: true,
      providerDirectUsed: false,
    },
    finalization: {
      rootOwnerFinalized: true,
      finalAnswerCount: 1,
    },
    latency: {
      metricId: `latency-${current.id}`,
      runId: `run-${current.id}`,
      requestGroupId: `run-${current.id}`,
      firstResponseLatencyMs: 500,
      firstResponseBudgetMs: 30_000,
      firstResponseStatus: "ok",
      terminalResponseLatencyMs: 800,
    },
    finalDelivery: {
      delivered: true,
      targetChannel: current.expectedTarget,
      correlationKey: current.correlationKey,
      receiptRef: `delivery-${current.id}`,
      userVisible: true,
    },
    auditLogId: `audit-${current.id}`,
    toolCalls: current.expectedTool
      ? [{ toolName: current.expectedTool, sourceChannel: current.channel, deliveryChannel: current.channel }]
      : [],
    approval: current.expectsApproval
      ? {
          requested: true,
          resolved: "approve_once",
          targetChannel: current.channel,
          correlationKey: current.correlationKey,
          uiVisible: true,
          uiKind: current.channel === "webui" ? "inline" : "button",
        }
      : undefined,
    artifacts: current.expectsArtifact
      ? [{ channel: current.channel, mode: current.channel === "webui" ? "download_link" : "native_file", url: "/api/artifacts/screens/test.png" }]
      : [],
    capabilityFallbacks: current.expectsUnsupportedCapability
      ? [{
          capability: "supportsButtons",
          receiptStatus: "unsupported_capability",
          userVisible: true,
          message: "This channel does not support interactive buttons.",
        }]
      : [],
    finalText: current.expectsFailure ? "지원하지 않는 기능이라 실행하지 않았습니다." : "완료했습니다.",
  }
}

describe("channel smoke runner", () => {
  it("accepts a basic query completed by the canonical direct-response path", () => {
    const webui = scenario("webui.basic_query")
    const trace = passingTrace(webui)
    trace.requestFlow = {
      runId: "run-webui.basic_query",
      requestGroupId: "run-webui.basic_query",
      requestGroupMatchesRunId: true,
      flowKind: "direct_response",
      directResponseReceiptId: "llm-invocation:direct",
      topologyRunCreated: false,
      providerDirectUsed: false,
    }

    expect(validateChannelSmokeTrace(webui, trace)).toEqual({
      status: "passed",
      failures: [],
    })
  })

  it("accepts canonical self-solve execution without a delegated topology run", () => {
    const webui = scenario("webui.web_skill")
    const trace = passingTrace(webui)
    if (!trace.requestFlow) throw new Error("request flow required")
    trace.requestFlow.topologyRunCreated = false

    expect(validateChannelSmokeTrace(webui, trace)).toEqual({
      status: "passed",
      failures: [],
    })
  })

  it("defines four smoke scenarios per supported user channel", () => {
    const scenarios = getDefaultChannelSmokeScenarios()

    expect(scenarios).toHaveLength(30)
    expect(scenarios.filter((item) => item.channel === "webui")).toHaveLength(5)
    expect(scenarios.filter((item) => item.channel === "telegram")).toHaveLength(5)
    expect(scenarios.filter((item) => item.channel === "slack")).toHaveLength(4)
    expect(scenarios.filter((item) => item.channel === "discord")).toHaveLength(4)
    expect(scenarios.filter((item) => item.channel === "google_chat")).toHaveLength(4)
    expect(scenarios.filter((item) => item.channel === "imessage")).toHaveLength(4)
    expect(scenarios.filter((item) => item.channel === "kakaotalk")).toHaveLength(4)
    expect(scenarios.filter((item) => item.expectsApproval)).toHaveLength(7)
    expect(scenarios.filter((item) => item.expectsArtifact)).toHaveLength(14)
    expect(scenarios.filter((item) => item.expectsUnsupportedCapability)).toHaveLength(7)
    expect(scenarios.filter((item) => item.releaseGate === "fixture").map((item) => item.channel)).toEqual(
      expect.arrayContaining(["discord", "google_chat"]),
    )
    expect(scenarios.filter((item) => item.releaseGate === "manual").map((item) => item.channel)).toEqual(
      expect.arrayContaining(["imessage", "kakaotalk"]),
    )
  })

  it("skips external channel smoke tests when credentials or target ids are missing", () => {
    const config = configWithChannels()

    expect(resolveChannelSmokeReadiness(config, scenario("webui.basic_query"))).toEqual({ ready: true })
    expect(resolveChannelSmokeReadiness(config, scenario("telegram.basic_query"))).toEqual({
      ready: false,
      skipReason: "telegram_disabled",
    })
    expect(resolveChannelSmokeReadiness(config, scenario("slack.basic_query"))).toEqual({
      ready: false,
      skipReason: "slack_disabled",
    })
    expect(resolveChannelSmokeReadiness(config, scenario("discord.basic_query"))).toEqual({
      ready: false,
      skipReason: "discord_disabled",
    })
    expect(resolveChannelSmokeReadiness(config, scenario("google_chat.basic_query"))).toEqual({
      ready: false,
      skipReason: "google_chat_disabled",
    })
    expect(resolveChannelSmokeReadiness(config, scenario("imessage.basic_query"))).toEqual({
      ready: false,
      skipReason: "imessage_disabled",
    })
    expect(resolveChannelSmokeReadiness(config, scenario("kakaotalk.basic_query"))).toEqual({
      ready: false,
      skipReason: "kakaotalk_disabled",
    })
  })

  it("passes Slack artifact and approval traces only when they stay in the originating thread", () => {
    const slack = scenario("slack.approval_required_tool")

    expect(validateChannelSmokeTrace(slack, passingTrace(slack))).toEqual({
      status: "passed",
      failures: [],
    })
  })

  it("requires run-bound latency evidence without making the 30-second objective terminal", () => {
    const webui = scenario("webui.basic_query")
    const missing = passingTrace(webui)
    delete missing.latency
    expect(validateChannelSmokeTrace(webui, missing)).toMatchObject({
      status: "failed",
      failures: expect.arrayContaining(["latency_evidence_missing"]),
    })

    const crossRun = passingTrace(webui)
    crossRun.latency = {
      ...crossRun.latency!,
      runId: "run:other",
    }
    expect(validateChannelSmokeTrace(webui, crossRun)).toMatchObject({
      status: "failed",
      failures: expect.arrayContaining(["latency_evidence_binding_mismatch"]),
    })

    const late = passingTrace(webui)
    late.latency = {
      ...late.latency!,
      firstResponseLatencyMs: 30_001,
      firstResponseStatus: "timeout",
    }
    expect(validateChannelSmokeTrace(webui, late)).toEqual({
      status: "passed",
      failures: [],
    })
  })

  it("fails Slack smoke traces that try to use Telegram delivery", () => {
    const slack = scenario("slack.artifact_delivery")

    const result = validateChannelSmokeTrace(slack, {
      ...passingTrace(slack),
      toolCalls: [{ toolName: "telegram_send_file", sourceChannel: "slack", deliveryChannel: "telegram" }],
      artifacts: [{ channel: "telegram", mode: "native_file", filePath: "/tmp/wrong.png" }],
    })

    expect(result.status).toBe("failed")
    expect(result.failures).toEqual(expect.arrayContaining([
      "tool_delivery_channel_mismatch:telegram_send_file:telegram",
      "telegram_delivery_tool_used_outside_telegram",
      "artifact_channel_mismatch:telegram",
    ]))
  })

  it("fails non-Slack traces that try to use Slack delivery tools", () => {
    const telegram = scenario("telegram.artifact_delivery")

    const result = validateChannelSmokeTrace(telegram, {
      ...passingTrace(telegram),
      toolCalls: [{ toolName: "slack_file_upload", sourceChannel: "telegram", deliveryChannel: "slack" }],
      artifacts: [{ channel: "slack", mode: "native_file", filePath: "/tmp/wrong.png" }],
    })

    expect(result.status).toBe("failed")
    expect(result.failures).toEqual(expect.arrayContaining([
      "tool_delivery_channel_mismatch:slack_file_upload:slack",
      "slack_delivery_tool_used_outside_slack",
      "artifact_channel_mismatch:slack",
    ]))
  })

  it("fails approval traces when the originating channel did not show an approval button", () => {
    const slack = scenario("slack.approval_required_tool")

    const hidden = validateChannelSmokeTrace(slack, {
      ...passingTrace(slack),
      approval: { requested: true, resolved: "approve_once", targetChannel: "slack", correlationKey: "slack_thread", uiVisible: false },
    })
    const fallback = validateChannelSmokeTrace(slack, {
      ...passingTrace(slack),
      approval: { requested: true, resolved: "approve_once", targetChannel: "slack", correlationKey: "slack_thread", uiVisible: true, uiKind: "text_fallback" },
    })

    expect(hidden.status).toBe("failed")
    expect(hidden.failures).toContain("approval_ui_missing")
    expect(fallback.status).toBe("failed")
    expect(fallback.failures).toContain("approval_button_missing")
  })

  it("fails approval traces that timed out before a user decision", () => {
    const webui = scenario("webui.approval_required_tool")

    const result = validateChannelSmokeTrace(webui, {
      ...passingTrace(webui),
      approval: { requested: true, resolved: "timeout", targetChannel: "webui", correlationKey: "webui_run_id", uiVisible: true, uiKind: "inline" },
    })

    expect(result.status).toBe("failed")
    expect(result.failures).toContain("approval_timeout")
  })

  it("fails Web UI artifact smoke traces that expose only a local path", () => {
    const webui = scenario("webui.artifact_delivery")

    const result = validateChannelSmokeTrace(webui, {
      ...passingTrace(webui),
      artifacts: [{ channel: "webui", mode: "local_path_markdown", filePath: "/Users/test/.knowbee/artifacts/screen.png" }],
      finalText: "![screenshot](/Users/test/.knowbee/artifacts/screen.png)",
    })

    expect(result.status).toBe("failed")
    expect(result.failures).toEqual(expect.arrayContaining([
      "artifact_local_path_markdown",
      "webui_artifact_mode_invalid:local_path_markdown",
      "local_path_exposed_in_final_text",
    ]))
  })

  it("fails unsupported capability fallback traces when the user-visible receipt is missing", () => {
    const telegram = scenario("telegram.failure_tool")

    const result = validateChannelSmokeTrace(telegram, {
      ...passingTrace(telegram),
      capabilityFallbacks: [{ capability: "supportsButtons", receiptStatus: "unsupported_capability", userVisible: false }],
    })

    expect(result.status).toBe("failed")
    expect(result.failures).toContain("unsupported_capability_ui_missing")
  })

  it("uses one explicit unsupported method request for provider failure scenarios", () => {
    const failureScenarios = getDefaultChannelSmokeScenarios().filter(
      (candidate) =>
        candidate.kind === "failure_tool" &&
        ["webui", "telegram", "slack", "discord", "google_chat"].includes(candidate.channel),
    )

    expect(failureScenarios).toHaveLength(5)
    for (const failureScenario of failureScenarios) {
      expect(failureScenario.request).toBe(
        '기능 ID "missing_capability"를 우선 사용해 그 기능의 health 상태를 확인해줘. 사용할 수 없다면 허용된 대체 경로를 검토하고, 확인할 수 없으면 실패 결과를 보고해.',
      )
      expect(failureScenario.request).not.toContain("현재 선택된 연장")
      expect(failureScenario.request).not.toContain("missing_extension_tool")
      expect(failureScenario.request).not.toBe("지원하지 않는 연장 기능을 실행해줘")
    }
  })

  it("fails traces that bypass root-run isolation or use provider-direct execution", () => {
    const webui = scenario("webui.basic_query")

    const result = validateChannelSmokeTrace(webui, {
      ...passingTrace(webui),
      requestFlow: {
        runId: "run-a",
        requestGroupId: "group-b",
        requestGroupMatchesRunId: false,
        decisionTracePresent: false,
        topologyRunCreated: false,
        providerDirectUsed: true,
      },
    })

    expect(result.status).toBe("failed")
    expect(result.failures).toEqual(expect.arrayContaining([
      "request_group_id_not_run_id",
      "decision_trace_missing",
      "provider_direct_used",
    ]))
  })

  it("fails action traces that omit the capability admission requirement and receipt", () => {
    const webui = scenario("webui.web_skill")
    const trace = passingTrace(webui)
    if (!trace.requestFlow) throw new Error("request flow required")
    delete trace.requestFlow.capabilityAdmissionRequired
    delete trace.requestFlow.capabilityAdmissionReceiptId

    const result = validateChannelSmokeTrace(webui, trace)

    expect(result.status).toBe("failed")
    expect(result.failures).toEqual(expect.arrayContaining([
      "capability_admission_requirement_missing",
      "capability_admission_receipt_missing",
    ]))
  })

  it("runs ready scenarios and records skip instead of failing missing external channels", async () => {
    const executeScenario = vi.fn(async (current: ChannelSmokeScenario) => passingTrace(current))
    const scenarios = [scenario("webui.basic_query"), scenario("slack.basic_query")]

    const results = await runChannelSmokeScenarios({
      config: configWithChannels(),
      scenarios,
      executeScenario,
    })

    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ status: "passed", auditLogId: "audit-webui.basic_query" })
    expect(results[1]).toMatchObject({ status: "skipped", reason: "slack_disabled" })
    expect(executeScenario).toHaveBeenCalledTimes(1)
  })

  it("redacts scenario execution failures before storing smoke reasons", async () => {
    const rawToken = "sk-smoke-secret-1234567890"
    const rawPath = "/Users/example/private/channel-smoke.json"
    const scenarios = [scenario("webui.basic_query")]

    const results = await runChannelSmokeScenarios({
      config: configWithChannels(),
      scenarios,
      executeScenario: async () => {
        throw new Error(`smoke failed token=${rawToken} path=${rawPath}`)
      },
    })
    const serialized = JSON.stringify(results)

    expect(results[0]).toMatchObject({
      status: "failed",
      failures: ["scenario_execution_failed"],
    })
    expect(results[0]?.reason).toContain("***")
    expect(results[0]?.reason).toContain("[internal-path-redacted]")
    expect(serialized).not.toContain(rawToken)
    expect(serialized).not.toContain(rawPath)
  })


  it("persists sanitized dry-run smoke results for later UI and CLI inspection", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "knowbee-channel-smoke-runner-"))
    closeDb()
    initializeTestDbRuntime(stateDir)

    try {
      const result = await runPersistedChannelSmokeScenarios({
        config: {
          ...structuredClone(DEFAULT_CONFIG),
          telegram: {
            enabled: true,
            botToken: "123456789:telegram-token",
            allowedUserIds: [42120565],
            allowedGroupIds: [],
          },
        },
        mode: "dry-run",
        scenarios: [scenario("telegram.artifact_delivery")],
        initiatedBy: "test-suite",
        metadata: { chatId: "42120565", botToken: "123456789:telegram-token" },
        executeScenario: createDryRunChannelSmokeExecutor({
          traceOverrides: {
            "telegram.artifact_delivery": {
              finalText: "sent to chat 42120565 with Bearer abcdefghijklmnop",
            },
          },
        }),
      })

      expect(result.status).toBe("passed")
      expect(JSON.stringify(result.results)).not.toContain("42120565")
      expect(JSON.stringify(result.results)).not.toContain("abcdefghijklmnop")
      const runs = listChannelSmokeRuns(5)
      expect(runs[0]).toMatchObject({ id: result.runId, status: "passed", initiated_by: "test-suite" })
      expect(runs[0]?.metadata_json).not.toContain("42120565")
      expect(runs[0]?.metadata_json).not.toContain("telegram-token")

      const steps = listChannelSmokeSteps(result.runId)
      expect(steps).toHaveLength(1)
      expect(steps[0]?.trace_json).not.toContain("42120565")
      expect(steps[0]?.trace_json).not.toContain("abcdefghijklmnop")
      expect(steps[0]?.trace_json).toContain("***")
    } finally {
      closeDb()
      rmSync(stateDir, { recursive: true, force: true })
    }
  })

  it("reconciles only prior Gateway-owned smoke runs after restart", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "knowbee-channel-smoke-recovery-"))
    closeDb()
    initializeTestDbRuntime(stateDir)

    try {
      insertChannelSmokeRun({
        id: "gateway-webui-old",
        mode: "live-run",
        status: "running",
        startedAt: 1_000,
        scenarioCount: 3,
        initiatedBy: "webui",
      })
      insertChannelSmokeRun({
        id: "gateway-release-old",
        mode: "live-run",
        status: "running",
        startedAt: 1_001,
        scenarioCount: 2,
        initiatedBy: "release-live-acceptance",
      })
      insertChannelSmokeRun({
        id: "cli-old",
        mode: "dry-run",
        status: "running",
        startedAt: 900,
        scenarioCount: 1,
        initiatedBy: "cli",
      })
      insertChannelSmokeRun({
        id: "gateway-current",
        mode: "live-run",
        status: "running",
        startedAt: 2_000,
        scenarioCount: 1,
        initiatedBy: "webui",
      })

      expect(recoverInterruptedGatewayChannelSmokeRuns({
        gatewayStartedAt: 2_000,
        recoveredAt: 2_100,
      })).toEqual({ recoveredCount: 2 })
      expect(getChannelSmokeRun("gateway-webui-old")).toMatchObject({
        status: "failed",
        finished_at: 2_100,
        scenario_count: 3,
        summary: "channel smoke failed: gateway_restart_interrupted",
      })
      expect(getChannelSmokeRun("gateway-release-old")?.status).toBe("failed")
      expect(getChannelSmokeRun("cli-old")?.status).toBe("running")
      expect(getChannelSmokeRun("gateway-current")?.status).toBe("running")
      expect(recoverInterruptedGatewayChannelSmokeRuns({
        gatewayStartedAt: 2_000,
        recoveredAt: 2_200,
      })).toEqual({ recoveredCount: 0 })
    } finally {
      closeDb()
      rmSync(stateDir, { recursive: true, force: true })
    }
  })
})
