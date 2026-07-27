import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { closeDb, insertSession } from "../packages/core/src/db/index.js"
import { eventBus } from "../packages/core/src/events/index.js"
import { createRootRun } from "../packages/core/src/runs/store.js"
import { ToolDispatcher } from "../packages/core/src/tools/dispatcher.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

let stateDir = ""

beforeEach(() => {
  closeDb()
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-camera-recovery-dispatch-"))
  initializeTestDbRuntime(stateDir)
  const now = Date.now()
  insertSession({
    id: "session-camera-recovery",
    source: "telegram",
    source_id: null,
    created_at: now,
    updated_at: now,
    summary: null,
  })
  createRootRun({
    id: "run-camera-recovery",
    sessionId: "session-camera-recovery",
    prompt: "camera recovery",
    source: "telegram",
  })
})

afterEach(() => {
  closeDb()
  rmSync(stateDir, { recursive: true, force: true })
})

describe("camera recovery dispatch admission", () => {
  it("rejects unchanged target, method, and params before dispatch but admits changed steps", async () => {
    const dispatcher = new ToolDispatcher({
      config: {
        ...DEFAULT_CONFIG,
        security: {
          ...DEFAULT_CONFIG.security,
          approvalMode: "off",
        },
      },
    })
    let captureExecutions = 0
    let permissionExecutions = 0
    dispatcher.register({
      name: "yeonjang_camera_capture",
      description: "camera capture fixture",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      async execute() {
        captureExecutions += 1
        return captureExecutions === 1
          ? { success: false, output: "capture failed", error: "CAMERA_CAPTURE_FAILED" }
          : { success: true, output: "capture changed target succeeded" }
      },
    })
    dispatcher.register({
      name: "yeonjang_camera_permission_status",
      description: "camera permission fixture",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      async execute() {
        permissionExecutions += 1
        return { success: true, output: "permission granted" }
      },
    })
    const ctx = {
      artifactStorage: {
        rootDir: join(stateDir, "artifacts"),
        fileSystem: {
          exists: () => false,
          realpath: (path: string) => path,
          remove: () => undefined,
          stat: () => ({ isFile: () => false, size: 0 }),
        },
      },
      sessionId: "session-camera-recovery",
      runId: "run-camera-recovery",
      requestGroupId: "run-camera-recovery",
      workDir: stateDir,
      userMessage: "카메라로 사진 찍어줘",
      source: "telegram" as const,
      allowWebAccess: false,
      onProgress: () => undefined,
      signal: new AbortController().signal,
    }
    const firstParams = {
      extensionId: "yeonjang-main",
      targetSessionId: "target-session-1",
      deviceId: "camera-1",
    }
    const detachApproval = eventBus.on("approval.request", ({ resolve }) => resolve("allow_run"))

    try {
      const failed = await dispatcher.dispatch("yeonjang_camera_capture", firstParams, ctx)
      const unchanged = await dispatcher.dispatch("yeonjang_camera_capture", firstParams, ctx)
      const permission = await dispatcher.dispatch(
        "yeonjang_camera_permission_status",
        {
          extensionId: "yeonjang-main",
          targetSessionId: "target-session-1",
        },
        ctx,
      )
      const changedTarget = await dispatcher.dispatch(
        "yeonjang_camera_capture",
        {
          ...firstParams,
          deviceId: "camera-2",
        },
        ctx,
      )

      expect(failed).toMatchObject({ success: false, error: "CAMERA_CAPTURE_FAILED" })
      expect(unchanged).toMatchObject({
        success: false,
        error: "recovery_strategy_unchanged",
        details: {
          kind: "duplicate_tool_rejected",
          reasonCode: "recovery_strategy_unchanged",
        },
      })
      expect(permission.success).toBe(true)
      expect(changedTarget.success).toBe(true)
      expect(captureExecutions).toBe(2)
      expect(permissionExecutions).toBe(1)
    } finally {
      detachApproval()
    }
  })
})
