import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { createCanonicalWorkAggregate } from "../packages/core/src/contracts/canonical-work-aggregate.ts"
import { buildCanonicalResultReportFacts } from "../packages/core/src/contracts/canonical-result-report.ts"
import { SqliteCanonicalPendingResponseRepository } from "../packages/core/src/db/canonical-pending-response-repository.ts"
import { SqliteCanonicalWorkRepository } from "../packages/core/src/db/canonical-work-repository.ts"
import { insertSession } from "../packages/core/src/db/index.js"
import { replayCanonicalPendingResponses } from "../packages/core/src/runs/canonical-pending-response-replay.ts"
import { completeRunWithAssistantMessage } from "../packages/core/src/runs/finalization.ts"
import { createRootRun } from "../packages/core/src/runs/store.ts"
import { buildReviewedFinalResponse } from "./fixtures/final-response-review.ts"
import { createTestDbRuntimeFixture, type TestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

let runtime: TestDbRuntimeFixture

beforeEach(() => {
  runtime = createTestDbRuntimeFixture("telegram-blocked-final-delivery-")
})

afterEach(() => {
  runtime.dispose()
})

function dependencies() {
  return {
    appendRunEvent: vi.fn(),
    setRunStepStatus: vi.fn(),
    updateRunStatus: vi.fn(),
    rememberRunSuccess: vi.fn(),
    rememberRunFailure: vi.fn(),
    onDeliveryError: vi.fn(),
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

function blockedFacts(runId: string) {
  return buildCanonicalResultReportFacts({
    goalId: `goal:${runId}`,
    workId: `work:root:${runId}`,
    outcome: "blocked",
    primaryLanguage: "en",
    completedScope: [],
    unresolvedScope: ["Requested work"],
    reasonCode: "approval_scope_missing",
    verifiedReasonFacts: [
      "Execution policy verification confirmed a blocking condition after safe alternatives were exhausted.",
    ],
    evidenceRefs: ["policy-decision:bounded-ref"],
    nextActions: [{
      kind: "required_condition",
      text: "Resolve the verified blocking condition before the request is reviewed again.",
    }],
  })
}

describe("Telegram blocked final delivery", () => {
  it("keeps a reviewed response pending after delivery failure and replays it exactly once", async () => {
    const runId = "run-blocked-delivery-failure"
    insertSession({
      id: "session-telegram",
      source: "telegram",
      source_id: "telegram:test",
      created_at: 1,
      updated_at: 1,
      summary: "test",
    })
    createRootRun({
      id: runId,
      sessionId: "session-telegram",
      prompt: "test request",
      source: "telegram",
    })
    new SqliteCanonicalWorkRepository(runtime.db, () => 1).create(
      createCanonicalWorkAggregate({
        workId: `work:root:${runId}`,
        rootRunId: runId,
      }),
    )
    const repository = new SqliteCanonicalPendingResponseRepository(runtime.db, () => 1)
    const recordCanonicalDelivery = vi.fn(async () => ({ ok: true as const }))
    const consumeCanonicalPendingResponse = vi.fn(async (targetRunId: string) => {
      const result = repository.markConsumed(targetRunId)
      return result.consumed
        ? { ok: true as const }
        : { ok: false as const, reasonCode: result.reasonCode }
    })

    const outcome = await completeRunWithAssistantMessage({
      runId,
      sessionId: "session-telegram",
      text: "verified blocked terminal facts",
      textSource: "runtime_deterministic",
      terminalReport: blockedFacts(runId),
      responseContext: {
        originalRequest: "Please answer the request.",
        model: "gpt-test",
        providerId: "openai",
        config: DEFAULT_CONFIG,
        workDir: "/tmp/project",
      },
      renderFinalResponseText: vi.fn(async (input) =>
        buildReviewedFinalResponse(
          input,
          "Requested work is blocked. Execution policy verification confirmed a blocking condition after safe alternatives were exhausted. Resolve the verified blocking condition before the request is reviewed again.",
        ),
      ),
      source: "telegram",
      onChunk: vi.fn(async () => {
        throw new Error("telegram transport unavailable")
      }),
      recordCanonicalDelivery,
      stageCanonicalPendingResponse: async (input) => {
        const result = repository.stage(input)
        return result.staged
          ? { ok: true as const }
          : { ok: false as const, reasonCode: result.reasonCode }
      },
      consumeCanonicalPendingResponse,
      canonicalFinalOutcome: "blocked",
      dependencies: dependencies(),
    })

    expect(outcome).toEqual({ status: "blocked_by_delivery" })
    expect(recordCanonicalDelivery).not.toHaveBeenCalled()
    const pending = repository.loadPending(runId)
    expect(pending).toMatchObject({
      runId,
      source: "telegram",
      finalOutcome: "blocked",
      status: "pending",
      reviewEnvelope: {
        terminalReportFingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      },
    })
    expect(JSON.stringify(pending)).not.toContain("policy-decision:bounded-ref")

    const commitDelivery = vi.fn(async () => ({
      status: "delivered" as const,
      deliveryKey: "delivery-key",
      idempotencyKey: "idempotency-key",
      text: pending?.text ?? "",
      attributions: [],
      reasonCodes: [],
    }))
    const replay = await replayCanonicalPendingResponses({
      listPending: () => repository.listPending(),
      loadAggregate: () => ({
        workId: `work:root:${runId}`,
        rootRunId: runId,
        state: "BLOCKED",
        revision: 2,
        transitions: [],
      }),
      findCommittedDelivery: () => undefined,
      commitDelivery,
      recordCanonicalDelivery: async () => ({ ok: true }),
      consume: (targetRunId) => repository.markConsumed(targetRunId),
    })

    expect(replay).toEqual([{
      runId,
      status: "recovered",
      reasonCode: "canonical_replay_delivery_recovered",
    }])
    expect(commitDelivery).toHaveBeenCalledOnce()
    expect(repository.listPending()).toEqual([])
  })

  it("does not stage or deliver when the LLM renderer fails", async () => {
    const stageCanonicalPendingResponse = vi.fn(async () => ({ ok: true as const }))
    const onChunk = vi.fn()

    const outcome = await completeRunWithAssistantMessage({
      runId: "run-render-failure",
      sessionId: "session-telegram",
      text: "verified blocked terminal facts",
      textSource: "runtime_deterministic",
      terminalReport: blockedFacts("run-render-failure"),
      responseContext: {
        originalRequest: "Please answer the request.",
        model: "gpt-test",
        providerId: "openai",
        config: DEFAULT_CONFIG,
        workDir: "/tmp/project",
      },
      renderFinalResponseText: vi.fn(async () => {
        throw new Error("provider unavailable")
      }),
      source: "telegram",
      onChunk,
      recordCanonicalDelivery: vi.fn(async () => ({ ok: true as const })),
      stageCanonicalPendingResponse,
      canonicalFinalOutcome: "blocked",
      dependencies: dependencies(),
    })

    expect(outcome).toEqual({ status: "blocked_by_final_response_rendering" })
    expect(stageCanonicalPendingResponse).not.toHaveBeenCalled()
    expect(onChunk).not.toHaveBeenCalled()
  })
})
