import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type {
  ChannelSmokeRunResult,
  PersistedChannelSmokeRunResult,
} from "../packages/core/src/channels/smoke-runner.ts"
import { produceChannelLiveAcceptanceEvidence } from "../packages/core/src/release/channel-live-acceptance-evidence.ts"

function result(
  channel: "webui" | "telegram" | "slack" = "telegram",
  overrides: Partial<ChannelSmokeRunResult> = {},
): ChannelSmokeRunResult {
  return {
    scenario: {
      id: `${channel}.basic_query`,
      channel,
      kind: "basic_query",
      title: "Basic query",
      request: "private request",
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
    auditLogId: `audit-${channel}-152`,
    trace: {
      sourceChannel: channel,
      responseChannel: channel,
      requestFlow: {
        runId: `run-${channel}-152`,
        requestGroupId: `run-${channel}-152`,
        requestGroupMatchesRunId: true,
        decisionTracePresent: true,
        topologyRunCreated: true,
        providerDirectUsed: false,
      },
      auditLogId: `audit-${channel}-152`,
    },
    startedAt: 100,
    finishedAt: 200,
    ...overrides,
  }
}

function run(
  overrides: Partial<PersistedChannelSmokeRunResult> = {},
): PersistedChannelSmokeRunResult {
  return {
    runId: "smoke-run-152",
    mode: "live-run",
    status: "passed",
    startedAt: 100,
    finishedAt: 200,
    summary: "private summary",
    counts: { total: 3, passed: 3, failed: 0, skipped: 0 },
    results: [result("webui"), result("telegram"), result("slack")],
    ...overrides,
  }
}

describe("Task 152 channel live acceptance evidence producer", () => {
  it("produces bounded evidence for passed live basic-query results", () => {
    expect(produceChannelLiveAcceptanceEvidence(run())).toEqual({
      accepted: [
        expect.objectContaining({ capability: "webui", terminalStatus: "passed" }),
        expect.objectContaining({ capability: "telegram", terminalStatus: "passed" }),
        expect.objectContaining({ capability: "slack", terminalStatus: "passed" }),
      ],
      rejected: [],
    })
  })

  it.each([
    [run({ mode: "dry-run" }), "channel_smoke_not_live"],
    [
      run({ results: [result("telegram", { status: "failed" })] }),
      "channel_smoke_result_not_passed",
    ],
    [
      run({ results: [result("telegram", { auditLogId: undefined })] }),
      "channel_smoke_audit_missing",
    ],
    [
      run({
        results: [
          result("telegram", {
            trace: {
              sourceChannel: "slack",
              responseChannel: "telegram",
              auditLogId: "audit-telegram-152",
            },
          }),
        ],
      }),
      "channel_smoke_channel_mismatch",
    ],
    [
      run({
        results: [
          result("telegram", {
            trace: {
              sourceChannel: "telegram",
              responseChannel: "telegram",
              auditLogId: "audit-telegram-152",
              requestFlow: { providerDirectUsed: true },
            },
          }),
        ],
      }),
      "channel_smoke_provider_direct",
    ],
    [
      run({ results: [result("telegram"), result("telegram")] }),
      "channel_smoke_scenario_duplicate",
    ],
  ])("rejects invalid persisted results", (input, reasonCode) => {
    expect(produceChannelLiveAcceptanceEvidence(input).rejected).toContainEqual(
      expect.objectContaining({ reasonCode }),
    )
  })

  it("does not project requests, final text, trace payload, targets, or secrets", () => {
    const output = produceChannelLiveAcceptanceEvidence(
      run({
        results: [
          result("slack", {
            reason: "Bearer secret",
            trace: {
              sourceChannel: "slack",
              responseChannel: "slack",
              finalText: "private response",
              requestFlow: { providerDirectUsed: false },
            },
          }),
        ],
      }),
    )
    expect(JSON.stringify(output)).not.toMatch(
      /Bearer|secret|private|finalText|requestFlow|target/u,
    )
  })

  it("has no DB, provider, filesystem, network, process, or environment dependency", () => {
    const source = readFileSync(
      new URL("../packages/core/src/release/channel-live-acceptance-evidence.ts", import.meta.url),
      "utf8",
    )
    expect(source).not.toMatch(
      /process\.env|node:fs|db\/|from\s+["'][^"']*providers?|fetch\(|channels\/(?:telegram|slack)/u,
    )
  })
})
