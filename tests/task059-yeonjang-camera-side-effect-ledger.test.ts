import { createHash } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext } from "../packages/core/src/tools/types.ts"

const invokeYeonjangMethod = vi.fn()
const getMqttExtensionSnapshots = vi.fn()
const fsMocks = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 321 })),
  writeFileSync: vi.fn(),
}))
let stateDir = ""

vi.mock("../packages/core/src/yeonjang/mqtt-client.js", () => ({
  invokeYeonjangMethod,
  DEFAULT_YEONJANG_EXTENSION_ID: "yeonjang-main",
}))

vi.mock("../packages/core/src/mqtt/broker.js", () => ({
  getMqttExtensionSnapshots,
}))

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs")
  return {
    ...actual,
    mkdirSync: fsMocks.mkdirSync,
    statSync: fsMocks.statSync,
    writeFileSync: fsMocks.writeFileSync,
  }
})

const db = await import("../packages/core/src/db/index.js")
const { createRootRun } = await import("../packages/core/src/runs/store.ts")
const { initializeTestDbRuntime } = await import("./fixtures/runtime-db.ts")
const { executeToolWithSideEffectLedger } = await import("../packages/core/src/tools/side-effect-runtime.ts")
const { yeonjangCameraCaptureTool } = await import("../packages/core/src/tools/builtin/yeonjang.ts")

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stable(nested)}`)
      .join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

function hash(value: unknown): string {
  return createHash("sha256").update(stable(value)).digest("hex")
}

function setupDb() {
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-yeonjang-camera-side-effect-"))
  initializeTestDbRuntime(stateDir)
  const now = Date.now()
  db.insertSession({
    id: "session-059",
    source: "telegram",
    source_id: null,
    created_at: now,
    updated_at: now,
    summary: null,
  })
  createRootRun({
    id: "run-059",
    sessionId: "session-059",
    prompt: "연장 카메라로 사진 찍어줘",
    source: "telegram",
  })
}

function setupSnapshot() {
  getMqttExtensionSnapshots.mockReturnValue([
    {
      extensionId: "yeonjang-main",
      displayName: "작업용 맥",
      instanceId: "instance-local",
      instanceAlias: "local-mac",
      state: "online",
      message: "ready",
      platform: "macos",
      methods: ["camera.capture"],
      sessionId: "target-session-059",
      trustState: "trusted",
    },
  ])
}

function createContext(params: Record<string, unknown>, withApproval = true): ToolContext {
  return {
    artifactStorage: {
      rootDir: join(stateDir, "artifacts"),
      fileSystem: {
        exists: () => false,
        realpath: (path) => path,
        remove: () => undefined,
        stat: () => ({ size: 0 }) as never,
      },
    },
    sessionId: "session-059",
    runId: "run-059",
    requestGroupId: "run-059",
    workDir: process.cwd(),
    userMessage: "연장 카메라로 사진 찍어줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    ...(withApproval
      ? {
          authorizationReceipt: {
            policyDecisionId: "policy-059",
            toolName: "yeonjang_camera_capture",
            paramsHash: hash(params),
            policyDecision: "allow",
            permissionScope: "yeonjang:camera.capture",
            runId: "run-059",
            requestGroupId: "run-059",
            approvalDecision: "allow_run",
            approvalId: "approval-059",
          },
        }
      : {}),
  }
}

function operationRows(): Array<{ state: string; revision: number; adapter_id: string }> {
  return db
    .getDb()
    .prepare<[], { state: string; revision: number; adapter_id: string }>(
      "SELECT state, revision, adapter_id FROM side_effect_operations ORDER BY created_at",
    )
    .all()
}

function serializedReceiptRows(): string {
  return JSON.stringify(
    db
      .getDb()
      .prepare("SELECT * FROM side_effect_operation_receipts ORDER BY operation_revision")
      .all(),
  )
}

describe("Task 059 Yeonjang camera capture side-effect ledger", () => {
  beforeEach(() => {
    setupDb()
    setupSnapshot()
    invokeYeonjangMethod.mockReset()
    fsMocks.mkdirSync.mockClear()
    fsMocks.statSync.mockClear()
    fsMocks.writeFileSync.mockClear()
    fsMocks.statSync.mockReturnValue({ size: 321 })
  })

  afterEach(() => {
    db.closeDb()
    if (stateDir) rmSync(stateDir, { recursive: true, force: true })
    stateDir = ""
  })

  it("executes camera.capture through the side-effect ledger without storing raw base64", async () => {
    const params = {
      extensionId: "yeonjang-main",
      deviceId: "camera-1",
      inlineBase64: false,
      timeoutSec: 60,
    }
    invokeYeonjangMethod.mockResolvedValueOnce({
      device_id: "camera-1",
      output_path: "/remote/captures",
      file_name: "capture.jpg",
      file_extension: "jpg",
      mime_type: "image/jpeg",
      size_bytes: 123,
      transfer_encoding: "base64",
      base64_data: "aGVsbG8=",
      message: "Camera capture completed.",
    })

    const first = await executeToolWithSideEffectLedger({
      tool: yeonjangCameraCaptureTool,
      params,
      ctx: createContext(params),
    })
    const replay = await executeToolWithSideEffectLedger({
      tool: yeonjangCameraCaptureTool,
      params,
      ctx: createContext(params),
    })

    expect(first.success).toBe(true)
    expect(replay).toMatchObject({
      success: true,
      details: { kind: "side_effect_duplicate_verified" },
    })
    expect(invokeYeonjangMethod).toHaveBeenCalledTimes(1)
    expect(operationRows()).toEqual([
      { state: "VERIFIED", revision: 4, adapter_id: "tool:yeonjang_camera_capture" },
    ])
    const receipts = serializedReceiptRows()
    expect(receipts).not.toContain("aGVsbG8=")
    expect(receipts).not.toContain("base64_data")
    expect(receipts).not.toContain("/remote/captures")
  })

  it("blocks camera.capture before remote invoke when approval receipt is missing", async () => {
    const params = {
      extensionId: "yeonjang-main",
      deviceId: "camera-1",
      inlineBase64: false,
      timeoutSec: 60,
    }

    const result = await executeToolWithSideEffectLedger({
      tool: yeonjangCameraCaptureTool,
      params,
      ctx: createContext(params, false),
    })

    expect(result).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_OPERATION_BLOCKED",
      details: { reasonCode: "side_effect_authorization_required" },
    })
    expect(invokeYeonjangMethod).not.toHaveBeenCalled()
  })
})
