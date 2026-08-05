import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createWebUiChunkDeliveryHandler } from "../packages/core/src/api/ws/chunk-delivery.ts"
import { recordArtifactMetadata } from "../packages/core/src/artifacts/lifecycle.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import { eventBus, type KnowbeeEvents } from "../packages/core/src/events/index.js"
import { resetArtifactDeliveryDedupeForTest } from "../packages/core/src/runs/delivery.js"
import { createTestArtifactStorage } from "./fixtures/artifact-storage.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []
let artifactStorage: ReturnType<typeof createTestArtifactStorage>

beforeEach(() => {
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-webui-chunk-delivery-"))
  tempDirs.push(stateDir)
  artifactStorage = createTestArtifactStorage(stateDir)
  initializeTestDbRuntime(stateDir)
})

afterEach(() => {
  closeDb()
  resetArtifactDeliveryDedupeForTest()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("webui chunk delivery helper", () => {
  it("does not convert unreviewed AI text chunks into WebUI text delivery", async () => {
    const onChunk = createWebUiChunkDeliveryHandler({
      artifactStorage,
      sessionId: "session-unreviewed-text",
      runId: "run-unreviewed-text",
    })

    await onChunk?.({ type: "text", delta: "검토되지 않은 원문" })
    await onChunk?.({ type: "text", delta: "검토되지 않은 모델 원문", textSource: "llm_generated" })
    const receipt = await onChunk?.({ type: "done", totalTokens: 0 })

    expect(receipt).toBeUndefined()
  })

  it("converts reviewed AI text chunks into WebUI text delivery", async () => {
    const onChunk = createWebUiChunkDeliveryHandler({
      artifactStorage,
      sessionId: "session-reviewed-text",
      runId: "run-reviewed-text",
    })

    await onChunk?.({ type: "text", delta: "검토된 ", textSource: "llm_reviewed" })
    await onChunk?.({ type: "text", delta: "응답", textSource: "llm_reviewed" })
    const receipt = await onChunk?.({ type: "done", totalTokens: 0 })

    expect(receipt).toEqual({
      textDeliveries: [{
        channel: "webui",
        text: "검토된 응답",
      }],
    })
  })

  it("uses isolated Yeonjang tool output instead of buffered AI text", async () => {
    const onChunk = createWebUiChunkDeliveryHandler({
      artifactStorage,
      sessionId: "session-1",
      runId: "run-1",
    })

    await onChunk?.({ type: "text", delta: "먼저 들어온 AI 안내문" })
    await onChunk?.({
      type: "tool_end",
      toolName: "yeonjang_camera_list",
      success: true,
      output: "연장 \"yeonjang-main\" 카메라 1개:\n- FaceTime HD Camera · 사용 가능 (default)",
      details: {
        via: "yeonjang",
        responseOwnership: "final_text",
      },
    })
    await onChunk?.({ type: "text", delta: "나중에 생성된 AI 요약문" })
    await onChunk?.({ type: "error", message: "late failure" })
    const receipt = await onChunk?.({ type: "done", totalTokens: 0 })

    expect(receipt).toEqual({
      textDeliveries: [{
        channel: "webui",
        text: "연장 \"yeonjang-main\" 카메라 1개:\n- FaceTime HD Camera · 사용 가능 (default)",
      }],
    })
  })

  it("uses explicit final-text ownership for Yeonjang-backed action output", async () => {
    const onChunk = createWebUiChunkDeliveryHandler({
      artifactStorage,
      sessionId: "session-2",
      runId: "run-2",
    })

    await onChunk?.({ type: "text", delta: "AI가 먼저 만든 안내문" })
    await onChunk?.({
      type: "tool_end",
      toolName: "mouse_click",
      success: true,
      output: "(120, 240) 클릭 완료",
      details: {
        via: "yeonjang",
        responseOwnership: "final_text",
        x: 120,
        y: 240,
        button: "left",
      },
    })
    await onChunk?.({ type: "text", delta: "나중에 생성된 AI 설명" })
    const receipt = await onChunk?.({ type: "done", totalTokens: 0 })

    expect(receipt).toEqual({
      textDeliveries: [{
        channel: "webui",
        text: "(120, 240) 클릭 완료",
      }],
    })
  })

  it("redacts Yeonjang internal evidence from isolated final-text tool output", async () => {
    const onChunk = createWebUiChunkDeliveryHandler({
      artifactStorage,
      sessionId: "session-redacted-text",
      runId: "run-redacted-text",
    })

    await onChunk?.({
      type: "tool_end",
      toolName: "mouse_click",
      success: true,
      output:
        "yeonjang-goal-validation:mouse_click:candidate_not_validated:result_diagnosis_not_sufficient operationId=operation:run-redacted receipt payload raw observed state",
      details: {
        via: "yeonjang",
        responseOwnership: "final_text",
      },
    })
    const receipt = await onChunk?.({ type: "done", totalTokens: 0 })

    const delivered = JSON.stringify(receipt)
    expect(receipt?.textDeliveries?.[0]?.text).toBe(
      "작업 결과를 확인하기 위해 추가 확인이 필요합니다.",
    )
    expect(delivered).not.toContain("yeonjang-goal-validation")
    expect(delivered).not.toContain("operationId")
    expect(delivered).not.toContain("operation:run-redacted")
    expect(delivered).not.toContain("receipt payload")
    expect(delivered).not.toContain("raw observed state")
  })

  it("does not emit the same artifact twice for one WebUI run", async () => {
    const artifacts: KnowbeeEvents["agent.artifact"][] = []
    const unsubscribe = eventBus.on("agent.artifact", (artifact) => {
      artifacts.push(artifact)
    })
    const onChunk = createWebUiChunkDeliveryHandler({
      artifactStorage,
      sessionId: "session-webui-artifact",
      runId: "run-webui-artifact",
    })
    const filePath = join(artifactStorage.rootDir, "screens", "duplicate.png")
    const chunk = {
      type: "tool_end" as const,
      toolName: "screen_capture",
      success: true,
      output: "captured",
      details: {
        kind: "artifact_delivery" as const,
        channel: "webui" as const,
        filePath,
        caption: "메인 화면",
        size: 123,
        source: "webui",
      },
    }

    try {
      const firstReceipt = await onChunk?.(chunk)
      const secondReceipt = await onChunk?.(chunk)

      expect(artifacts).toHaveLength(1)
      expect("filePath" in artifacts[0]!).toBe(false)
      expect(JSON.stringify(artifacts[0])).not.toContain(filePath)
      expect(firstReceipt?.artifactDeliveries?.[0]).toMatchObject({
        toolName: "screen_capture",
        channel: "webui",
        filePath,
        caption: "메인 화면",
        url: "/api/artifacts/screens/duplicate.png",
        previewUrl: "/api/artifacts/screens/duplicate.png",
        downloadUrl: "/api/artifacts/screens/duplicate.png?download=1",
        previewable: true,
        mimeType: "image/png",
        sizeBytes: 123,
      })
      expect(secondReceipt).toBeUndefined()
    } finally {
      unsubscribe()
    }
  })

  it("delivers one reviewed canonical final answer after an artifact", async () => {
    const artifacts: KnowbeeEvents["agent.artifact"][] = []
    const unsubscribe = eventBus.on("agent.artifact", (artifact) => {
      artifacts.push(artifact)
    })
    const onChunk = createWebUiChunkDeliveryHandler({
      artifactStorage,
      sessionId: "session-webui-artifact-final",
      runId: "run-webui-artifact-final",
    })
    const filePath = join(artifactStorage.rootDir, "screens", "artifact-final.png")

    try {
      const artifactReceipt = await onChunk?.({
        type: "tool_end",
        toolName: "screen_capture",
        success: true,
        output: "captured",
        details: {
          kind: "artifact_delivery",
          channel: "webui",
          filePath,
          size: 123,
          source: "webui",
        },
      })
      await onChunk?.({
        type: "text",
        delta: "사진을 촬영해 전달했습니다.",
        textSource: "llm_reviewed",
      })
      const finalReceipt = await onChunk?.({ type: "done", totalTokens: 0 })
      await onChunk?.({
        type: "text",
        delta: "중복 최종 답변",
        textSource: "llm_reviewed",
      })
      const duplicateReceipt = await onChunk?.({ type: "done", totalTokens: 0 })

      expect(artifacts).toHaveLength(1)
      expect(artifactReceipt?.artifactDeliveries).toHaveLength(1)
      expect(finalReceipt?.textDeliveries).toEqual([{
        channel: "webui",
        text: "사진을 촬영해 전달했습니다.",
      }])
      expect(duplicateReceipt).toBeUndefined()
    } finally {
      unsubscribe()
    }
  })

  it("resolves an opaque camera artifact ref without exposing its internal path", async () => {
    const artifacts: KnowbeeEvents["agent.artifact"][] = []
    const unsubscribe = eventBus.on("agent.artifact", (artifact) => {
      artifacts.push(artifact)
    })
    const runId = "run-webui-camera-ref"
    const filePath = join(artifactStorage.rootDir, "yeonjang", "camera.png")
    mkdirSync(join(artifactStorage.rootDir, "yeonjang"), { recursive: true })
    writeFileSync(filePath, "camera")
    const artifactRef = `artifact:${recordArtifactMetadata({
      artifactPath: filePath,
      ownerChannel: "webui",
      sourceRunId: runId,
      requestGroupId: runId,
      mimeType: "image/png",
      sizeBytes: 6,
      dataClassification: "user",
    }, artifactStorage)}`
    const onChunk = createWebUiChunkDeliveryHandler({
      artifactStorage,
      sessionId: "session-webui-camera-ref",
      runId,
    })

    try {
      const receipt = await onChunk?.({
        type: "tool_end",
        toolName: "yeonjang_camera_capture",
        success: true,
        output: "captured",
        details: {
          kind: "artifact_delivery",
          channel: "webui",
          artifactRef,
          mimeType: "image/png",
          size: 6,
          source: "webui",
        },
      })

      expect(artifacts).toMatchObject([{
        runId,
        url: "/api/artifacts/yeonjang/camera.png",
        fileName: "camera.png",
        mimeType: "image/png",
      }])
      expect(JSON.stringify(artifacts)).not.toContain(filePath)
      expect(receipt?.artifactDeliveries?.[0]).toMatchObject({
        toolName: "yeonjang_camera_capture",
        channel: "webui",
        filePath,
      })
    } finally {
      unsubscribe()
    }
  })

  it("redacts Yeonjang internal evidence from WebUI artifact captions", async () => {
    const artifacts: KnowbeeEvents["agent.artifact"][] = []
    const unsubscribe = eventBus.on("agent.artifact", (artifact) => {
      artifacts.push(artifact)
    })
    const onChunk = createWebUiChunkDeliveryHandler({
      artifactStorage,
      sessionId: "session-redacted-artifact",
      runId: "run-redacted-artifact",
    })
    const filePath = join(artifactStorage.rootDir, "screens", "redacted.png")

    try {
      const receipt = await onChunk?.({
        type: "tool_end",
        toolName: "screen_capture",
        success: true,
        output: "captured",
        details: {
          kind: "artifact_delivery" as const,
          channel: "webui" as const,
          filePath,
          caption:
            "yeonjang-goal-validation:screen_capture:candidate_not_validated:result_diagnosis_not_sufficient operationId=operation:artifact raw observed state",
          size: 123,
          source: "webui",
        },
      })

      expect(artifacts).toHaveLength(1)
      expect(artifacts[0]?.caption).toBe("작업 결과를 확인하기 위해 추가 확인이 필요합니다.")
      expect(receipt?.artifactDeliveries?.[0]?.caption).toBe(
        "작업 결과를 확인하기 위해 추가 확인이 필요합니다.",
      )
      const serialized = JSON.stringify({ artifacts, receipt })
      expect(serialized).not.toContain("yeonjang-goal-validation")
      expect(serialized).not.toContain("operationId")
      expect(serialized).not.toContain("operation:artifact")
      expect(serialized).not.toContain("raw observed state")
    } finally {
      unsubscribe()
    }
  })
})
