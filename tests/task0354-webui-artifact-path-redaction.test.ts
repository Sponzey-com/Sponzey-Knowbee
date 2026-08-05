import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { createWebUiChunkDeliveryHandler } from "../packages/core/src/api/ws/chunk-delivery.ts"
import { closeDb } from "../packages/core/src/db/index.js"
import { eventBus, type KnowbeeEvents } from "../packages/core/src/events/index.js"
import { resetArtifactDeliveryDedupeForTest } from "../packages/core/src/runs/delivery.js"
import { createTestArtifactStorage } from "./fixtures/artifact-storage.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

describe("task0354 WebUI artifact path redaction", () => {
  it("emits WebUI artifact events without local file paths while keeping internal receipts", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "knowbee-task0354-artifact-"))
    tempDirs.push(stateDir)
    initializeTestDbRuntime(stateDir)
    const artifactStorage = createTestArtifactStorage(stateDir)
    resetArtifactDeliveryDedupeForTest()
    const artifacts: KnowbeeEvents["agent.artifact"][] = []
    const unsubscribe = eventBus.on("agent.artifact", (artifact) => {
      artifacts.push(artifact)
    })
    const onChunk = createWebUiChunkDeliveryHandler({
      artifactStorage,
      sessionId: "session-task0354",
      runId: "run-task0354",
    })
    const filePath = join(artifactStorage.rootDir, "screens", "task0354.png")

    try {
      const receipt = await onChunk?.({
        type: "tool_end",
        toolName: "screen_capture",
        success: true,
        output: "captured",
        details: {
          kind: "artifact_delivery",
          channel: "webui",
          filePath,
          caption: "메인 화면",
          size: 123,
          source: "webui",
          mimeType: "image/png",
        },
      })

      expect(artifacts).toHaveLength(1)
      expect("filePath" in artifacts[0]!).toBe(false)
      expect(JSON.stringify(artifacts[0])).not.toContain(filePath)
      expect(JSON.stringify(artifacts[0])).not.toContain(stateDir)
      expect(artifacts[0]).toEqual(expect.objectContaining({
        sessionId: "session-task0354",
        runId: "run-task0354",
        url: "/api/artifacts/screens/task0354.png",
        previewUrl: "/api/artifacts/screens/task0354.png",
        downloadUrl: "/api/artifacts/screens/task0354.png?download=1",
        fileName: "task0354.png",
        mimeType: "image/png",
        caption: "메인 화면",
      }))
      expect(receipt?.artifactDeliveries?.[0]).toEqual(expect.objectContaining({
        channel: "webui",
        filePath,
        url: "/api/artifacts/screens/task0354.png",
      }))
    } finally {
      unsubscribe()
      resetArtifactDeliveryDedupeForTest()
    }
  })
})
