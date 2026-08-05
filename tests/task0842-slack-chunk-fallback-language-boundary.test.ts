import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  buildSlackArtifactFallbackNotice,
  createSlackChunkDeliveryHandler,
} from "../packages/core/src/channels/slack/chunk-delivery.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import { resetArtifactDeliveryDedupeForTest } from "../packages/core/src/runs/delivery.js"
import { buildLlmResponseReviewReceipt } from "../packages/core/src/runs/user-facing-response-gate.ts"
import { createTestArtifactStorage } from "./fixtures/artifact-storage.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []
let artifactStorage: ReturnType<typeof createTestArtifactStorage>

function createPassThroughNoticeRendering() {
  return {
    config: DEFAULT_CONFIG,
    workDir: process.cwd(),
    getDefaultModel: () => "test-model",
    renderFinalResponseText: vi.fn(async (input) => ({
      text: input.rawText,
      textSource: "llm_reviewed",
      promptSourceId: "final_response",
      rawTextSource: input.textSource,
      reviewReceipt: buildLlmResponseReviewReceipt({
        rawText: input.rawText,
        responseText: input.rawText,
        rawTextSource: input.textSource,
        contentKind: input.contentKind ?? "fixed_notice",
      }),
    })),
  }
}

function useTempState(): void {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task0842-slack-chunk-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
  artifactStorage = createTestArtifactStorage(stateDir)
}

beforeEach(() => {
  useTempState()
})

afterEach(() => {
  resetArtifactDeliveryDedupeForTest()
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0842 Slack chunk fallback language boundary", () => {
  it("builds English Slack artifact fallback notices as non-final diagnostics", () => {
    expect(
      buildSlackArtifactFallbackNotice({
        fileName: "capture.png",
        caption: "Capture result",
        downloadUrl: "http://127.0.0.1:18888/artifacts/capture.png",
        language: "en",
      }),
    ).toEqual({
      kind: "slack_chunk_fallback",
      reason: "artifact_upload_failed",
      language: "en",
      deliveryMode: "diagnostic",
      textSource: "slack_chunk_fallback_notice",
      renderingRequired: "llm_final_response",
      finalAnswer: false,
      assistantIdentityClaim: false,
      text: [
        "File upload failed, so a download link is provided in this Slack thread instead.",
        "- File: Capture result",
        "- Download: http://127.0.0.1:18888/artifacts/capture.png",
      ].join("\n"),
    })
  })

  it("uses English artifact fallback text when Slack file upload fails", async () => {
    const responder = {
      sendToolStatus: vi.fn(),
      updateToolStatus: vi.fn(),
      sendFile: vi.fn().mockRejectedValue(new Error("upload failed")),
      sendFinalResponse: vi.fn().mockResolvedValue(["slack-fallback-ts"]),
      sendError: vi.fn(),
    }
    const onChunk = createSlackChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "slack-session",
      channelId: "C_SLACK",
      threadTs: "thread-task0842",
      language: "en",
      getRunId: () => "run-slack-task0842",
      recordOutgoingMessageRef: vi.fn(),
      logError: vi.fn(),
    })

    const receipt = await onChunk?.({
      type: "tool_end",
      toolName: "screen_capture",
      success: true,
      output: "sent",
      details: {
        kind: "artifact_delivery",
        channel: "slack",
        filePath: "/tmp/task0842-capture.png",
        caption: "Capture result",
        size: 123,
        source: "slack",
      },
    })

    expect(responder.sendFinalResponse).toHaveBeenCalledWith(
      expect.stringContaining("File upload failed"),
    )
    expect(responder.sendFinalResponse.mock.calls[0]?.[0]).toContain("- File: Capture result")
    expect(responder.sendFinalResponse.mock.calls[0]?.[0]).not.toContain("파일 업로드")
    expect(receipt).toMatchObject({
      textDeliveries: [
        {
          channel: "slack",
          text: expect.stringContaining("File upload failed"),
          messageIds: ["slack-fallback-ts"],
        },
      ],
    })
  })

  it("passes English language into Slack chunk error notices", async () => {
    const responder = {
      sendToolStatus: vi.fn(),
      updateToolStatus: vi.fn(),
      sendFile: vi.fn(),
      sendFinalResponse: vi.fn(),
      sendError: vi.fn().mockResolvedValue("slack-error-ts"),
    }
    const onChunk = createSlackChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "slack-session",
      channelId: "C_SLACK",
      threadTs: "thread-error-task0842",
      language: "en",
      noticeRendering: createPassThroughNoticeRendering(),
      getRunId: () => "run-slack-error-task0842",
      recordOutgoingMessageRef: vi.fn(),
      logError: vi.fn(),
    })

    await onChunk?.({ type: "error", message: "provider failed" })

    expect(responder.sendError).toHaveBeenCalledWith(
      "Channel execution failed. Reason: provider failed",
    )
  })
})
