import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import {
  completeRunWithAssistantMessage,
  emitStandaloneAssistantMessage,
} from "../packages/core/src/runs/finalization.ts"
import { insertSession } from "../packages/core/src/db/index.js"
import { createRootRun } from "../packages/core/src/runs/store.js"
import { buildReviewedFinalResponse } from "./fixtures/final-response-review.ts"
import { createTestDbRuntimeFixture, type TestDbRuntimeFixture } from "./fixtures/runtime-db.ts"

let dbRuntime: TestDbRuntimeFixture

beforeEach(() => {
  dbRuntime = createTestDbRuntimeFixture("knowbee-final-response-redaction-")
})

afterEach(() => {
  dbRuntime.dispose()
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
      now: () => 0,
      createId: () => "message-1",
      insertMessage: vi.fn(),
      emitStart: vi.fn(),
      emitStream: vi.fn(),
      emitEnd: vi.fn(),
      writeReplyLog: vi.fn(),
    },
  }
}

function setupRun(runId: string, sessionId: string): void {
  insertSession({
    id: sessionId,
    source: "webui",
    source_id: sessionId,
    created_at: 0,
    updated_at: 0,
    summary: "redaction",
  })
  createRootRun({ id: runId, sessionId, prompt: "status", source: "webui" })
}

const responseContext = {
  originalRequest: "상태를 알려줘",
  model: "gpt-test",
  providerId: "openai",
  config: DEFAULT_CONFIG,
  workDir: "/tmp/project",
}

function successfulDeliveryChunkHandler() {
  return vi.fn(async (chunk: { type: string; delta?: string }) =>
    chunk.type === "done"
      ? {
          textDeliveries: [
            {
              channel: "webui" as const,
              text: "delivered",
              messageIds: ["message-1"],
              deliveryReceipts: [
                {
                  channelId: "webui:primary",
                  provider: "webui",
                  connectionId: "webui:primary",
                  target: { roomId: "webui:room" },
                  status: "sent" as const,
                  timestamp: 0,
                  idempotencyKey: "webui:message-1",
                  messageId: "message-1",
                },
              ],
            },
          ],
        }
      : undefined,
  )
}

describe("task078 final response Yeonjang redaction", () => {
  it("redacts internal Yeonjang evidence from final assistant delivery", async () => {
    setupRun("run:final-redaction", "session:final-redaction")
    const deps = dependencies()
    const renderedText =
      "yeonjang-goal-validation:mouse_click:candidate_not_validated:result_diagnosis_not_sufficient operationId=operation:run-078 receipt payload"

    const outcome = await completeRunWithAssistantMessage({
      runId: "run:final-redaction",
      sessionId: "session:final-redaction",
      text: "최종 응답 후보",
      textSource: "llm_reviewed",
      responseContext,
      renderFinalResponseText: vi.fn(async (input) => buildReviewedFinalResponse(input, renderedText)),
      source: "webui",
      onChunk: successfulDeliveryChunkHandler(),
      dependencies: deps,
    })

    expect(outcome.status).toBe("completed")
    const delivered = deps.deliveryDependencies.writeReplyLog.mock.calls[0]?.[1]
    expect(delivered).toBe("작업 결과를 확인하기 위해 추가 확인이 필요합니다.")
    expect(JSON.stringify(deps.deliveryDependencies.writeReplyLog.mock.calls)).not.toContain(
      "yeonjang-goal-validation",
    )
    expect(JSON.stringify(deps.deliveryDependencies.writeReplyLog.mock.calls)).not.toContain(
      "operationId",
    )
  })

  it("redacts internal Yeonjang evidence from standalone assistant delivery", async () => {
    setupRun("run:standalone-redaction", "session:standalone-redaction")
    const deps = dependencies()
    const renderedText =
      "yeonjang-goal-validation:screen_capture:candidate_not_validated:result_diagnosis_not_sufficient raw observed state"

    await emitStandaloneAssistantMessage({
      runId: "run:standalone-redaction",
      sessionId: "session:standalone-redaction",
      text: "확인 요청",
      textSource: "runtime_deterministic",
      responseContext,
      renderFinalResponseText: vi.fn(async (input) => buildReviewedFinalResponse(input, renderedText)),
      source: "webui",
      onChunk: successfulDeliveryChunkHandler(),
      dependencies: deps,
    })

    const delivered = deps.deliveryDependencies.writeReplyLog.mock.calls[0]?.[1]
    expect(delivered).toBe("작업 결과를 확인하기 위해 추가 확인이 필요합니다.")
    expect(JSON.stringify(deps.deliveryDependencies.writeReplyLog.mock.calls)).not.toContain(
      "yeonjang-goal-validation",
    )
    expect(JSON.stringify(deps.deliveryDependencies.writeReplyLog.mock.calls)).not.toContain(
      "raw observed state",
    )
  })
})
