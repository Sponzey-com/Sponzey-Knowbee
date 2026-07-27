import { describe, expect, it } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  buildConversationProcessReleaseEvidence,
} from "../packages/core/src/release/conversation-process-release-evidence.ts"
import type {
  ChannelSmokeScenarioKind,
  PersistedChannelSmokeRunResult,
} from "../packages/core/src/channels/smoke-runner.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import { buildReleaseManifest } from "../packages/core/src/release/package.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"

const BUILD = "a4e167c018979a878fa85ea3222093bef7f96c3c"
const KINDS: ChannelSmokeScenarioKind[] = [
  "basic_query",
  "web_skill",
  "approval_required_tool",
  "artifact_delivery",
  "failure_tool",
]

function liveRun(
  channel: "webui" | "telegram",
  overrides: Partial<PersistedChannelSmokeRunResult> = {},
): PersistedChannelSmokeRunResult {
  const results = KINDS.map((kind, index) => ({
    scenario: {
      id: `${channel}.${kind}`,
      channel,
      kind,
      title: "private title",
      request: "private request with Bearer hidden-token",
      expectedTarget: channel,
      correlationKey:
        channel === "webui" ? "webui_run_id" as const : "telegram_chat_thread" as const,
      requiresExternalCredential: channel === "telegram",
      releaseGate: "automated" as const,
    },
    status: "passed" as const,
    failures: [],
    auditLogId: `audit:${channel}:${kind}`,
    trace: {
      sourceChannel: channel,
      responseChannel: channel,
      correlationKey:
        channel === "webui" ? "webui_run_id" as const : "telegram_chat_thread" as const,
      requestFlow: {
        runId: `run:${channel}:${index}`,
        requestGroupId: `run:${channel}:${index}`,
        requestGroupMatchesRunId: true,
        decisionTracePresent: true,
        requestDiagnosisReceiptId: `diagnosis:${channel}:${kind}`,
        solutionPlanReceiptId: `plan:${channel}:${kind}`,
        resultReviewReceiptId: `review:${channel}:${kind}`,
        finalResponseReceiptId: `final-response:${channel}:${kind}`,
        decisionReceiptOrderValid: true,
        topologyRunCreated: true,
        providerDirectUsed: false,
      },
      finalization: {
        rootOwnerFinalized: true,
        finalAnswerCount: 1,
      },
      finalDelivery: {
        delivered: true,
        targetChannel: channel,
        correlationKey:
          channel === "webui" ? "webui_run_id" as const : "telegram_chat_thread" as const,
        receiptRef: `delivery:${channel}:${kind}`,
        userVisible: true,
      },
      auditLogId: `audit:${channel}:${kind}`,
      finalText: "private response",
    },
    startedAt: 100 + index,
    finishedAt: 200 + index,
  }))
  return {
    runId: `smoke:${channel}`,
    mode: "live-run",
    status: "passed",
    startedAt: 100,
    finishedAt: 204,
    summary: "private summary",
    counts: { total: 5, passed: 5, failed: 0, skipped: 0 },
    results,
    ...overrides,
  }
}

describe("conversation process release evidence", () => {
  it("projects a checksummed bounded summary for five WebUI and five Telegram scenarios", () => {
    const evidence = buildConversationProcessReleaseEvidence({
      candidates: [
        { buildIdentity: BUILD, run: liveRun("webui") },
        { buildIdentity: BUILD, run: liveRun("telegram") },
      ],
      expectedBuildIdentity: BUILD,
      now: 300,
      maxAgeMs: 1_000,
    })

    expect(evidence).toMatchObject({
      schemaVersion: 1,
      status: "passed",
      buildIdentity: BUILD,
      scenarioCount: 10,
      channels: [
        { channel: "telegram", passedCount: 5 },
        { channel: "webui", passedCount: 5 },
      ],
      blockers: [],
    })
    expect(evidence.checksum).toMatch(/^[a-f0-9]{64}$/u)
    expect(JSON.stringify(evidence)).not.toMatch(
      /private|Bearer|trace|request|response|target|chat|run:/u,
    )
  })

  it.each([
    {
      name: "fixture",
      candidates: [
        { buildIdentity: BUILD, run: { ...liveRun("webui"), mode: "dry-run" as const } },
        { buildIdentity: BUILD, run: liveRun("telegram") },
      ],
      blocker: "run_not_live:webui",
    },
    {
      name: "skipped",
      candidates: [
        {
          buildIdentity: BUILD,
          run: {
            ...liveRun("webui"),
            counts: { total: 5, passed: 4, failed: 0, skipped: 1 },
          },
        },
        { buildIdentity: BUILD, run: liveRun("telegram") },
      ],
      blocker: "required_scenario_not_passed:webui",
    },
    {
      name: "stale",
      candidates: [
        { buildIdentity: BUILD, run: liveRun("webui", { finishedAt: 1 }) },
        { buildIdentity: BUILD, run: liveRun("telegram") },
      ],
      blocker: "run_stale:webui",
    },
    {
      name: "build mismatch",
      candidates: [
        { buildIdentity: "b".repeat(40), run: liveRun("webui") },
        { buildIdentity: BUILD, run: liveRun("telegram") },
      ],
      blocker: "build_identity_mismatch:webui",
    },
  ])("blocks $name evidence", ({ candidates, blocker }) => {
    const evidence = buildConversationProcessReleaseEvidence({
      candidates,
      expectedBuildIdentity: BUILD,
      now: 300,
      maxAgeMs: 100,
    })
    expect(evidence.status).toBe("blocked")
    expect(evidence.blockers).toContain(blocker)
  })

  it("adds the bounded summary without widening basic-query channel admission", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "knowbee-conversation-release-"))
    try {
      const runtime = createTestRuntimeConfigFixture({ rootDir })
      const candidates = [
        { buildIdentity: BUILD, run: liveRun("webui") },
        { buildIdentity: BUILD, run: liveRun("telegram") },
      ]
      const manifest = buildReleaseManifest({
        rootDir,
        runtimePaths: runtime.paths,
        gitCommit: BUILD,
        targetPlatforms: [],
        channelLiveSmokeRuns: candidates.map((candidate) => candidate.run),
        conversationProcessLiveCandidates: candidates,
        conversationProcessMaxAgeMs: 1_000,
        now: new Date(300),
      })

      expect(manifest.channelLiveAcceptanceProduction.acceptedCount).toBe(2)
      expect(manifest.conversationProcessEvidence).toMatchObject({
        status: "passed",
        scenarioCount: 10,
        buildIdentity: BUILD,
      })
      expect(JSON.stringify(manifest.conversationProcessEvidence)).not.toMatch(
        /private|Bearer|trace|request|response|target|chat|run:/u,
      )
    } finally {
      closeDb()
      rmSync(rootDir, { recursive: true, force: true })
    }
  })
})
