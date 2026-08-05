import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { emitStandaloneAssistantMessage } from "../packages/core/src/runs/finalization.ts"
import { buildReviewedFinalResponse } from "./fixtures/final-response-review.ts"
import { createTestDbRuntimeFixture, type TestDbRuntimeFixture } from "./fixtures/runtime-db.ts"
import { insertSession } from "../packages/core/src/db/index.js"
import { createRootRun } from "../packages/core/src/runs/store.js"

let dbRuntime: TestDbRuntimeFixture

beforeEach(() => { dbRuntime = createTestDbRuntimeFixture("knowbee-standalone-gate-") })
afterEach(() => { dbRuntime.dispose() })

function setupRun(runId: string, sessionId: string): void {
  insertSession({
    id: sessionId,
    source: "webui",
    source_id: sessionId,
    created_at: 0,
    updated_at: 0,
    summary: "standalone gate",
  })
  createRootRun({ id: runId, sessionId, prompt: "status", source: "webui" })
}

function dependencies() {
  return {
    appendRunEvent: vi.fn(),
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

const responseContext = {
  originalRequest: "진행 상태를 알려줘",
  model: "gpt-test",
  providerId: "openai",
  config: DEFAULT_CONFIG,
  workDir: "/tmp/project",
}

describe("standalone delivery LLM receipt gate", () => {
  it("blocks a text-only renderer result without an exact review receipt", async () => {
    setupRun("run:standalone-unreviewed", "session:standalone-unreviewed")
    const deps = dependencies()
    const onChunk = vi.fn()
    await emitStandaloneAssistantMessage({
      runId: "run:standalone-unreviewed",
      sessionId: "session:standalone-unreviewed",
      text: "진행 중입니다.",
      textSource: "runtime_deterministic",
      responseContext,
      renderFinalResponseText: vi.fn(async () => ({ text: "요청을 처리하고 있습니다." }) as never),
      source: "webui",
      onChunk,
      dependencies: deps,
    })

    expect(onChunk).not.toHaveBeenCalled()
    expect(deps.deliveryDependencies.insertMessage).not.toHaveBeenCalled()
    expect(deps.appendRunEvent).toHaveBeenCalledWith(
      "run:standalone-unreviewed",
      "user_facing_standalone_delivery_blocked:review_receipt_missing",
    )
  })

  it("delivers the exact reviewed standalone response", async () => {
    setupRun("run:standalone-reviewed", "session:standalone-reviewed")
    const deps = dependencies()
    const onChunk = vi.fn(async () => undefined)
    await emitStandaloneAssistantMessage({
      runId: "run:standalone-reviewed",
      sessionId: "session:standalone-reviewed",
      text: "진행 중입니다.",
      textSource: "llm_reviewed",
      responseContext,
      renderFinalResponseText: vi.fn(async (input) =>
        buildReviewedFinalResponse(input, "요청을 처리하고 있습니다.")),
      source: "webui",
      onChunk,
      dependencies: deps,
    })

    expect(onChunk).toHaveBeenCalled()
    expect(deps.deliveryDependencies.writeReplyLog).toHaveBeenCalledWith(
      "webui",
      "요청을 처리하고 있습니다.",
    )
  })
})
