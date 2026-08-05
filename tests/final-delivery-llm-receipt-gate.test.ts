import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { closeDb, insertSession } from "../packages/core/src/db/index.js"
import { commitFinalDelivery } from "../packages/core/src/runs/channel-finalizer.ts"
import { createRootRun } from "../packages/core/src/runs/store.ts"
import { buildLlmResponseReviewReceipt } from "../packages/core/src/runs/user-facing-response-gate.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

let stateDir = ""

beforeEach(() => {
  closeDb()
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-final-llm-gate-"))
  initializeTestDbRuntime(stateDir)
})

afterEach(() => {
  closeDb()
  if (stateDir) rmSync(stateDir, { recursive: true, force: true })
})

describe("final delivery LLM receipt gate", () => {
  it("blocks final channel delivery when the LLM review receipt is missing", async () => {
    setupRun("run:missing-receipt", "session:missing-receipt")
    const onChunk = vi.fn()
    const result = await commitFinalDelivery({
      parentRunId: "run:missing-receipt",
      sessionId: "session:missing-receipt",
      source: "webui",
      text: "결정론적으로 만든 최종 문구",
      onChunk,
    })

    expect(result.status).toBe("blocked")
    expect(result.reasonCodes).toContain("final_llm_review_receipt_required")
    expect(onChunk).not.toHaveBeenCalled()
  })

  it("delivers only the exact response bound to an LLM review receipt", async () => {
    setupRun("run:valid-receipt", "session:valid-receipt")
    setupRun("run:mismatch-receipt", "session:mismatch-receipt")
    const rawText = "검토된 사실 요약"
    const responseText = "요청하신 결과를 확인했습니다."
    const receipt = buildLlmResponseReviewReceipt({
      rawText,
      responseText,
      rawTextSource: "runtime_deterministic",
      contentKind: "final_report",
    })
    const result = await commitFinalDelivery({
      parentRunId: "run:valid-receipt",
      sessionId: "session:valid-receipt",
      source: "webui",
      text: responseText,
      onChunk: async () => undefined,
      responseReview: {
        rawText,
        rawTextSource: "runtime_deterministic",
        contentKind: "final_report",
        expectedLanguage: "ko",
        receipt,
      },
    })
    expect(result.status).toBe("delivered")

    const mismatch = await commitFinalDelivery({
      parentRunId: "run:mismatch-receipt",
      sessionId: "session:mismatch-receipt",
      source: "webui",
      text: `${responseText} 변조`,
      onChunk: async () => undefined,
      responseReview: {
        rawText,
        rawTextSource: "runtime_deterministic",
        contentKind: "final_report",
        expectedLanguage: "ko",
        receipt,
      },
    })
    expect(mismatch.status).toBe("blocked")
    expect(mismatch.reasonCodes).toContain("final_llm_review_content_mismatch")
  })
})

function setupRun(runId: string, sessionId: string): void {
  insertSession({
    id: sessionId,
    source: "webui",
    source_id: sessionId,
    created_at: 1,
    updated_at: 1,
    summary: "final receipt gate",
  })
  createRootRun({
    id: runId,
    sessionId,
    requestGroupId: `group:${runId}`,
    prompt: "final receipt gate",
    source: "webui",
  })
}
