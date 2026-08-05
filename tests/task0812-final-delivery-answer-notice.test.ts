import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  closeDb,
  insertSession,
  listMessageLedgerEvents,
} from "../packages/core/src/db/index.js"
import { commitFinalDelivery as commitFinalDeliveryWithGate } from "../packages/core/src/runs/channel-finalizer.ts"
import { buildLlmResponseReviewReceipt } from "../packages/core/src/runs/user-facing-response-gate.ts"
import { buildFinalAnswerNotice } from "../packages/core/src/runs/final-answer-notice.ts"
import { createRootRun } from "../packages/core/src/runs/store.ts"
import { createTestRuntimeConfigFixture } from "./fixtures/runtime-config.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

function commitFinalDelivery(input: Parameters<typeof commitFinalDeliveryWithGate>[0]) {
  const rawText = `review-input:${input.text}`
  return commitFinalDeliveryWithGate({
    ...input,
    responseReview: {
      rawText,
      rawTextSource: "llm_generated",
      contentKind: "final_report",
      expectedLanguage: "unknown",
      receipt: buildLlmResponseReviewReceipt({
        rawText,
        responseText: input.text,
        rawTextSource: "llm_generated",
        contentKind: "final_report",
      }),
    },
  })
}

function useTempState(): void {
  closeDb()
  const rootDir = mkdtempSync(join(tmpdir(), "knowbee-task0812-final-answer-notice-"))
  tempDirs.push(rootDir)
  const runtimeFixture = createTestRuntimeConfigFixture({ rootDir })
  initializeTestDbRuntime(runtimeFixture.paths.stateDir)
}

function setupRun(): void {
  insertSession({
    id: "session:task0812",
    source: "webui",
    source_id: "session:task0812",
    created_at: 0,
    updated_at: 0,
    summary: "task0812",
  })
  createRootRun({
    id: "run:task0812",
    sessionId: "session:task0812",
    requestGroupId: "group:task0812",
    prompt: "task0812 final answer notice",
    source: "webui",
  })
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

describe("task0812 final delivery answer notice", () => {
  it("builds final answer notice metadata", () => {
    expect(buildFinalAnswerNotice({
      speaker: {
        entityType: "knowbee",
        entityId: "agent:knowbee",
        agentName: "마당쇠",
        agentNameSnapshot: "마당쇠",
      },
      attributionCount: 1.8,
    })).toEqual({
      kind: "final_answer",
      deliveryMode: "final",
      textSource: "final_answer_notice",
      finalAnswer: true,
      assistantIdentityClaim: false,
      speakerAgentName: "마당쇠",
      attributionCount: 1,
    })
  })

  it("records final answer notice in generated and delivered ledger details", async () => {
    setupRun()

    const result = await commitFinalDelivery({
      parentRunId: "run:task0812",
      sessionId: "session:task0812",
      source: "webui",
      text: "요청한 작업을 완료했습니다.",
      onChunk: async () => undefined,
      speaker: {
        entityType: "knowbee",
        entityId: "agent:knowbee",
        agentNameSnapshot: "마당쇠",
      },
      deliveryDependencies: { writeReplyLog: () => undefined },
    })

    expect(result.status).toBe("delivered")
    const events = listMessageLedgerEvents({ runId: "run:task0812", limit: 100 })
    const generated = events.find((event) => event.event_kind === "final_answer_generated")
    const delivered = events.find((event) => event.event_kind === "final_answer_delivered")
    const generatedDetail = JSON.parse(generated?.detail_json ?? "{}")
    const deliveredDetail = JSON.parse(delivered?.detail_json ?? "{}")

    expect(generatedDetail.finalAnswerNotice).toMatchObject({
      kind: "final_answer",
      textSource: "final_answer_notice",
      finalAnswer: true,
      assistantIdentityClaim: false,
      speakerAgentName: "마당쇠",
      attributionCount: 0,
    })
    expect(deliveredDetail.finalAnswerNotice).toMatchObject({
      kind: "final_answer",
      deliveryMode: "final",
      finalAnswer: true,
      speakerAgentName: "마당쇠",
    })
  })

  it("uses the explicit root agent name snapshot when speaker is omitted", async () => {
    setupRun()

    const result = await commitFinalDelivery({
      parentRunId: "run:task0812",
      sessionId: "session:task0812",
      source: "webui",
      text: "요청한 작업을 완료했습니다.",
      onChunk: async () => undefined,
      rootAgentNameSnapshot: "마당쇠",
      deliveryDependencies: { writeReplyLog: () => undefined },
    })

    expect(result.status).toBe("delivered")
    const delivered = listMessageLedgerEvents({ runId: "run:task0812", limit: 100 })
      .find((event) => event.event_kind === "final_answer_delivered")
    const detail = JSON.parse(delivered?.detail_json ?? "{}")

    expect(detail.speaker).toMatchObject({
      entityType: "knowbee",
      entityId: "agent:knowbee",
      agentName: "마당쇠",
      agentNameSnapshot: "마당쇠",
    })
    expect(detail.finalAnswerNotice).toMatchObject({
      speakerAgentName: "마당쇠",
    })
  })
})
