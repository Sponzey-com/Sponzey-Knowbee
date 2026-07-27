import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { closeDb, listMessageLedgerEvents } from "../packages/core/src/db/index.js"
import { completeRunWithAssistantMessage } from "../packages/core/src/runs/finalization.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"
import { buildReviewedFinalResponse } from "./fixtures/final-response-review.ts"

const tempDirs: string[] = []

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task0145-finalization-speaker-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
}

function createFinalizationDependencies() {
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

beforeEach(() => {
  useTempState()
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0145 finalization speaker", () => {
  it("passes the explicit main agent name snapshot into final delivery ledger details", async () => {
    const dependencies = createFinalizationDependencies()
    await completeRunWithAssistantMessage({
      runId: "run:task0145",
      sessionId: "session:task0145",
      source: "webui",
      text: "요청한 작업을 완료했습니다.",
      textSource: "llm_reviewed",
      responseContext: {
        originalRequest: "요청한 작업을 완료해줘",
        model: "gpt-test",
        providerId: "openai",
        config: DEFAULT_CONFIG,
        workDir: "/tmp/project",
      },
      renderFinalResponseText: vi.fn(async (input) =>
        buildReviewedFinalResponse(input, "요청한 작업을 완료했습니다.")),
      speaker: {
        entityType: "knowbee",
        entityId: "agent:knowbee",
        agentNameSnapshot: "마당쇠",
      },
      onChunk: vi.fn().mockResolvedValue(undefined),
      dependencies,
    })

    const delivered = listMessageLedgerEvents({ runId: "run:task0145", limit: 100 }).find(
      (event) => event.event_kind === "final_answer_delivered",
    )
    const detail = JSON.parse(delivered?.detail_json ?? "{}") as {
      speaker?: Record<string, unknown>
    }

    expect(detail.speaker).toMatchObject({
      entityType: "knowbee",
      entityId: "agent:knowbee",
      agentNameSnapshot: "마당쇠",
    })
    expect(detail.speaker).not.toMatchObject({ agentNameSnapshot: "노비" })
  })
})
