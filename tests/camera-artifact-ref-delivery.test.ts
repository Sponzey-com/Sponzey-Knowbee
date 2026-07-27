import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it, vi } from "vitest"
import {
  createArtifactStorageContextFromRoot,
  recordArtifactMetadata,
} from "../packages/core/src/artifacts/lifecycle.ts"
import { createTelegramChunkDeliveryHandler } from "../packages/core/src/channels/telegram/chunk-delivery.ts"
import { telegramSendFileTool } from "../packages/core/src/tools/builtin/telegram-send.ts"
import type { ToolContext } from "../packages/core/src/tools/types.ts"
import { closeDb } from "../packages/core/src/db/index.ts"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const stateDir = join(tmpdir(), `knowbee-camera-artifact-ref-${process.pid}`)
mkdirSync(stateDir, { recursive: true })
initializeTestDbRuntime(stateDir)
const artifactStorage = createArtifactStorageContextFromRoot(join(stateDir, "artifacts"))

afterAll(() => {
  closeDb()
  rmSync(stateDir, { recursive: true, force: true })
})

describe("camera artifact ref delivery", () => {
  it("resolves a run-bound opaque ref only inside the Telegram delivery boundary", async () => {
    const filePath = join(artifactStorage.rootDir, "yeonjang", "camera.jpg")
    mkdirSync(join(artifactStorage.rootDir, "yeonjang"), { recursive: true })
    writeFileSync(filePath, "camera-bytes")
    const artifactRef = `artifact:${recordArtifactMetadata({
      artifactPath: filePath,
      ownerChannel: "telegram",
      sourceRunId: "run-camera-ref",
      requestGroupId: "request-camera-ref",
      mimeType: "image/jpeg",
      sizeBytes: 12,
      dataClassification: "user",
    }, artifactStorage)}`
    const context: ToolContext = {
      artifactStorage,
      sessionId: "session-camera-ref",
      runId: "run-camera-ref",
      requestGroupId: "request-camera-ref",
      workDir: process.cwd(),
      userMessage: "방금 찍은 사진을 텔레그램으로 보내줘",
      source: "telegram",
      allowWebAccess: false,
      securityConfig: {
        ...DEFAULT_CONFIG.security,
        allowedPaths: [stateDir],
      },
      onProgress: vi.fn(),
      signal: new AbortController().signal,
    }

    const toolResult = await telegramSendFileTool.execute({ artifactRef }, context)

    expect(toolResult).toMatchObject({
      success: true,
      details: {
        kind: "artifact_delivery",
        channel: "telegram",
        artifactRef,
        mimeType: "image/jpeg",
      },
    })
    expect(toolResult.details).not.toHaveProperty("filePath")
    expect(JSON.stringify(toolResult)).not.toContain(filePath)

    const responder = {
      sendToolStatus: vi.fn(),
      updateToolStatus: vi.fn(),
      clearToolStatus: vi.fn(),
      sendFile: vi.fn().mockResolvedValue(101),
      sendFinalResponse: vi.fn().mockResolvedValue([]),
      sendError: vi.fn(),
    }
    const onChunk = createTelegramChunkDeliveryHandler({
      artifactStorage,
      responder,
      sessionId: "session-camera-ref",
      chatId: 42120565,
      getRunId: () => "run-camera-ref",
      recordOutgoingMessageRef: vi.fn(),
      logError: vi.fn(),
    })

    const receipt = await onChunk?.({
      type: "tool_end",
      toolName: "telegram_send_file",
      success: true,
      output: toolResult.output,
      details: toolResult.details,
    })

    expect(responder.sendFile).toHaveBeenCalledWith(filePath, undefined)
    expect(receipt).toMatchObject({
      artifactDeliveries: [{
        toolName: "telegram_send_file",
        channel: "telegram",
        filePath,
      }],
    })
  })

  it("rejects an artifact ref from another run and request group", async () => {
    const filePath = join(artifactStorage.rootDir, "yeonjang", "other.jpg")
    writeFileSync(filePath, "other-camera")
    const artifactRef = `artifact:${recordArtifactMetadata({
      artifactPath: filePath,
      ownerChannel: "telegram",
      sourceRunId: "run-other",
      requestGroupId: "request-other",
      mimeType: "image/jpeg",
      sizeBytes: 12,
      dataClassification: "user",
    }, artifactStorage)}`

    const result = await telegramSendFileTool.execute({ artifactRef }, {
      artifactStorage,
      sessionId: "session-camera-ref",
      runId: "run-camera-ref",
      requestGroupId: "request-camera-ref",
      workDir: process.cwd(),
      userMessage: "사진을 보내줘",
      source: "telegram",
      allowWebAccess: false,
      securityConfig: {
        ...DEFAULT_CONFIG.security,
        allowedPaths: [stateDir],
      },
      onProgress: vi.fn(),
      signal: new AbortController().signal,
    })

    expect(result).toMatchObject({
      success: false,
      error: "ARTIFACT_REF_SCOPE_MISMATCH",
    })
  })
})
