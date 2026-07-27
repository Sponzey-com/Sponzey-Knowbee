import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { buildCanonicalResultReportFacts } from "../packages/core/src/contracts/canonical-result-report.ts"
import { completeRunWithAssistantMessage } from "../packages/core/src/runs/finalization.ts"
import { buildReviewedFinalResponse } from "./fixtures/final-response-review.ts"
import { createTestDbRuntimeFixture, type TestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

let dbRuntime: TestDbRuntimeFixture
beforeEach(() => { dbRuntime = createTestDbRuntimeFixture("terminal-report-finalization-") })
afterEach(() => { dbRuntime.dispose() })

function dependencies() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunSuccess: vi.fn(),
    rememberRunFailure: vi.fn(),
    deliveryDependencies: {
      now: () => 1,
      createId: () => "message-1",
      insertMessage: vi.fn(),
      emitStart: vi.fn(),
      emitStream: vi.fn(),
      emitEnd: vi.fn(),
      writeReplyLog: vi.fn(),
    },
  }
}

function partialFacts(runId: string) {
  return buildCanonicalResultReportFacts({
    goalId: `goal:${runId}`,
    workId: `work:root:${runId}`,
    outcome: "partial",
    primaryLanguage: "ko",
    completedScope: ["현재가"],
    unresolvedScope: ["거래량"],
    reasonCode: "source_unavailable",
    verifiedReasonFacts: ["거래량 소스가 응답하지 않았습니다."],
    evidenceRefs: ["evidence:quote:1"],
    nextActions: [{ kind: "user_action", text: "거래량 조회를 다시 시도하세요." }],
  })
}

