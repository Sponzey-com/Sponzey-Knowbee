import { createHash } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext } from "../packages/core/src/tools/types.ts"

const mqttMocks = vi.hoisted(() => ({
  canYeonjangHandleMethod: vi.fn(),
  invokeYeonjangMethod: vi.fn(),
  isYeonjangUnavailableError: vi.fn(() => false),
}))
const brokerMocks = vi.hoisted(() => ({
  getMqttExtensionSnapshots: vi.fn(),
}))

let stateDir = ""

vi.mock("../packages/core/src/yeonjang/mqtt-client.js", () => ({
  ...mqttMocks,
  DEFAULT_YEONJANG_EXTENSION_ID: "yeonjang-main",
}))

vi.mock("../packages/core/src/mqtt/broker.js", () => ({
  ...brokerMocks,
}))

const db = await import("../packages/core/src/db/index.js")
const { createRootRun } = await import("../packages/core/src/runs/store.ts")
const { initializeTestDbRuntime } = await import("./fixtures/runtime-db.ts")
const { executeToolWithSideEffectLedger } = await import("../packages/core/src/tools/side-effect-runtime.ts")
const { mouseClickTool } = await import("../packages/core/src/tools/index.ts")

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
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-side-effect-manual-shape-"))
  initializeTestDbRuntime(stateDir)
  const now = Date.now()
  db.insertSession({
    id: "session-069",
    source: "telegram",
    source_id: null,
    created_at: now,
    updated_at: now,
    summary: null,
  })
  createRootRun({
    id: "run-069",
    sessionId: "session-069",
    prompt: "연장 컴퓨터에서 클릭해줘",
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
      supportProfile: "desktop_interactive",
      methods: ["mouse.click", "mouse.position"],
      sessionId: "target-session-069",
      trustState: "trusted",
    },
  ])
}

function createContext(params: Record<string, unknown>, toolName: string): ToolContext {
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
    sessionId: "session-069",
    runId: "run-069",
    requestGroupId: "run-069",
    workDir: process.cwd(),
    userMessage: "연장 컴퓨터에서 클릭해줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    authorizationReceipt: {
      policyDecisionId: `policy-069-${toolName}`,
      toolName,
      paramsHash: hash(params),
      policyDecision: "allow",
      permissionScope: `yeonjang:${toolName}`,
      runId: "run-069",
      requestGroupId: "run-069",
      approvalDecision: "allow_run",
      approvalId: `approval-069-${toolName}`,
    },
  }
}

describe("Task 069 side-effect manual intervention result shape", () => {
  beforeEach(() => {
    setupDb()
    setupSnapshot()
    mqttMocks.canYeonjangHandleMethod.mockResolvedValue(true)
    mqttMocks.invokeYeonjangMethod.mockReset()
    mqttMocks.isYeonjangUnavailableError.mockReturnValue(false)
  })

  afterEach(() => {
    db.closeDb()
    if (stateDir) rmSync(stateDir, { recursive: true, force: true })
    stateDir = ""
  })

  it("returns a safe goal validation candidate reference for manual side-effect results", async () => {
    const params = { extensionId: "yeonjang-main", x: 100, y: 200 }
    mqttMocks.invokeYeonjangMethod
      .mockResolvedValueOnce({ x: 90, y: 190, message: "before" })
      .mockResolvedValueOnce({ clicked: true, x: 100, y: 200, button: "left", double: false, message: "clicked" })
      .mockResolvedValueOnce({ x: 100, y: 200, message: "after" })

    const result = await executeToolWithSideEffectLedger({
      tool: mouseClickTool,
      params,
      ctx: createContext(params, "mouse_click"),
    })

    expect(result).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_MANUAL_INTERVENTION",
      details: {
        kind: "side_effect_manual_intervention",
        reasonCode: "side_effect_irreversible",
        goalValidationCandidate: true,
      },
    })
    const details = result.details as Record<string, unknown>
    expect(typeof details.operationId).toBe("string")
    expect(details.operationId).toContain("operation:run-069")
    expect(JSON.stringify(details)).not.toContain("sha256:")
    expect(JSON.stringify(details)).not.toContain("receipt")
    expect(JSON.stringify(details)).not.toContain("preCursor")
    expect(JSON.stringify(details)).not.toContain("postCursor")
  })
})
