import { createHash } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext } from "../packages/core/src/tools/types.ts"

const mqttMocks = vi.hoisted(() => ({
  invokeYeonjangMethod: vi.fn(),
  getYeonjangCapabilities: vi.fn(),
  doesYeonjangCapabilitySupportMethod: vi.fn(() => true),
  hasYeonjangCapabilityMatrix: vi.fn(() => true),
  doesYeonjangCapabilitySupportOutputMode: vi.fn(() => true),
  isYeonjangUnavailableError: vi.fn(() => false),
}))
const brokerMocks = vi.hoisted(() => ({
  getMqttExtensionSnapshots: vi.fn(),
}))
const fsMocks = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 512 })),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  unlinkSync: vi.fn(),
}))
const childProcessMocks = vi.hoisted(() => ({
  execFile: vi.fn((_command: string, _args: string[], callback: (error: Error | null, stdout: string, stderr: string) => void) => {
    callback(null, "", "")
  }),
}))

let stateDir = ""

vi.mock("../packages/core/src/yeonjang/mqtt-client.js", () => ({
  ...mqttMocks,
  DEFAULT_YEONJANG_EXTENSION_ID: "yeonjang-main",
}))

vi.mock("../packages/core/src/mqtt/broker.js", () => ({
  ...brokerMocks,
}))

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs")
  return {
    ...actual,
    mkdirSync: fsMocks.mkdirSync,
    statSync: fsMocks.statSync,
    writeFileSync: fsMocks.writeFileSync,
    readFileSync: fsMocks.readFileSync,
    unlinkSync: fsMocks.unlinkSync,
  }
})

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process")
  return {
    ...actual,
    execFile: childProcessMocks.execFile,
  }
})

const db = await import("../packages/core/src/db/index.js")
const { createRootRun } = await import("../packages/core/src/runs/store.ts")
const { initializeTestDbRuntime } = await import("./fixtures/runtime-db.ts")
const { executeToolWithSideEffectLedger } = await import("../packages/core/src/tools/side-effect-runtime.ts")
const { screenCaptureTool, screenFindTextTool } = await import("../packages/core/src/tools/index.ts")

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
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-yeonjang-screen-side-effect-"))
  initializeTestDbRuntime(stateDir)
  const now = Date.now()
  db.insertSession({
    id: "session-060",
    source: "telegram",
    source_id: null,
    created_at: now,
    updated_at: now,
    summary: null,
  })
  createRootRun({
    id: "run-060",
    sessionId: "session-060",
    prompt: "연장 화면을 확인해줘",
    source: "telegram",
  })
}

function setupSnapshot() {
  brokerMocks.getMqttExtensionSnapshots.mockReturnValue([
    {
      extensionId: "yeonjang-main",
      displayName: "작업용 맥",
      instanceId: "instance-local",
      instanceAlias: "local-mac",
      state: "online",
      message: "ready",
      platform: "macos",
      methods: ["screen.capture"],
      sessionId: "target-session-060",
      trustState: "trusted",
    },
  ])
}