describe("terminal report finalization gate", () => {
  it.each(["partial", "blocked", "exhausted"] as const)(
    "blocks %s before LLM rendering when canonical report facts are missing",
    async (canonicalFinalOutcome) => {
      const deps = dependencies()
      const renderFinalResponseText = vi.fn()
      const onChunk = vi.fn()
      const outcome = await completeRunWithAssistantMessage({
        runId: `run-missing-${canonicalFinalOutcome}`,
        sessionId: "session-1",
        text: "종료 결과",
        textSource: "runtime_deterministic",
        responseContext: {
          originalRequest: "결과를 알려줘",
          model: "gpt-test",
          providerId: "openai",
          config: DEFAULT_CONFIG,
          workDir: "/tmp/project",
        },
        renderFinalResponseText,
        source: "webui",
        onChunk,
        recordCanonicalDelivery: vi.fn(async () => ({ ok: true as const })),
        stageCanonicalPendingResponse: vi.fn(async () => ({ ok: true as const })),
        canonicalFinalOutcome,
        dependencies: deps,
      })

      expect(outcome).toEqual({ status: "blocked_by_canonical_delivery" })
      expect(renderFinalResponseText).not.toHaveBeenCalled()
      expect(onChunk).not.toHaveBeenCalled()
      expect(deps.appendRunEvent).toHaveBeenCalledWith(
        `run-missing-${canonicalFinalOutcome}`,
        "canonical_terminal_report_rejected:terminal_report_missing",
      )
    },
  )

  it("binds the public terminal facts to LLM review and pending replay", async () => {
    const runId = "run-valid-partial"
    const deps = dependencies()
    const renderFinalResponseText = vi.fn(async (input) =>
      buildReviewedFinalResponse(input, "부분 완료: 현재가. 미완료: 거래량. 거래량 소스가 응답하지 않았습니다. 거래량 조회를 다시 시도하세요."),
    )
    const stageCanonicalPendingResponse = vi.fn(async () => ({ ok: true as const }))

    const outcome = await completeRunWithAssistantMessage({
      runId,
      sessionId: "session-1",
      text: "일부 결과를 확인했습니다.",
      textSource: "runtime_deterministic",
      terminalReport: partialFacts(runId),
      responseContext: {
        originalRequest: "현재가와 거래량을 알려줘",
        model: "gpt-test",
        providerId: "openai",
        config: DEFAULT_CONFIG,
        workDir: "/tmp/project",
      },
      renderFinalResponseText,
      source: "webui",
      onChunk: vi.fn(async () => undefined),
      recordCanonicalDelivery: vi.fn(async () => ({ ok: true as const })),
      stageCanonicalPendingResponse,
      canonicalFinalOutcome: "partial",
      dependencies: deps,
    })

    expect(outcome).toEqual({ status: "completed" })
    expect(renderFinalResponseText).toHaveBeenCalledWith(expect.objectContaining({
      contentKind: "final_report",
      rawText: expect.stringContaining('"unresolvedScope":["거래량"]'),
    }))
    expect(stageCanonicalPendingResponse).toHaveBeenCalledWith(expect.objectContaining({
      finalOutcome: "partial",
      reviewEnvelope: expect.objectContaining({
        terminalReportFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      }),
    }))
  })

  it("blocks an LLM response that omits canonical unresolved scope and next action", async () => {
    const runId = "run-semantic-omission"
    const deps = dependencies()
    const onChunk = vi.fn()
    const outcome = await completeRunWithAssistantMessage({
      runId,
      sessionId: "session-1",
      text: "일부 결과",
      textSource: "runtime_deterministic",
      terminalReport: partialFacts(runId),
      responseContext: {
        originalRequest: "현재가와 거래량을 알려줘",
        model: "gpt-test",
        providerId: "openai",
        config: DEFAULT_CONFIG,
        workDir: "/tmp/project",
      },
      renderFinalResponseText: vi.fn(async (input) =>
        buildReviewedFinalResponse(input, "요청한 조회를 완료했습니다."),
      ),
      source: "webui",
      onChunk,
      recordCanonicalDelivery: vi.fn(async () => ({ ok: true as const })),
      stageCanonicalPendingResponse: vi.fn(async () => ({ ok: true as const })),
      canonicalFinalOutcome: "partial",
      dependencies: deps,
    })

    expect(outcome).toEqual({ status: "blocked_by_final_response_rendering" })
    expect(onChunk).not.toHaveBeenCalled()
    expect(deps.appendRunEvent).toHaveBeenCalledWith(
      runId,
      expect.stringContaining("canonical_terminal_report_response_rejected:"),
    )
    expect(deps.updateRunStatus).toHaveBeenCalledWith(
      runId,
      "failed",
      expect.any(String),
      false,
    )
  })

  it("repairs one terminal response that omits canonical facts", async () => {
    const runId = "run-semantic-repair"
    const deps = dependencies()
    const renderFinalResponseText = vi.fn(async (input) =>
      buildReviewedFinalResponse(
        input,
        renderFinalResponseText.mock.calls.length === 1
          ? "요청한 조회를 완료했습니다."
          : "부분 완료: 현재가. 미완료: 거래량. 거래량 소스가 응답하지 않았습니다. 거래량 조회를 다시 시도하세요.",
      ),
    )

    const outcome = await completeRunWithAssistantMessage({
      runId,
      sessionId: "session-1",
      text: "일부 결과",
      textSource: "runtime_deterministic",
      terminalReport: partialFacts(runId),
      responseContext: {
        originalRequest: "현재가와 거래량을 알려줘",
        model: "gpt-test",
        providerId: "openai",
        config: DEFAULT_CONFIG,
        workDir: "/tmp/project",
      },
      renderFinalResponseText,
      source: "webui",
      onChunk: vi.fn(async () => undefined),
      recordCanonicalDelivery: vi.fn(async () => ({ ok: true as const })),
      stageCanonicalPendingResponse: vi.fn(async () => ({ ok: true as const })),
      canonicalFinalOutcome: "partial",
      dependencies: deps,
    })

    expect(outcome).toEqual({ status: "completed" })
    expect(renderFinalResponseText).toHaveBeenCalledTimes(2)
    expect(renderFinalResponseText.mock.calls[1]?.[0].rawText).toContain(
      '"missingRequiredFragments":[{"field":"result","value":"부분"},{"field":"completedScope[0]","value":"현재가"},{"field":"unresolvedScope[0]","value":"거래량"},{"field":"verifiedReasonFacts[0]","value":"거래량 소스가 응답하지 않았습니다."},{"field":"nextActions[0]","value":"거래량 조회를 다시 시도하세요."}]',
    )
    expect(deps.appendRunEvent).toHaveBeenCalledWith(
      runId,
      expect.stringContaining("canonical_terminal_report_response_repair_requested:"),
    )
  })

  it.each(["cli", "webui", "telegram", "slack"] as const)(
    "delivers the same English blocked facts through the %s channel",
    async (source) => {
    const runId = `run-valid-blocked-${source}`
    const deps = dependencies()
    const terminalReport = buildCanonicalResultReportFacts({
      goalId: `goal:${runId}`,
      workId: `work:root:${runId}`,
      outcome: "blocked",
      primaryLanguage: "en",
      completedScope: [],
      unresolvedScope: ["Requested file update"],
      reasonCode: "permission_required",
      verifiedReasonFacts: ["File-write permission was denied."],
      evidenceRefs: ["evidence:permission:1"],
      nextActions: [{
        kind: "required_condition",
        text: "Grant file-write permission, then retry.",
      }],
    })
    const stageCanonicalPendingResponse = vi.fn(async () => ({ ok: true as const }))
    const outcome = await completeRunWithAssistantMessage({
      runId,
      sessionId: "session-1",
      text: "The request cannot continue.",
      textSource: "runtime_deterministic",
      terminalReport,
      responseContext: {
        originalRequest: "Update the file",
        model: "gpt-test",
        providerId: "openai",
        config: DEFAULT_CONFIG,
        workDir: "/tmp/project",
      },
      renderFinalResponseText: vi.fn(async (input) => buildReviewedFinalResponse(
        input,
        "Blocked: Requested file update. File-write permission was denied. Grant file-write permission, then retry.",
      )),
      source,
      onChunk: vi.fn(async (chunk) =>
        chunk.type === "done" && (source === "telegram" || source === "slack")
          ? {
              textDeliveries: [
                {
                  channel: source,
                  text: "Blocked: Requested file update. File-write permission was denied. Grant file-write permission, then retry.",
                  messageIds: ["terminal-report-1"],
                  deliveryReceipts: [
                    {
                      channelId: `${source}:primary`,
                      provider: source,
                      connectionId: `${source}:primary`,
                      target: { roomId: `${source}:terminal-report` },
                      status: "sent",
                      timestamp: 1,
                      idempotencyKey: `${source}:terminal-report:1`,
                      messageId: "terminal-report-1",
                    },
                  ],
                },
              ],
            }
          : undefined,
      ),
      recordCanonicalDelivery: vi.fn(async () => ({ ok: true as const })),
      stageCanonicalPendingResponse,
      canonicalFinalOutcome: "blocked",
      dependencies: deps,
    })

    expect(outcome).toEqual({ status: "completed" })
    expect(stageCanonicalPendingResponse).toHaveBeenCalledWith(expect.objectContaining({
      source,
      finalOutcome: "blocked",
      reviewEnvelope: expect.objectContaining({
        terminalReportFingerprint: expect.stringMatching(/^sha256:/u),
      }),
    }))
  })
})