function createContext(
  params: Record<string, unknown>,
  withApproval = true,
  toolName = "screen_capture",
): ToolContext {
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
    sessionId: "session-060",
    runId: "run-060",
    requestGroupId: "run-060",
    workDir: process.cwd(),
    userMessage: "연장 화면을 확인해줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    ...(withApproval
      ? {
          authorizationReceipt: {
            policyDecisionId: "policy-060",
            toolName,
            paramsHash: hash(params),
            policyDecision: "allow",
            permissionScope: "yeonjang:screen.capture",
            runId: "run-060",
            requestGroupId: "run-060",
            approvalDecision: "allow_run",
            approvalId: "approval-060",
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

describe("Task 060 Yeonjang screen side-effect ledger", () => {
  beforeEach(() => {
    setupDb()
    setupSnapshot()
    mqttMocks.invokeYeonjangMethod.mockReset()
    mqttMocks.getYeonjangCapabilities.mockResolvedValue({ methods: ["screen.capture"] })
    mqttMocks.doesYeonjangCapabilitySupportMethod.mockReturnValue(true)
    mqttMocks.hasYeonjangCapabilityMatrix.mockReturnValue(true)
    mqttMocks.doesYeonjangCapabilitySupportOutputMode.mockReturnValue(true)
    mqttMocks.isYeonjangUnavailableError.mockReturnValue(false)
    fsMocks.mkdirSync.mockClear()
    fsMocks.statSync.mockClear()
    fsMocks.writeFileSync.mockClear()
    fsMocks.readFileSync.mockReset()
    fsMocks.unlinkSync.mockClear()
    childProcessMocks.execFile.mockClear()
    fsMocks.statSync.mockReturnValue({ size: 512 })
    fsMocks.readFileSync.mockReturnValue("private OCR needle")
  })

  afterEach(() => {
    db.closeDb()
    if (stateDir) rmSync(stateDir, { recursive: true, force: true })
    stateDir = ""
  })

  it("executes screen.capture through the side-effect ledger without storing raw base64", async () => {
    const params = { extensionId: "yeonjang-main", display: 0 }
    mqttMocks.invokeYeonjangMethod.mockResolvedValueOnce({
      file_name: "screen.png",
      file_extension: "png",
      mime_type: "image/png",
      size_bytes: 123,
      transfer_encoding: "base64",
      base64_data: "c2NyZWVuLWJpbmFyeQ==",
      message: "Screen capture completed.",
    })

    const first = await executeToolWithSideEffectLedger({
      tool: screenCaptureTool,
      params,
      ctx: createContext(params),
    })
    const replay = await executeToolWithSideEffectLedger({
      tool: screenCaptureTool,
      params,
      ctx: createContext(params),
    })

    expect(first.success).toBe(true)
    expect(replay).toMatchObject({
      success: true,
      details: { kind: "side_effect_duplicate_verified" },
    })
    expect(mqttMocks.invokeYeonjangMethod).toHaveBeenCalledTimes(1)
    expect(operationRows()).toEqual([
      { state: "VERIFIED", revision: 4, adapter_id: "tool:screen_capture" },
    ])
    const receipts = serializedReceiptRows()
    expect(receipts).not.toContain("c2NyZWVuLWJpbmFyeQ==")
    expect(receipts).not.toContain("base64_data")
  })

  it("executes screen_find_text through the side-effect ledger without storing OCR temp content", async () => {
    const params = { extensionId: "yeonjang-main", text: "private OCR needle" }
    mqttMocks.invokeYeonjangMethod.mockResolvedValueOnce({
      file_name: "screen.png",
      file_extension: "png",
      mime_type: "image/png",
      size_bytes: 123,
      transfer_encoding: "base64",
      base64_data: "b2NyLWJpbmFyeQ==",
      message: "Screen capture completed.",
    })

    const result = await executeToolWithSideEffectLedger({
      tool: screenFindTextTool,
      params,
      ctx: createContext(params, true, "screen_find_text"),
    })

    expect(result.success).toBe(true)
    expect(childProcessMocks.execFile).toHaveBeenCalledWith(
      "tesseract",
      expect.arrayContaining(["-l", "eng+kor"]),
      expect.any(Function),
    )
    expect(operationRows()).toEqual([
      { state: "VERIFIED", revision: 4, adapter_id: "tool:screen_find_text" },
    ])
    const receipts = serializedReceiptRows()
    expect(receipts).not.toContain("private OCR needle")
    expect(receipts).not.toContain("b2NyLWJpbmFyeQ==")
    expect(receipts).not.toContain("base64_data")
    expect(receipts).not.toContain("knowbee-screen-ocr")
    expect(receipts).not.toContain("knowbee-ocr")
  })

  it("blocks screen.capture before remote invoke when approval receipt is missing", async () => {
    const params = { extensionId: "yeonjang-main", display: 0 }

    const result = await executeToolWithSideEffectLedger({
      tool: screenCaptureTool,
      params,
      ctx: createContext(params, false),
    })

    expect(result).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_OPERATION_BLOCKED",
      details: { reasonCode: "side_effect_authorization_required" },
    })
    expect(mqttMocks.invokeYeonjangMethod).not.toHaveBeenCalled()
  })
})
