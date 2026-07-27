import { createHash } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  projectYeonjangBrowserFocusTarget,
  type YeonjangBrowserFocusTargetProjection,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"
import type { ToolContext } from "../packages/core/src/tools/types.ts"

const invokeYeonjangMethod = vi.fn()
const getMqttExtensionSnapshots = vi.fn()
let stateDir = ""

vi.mock("../packages/core/src/yeonjang/mqtt-client.js", () => ({
  invokeYeonjangMethod,
  DEFAULT_YEONJANG_EXTENSION_ID: "yeonjang-main",
}))

vi.mock("../packages/core/src/mqtt/broker.js", () => ({
  getMqttExtensionSnapshots,
}))

const realDb = await import("../packages/core/src/db/index.js")
const { createRootRun } = await import("../packages/core/src/runs/store.ts")
const { initializeTestDbRuntime } = await import("./fixtures/runtime-db.ts")
const { executeToolWithSideEffectLedger } = await import("../packages/core/src/tools/side-effect-runtime.ts")
const { yeonjangBrowserFocusTool } = await import("../packages/core/src/tools/builtin/yeonjang.ts")

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

function target(overrides: Record<string, unknown> = {}): YeonjangBrowserFocusTargetProjection {
  const projected = projectYeonjangBrowserFocusTarget({
    targetAlias: "업무 브라우저",
    processName: "Google Chrome",
    title: "Private Admin Console",
    url: "https://example.test/admin?token=private",
    ...overrides,
  })
  expect(projected.ok).toBe(true)
  if (!projected.ok) throw new Error("target projection failed")
  return projected.projection
}

const baseParams = {
  extensionId: "yeonjang-main",
  targetAlias: "업무 브라우저",
  processName: "Google Chrome",
  title: "Private Admin Console",
  url: "https://example.test/admin?token=private",
  preDispatch: {
    schemaVersion: "yeonjang-browser-focus-pre-dispatch-v1",
    method: "browser.focus",
    toolName: "yeonjang_browser_focus",
    platform: "macos",
    status: "dispatch_prepared",
    reasonCode: "browser_focus_dispatch_prepared",
    invokeNow: false,
  },
  macosBridge: {
    schemaVersion: "yeonjang-browser-focus-macos-executor-release-bridge-v1",
    method: "browser.focus",
    toolName: "yeonjang_browser_focus",
    platform: "macos",
    status: "bridge_verified",
    reasonCode: "focused_target_matched",
    commandAccepted: true,
  },
} as const

function createContext(params: Record<string, unknown>): ToolContext {
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
    sessionId: "session-141",
    runId: "run-141",
    requestGroupId: "run-141",
    workDir: process.cwd(),
    userMessage: "업무 브라우저를 앞으로 가져와줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    authorizationReceipt: {
      policyDecisionId: "policy-141",
      toolName: "yeonjang_browser_focus",
      paramsHash: hash(params),
      policyDecision: "allow",
      permissionScope: "yeonjang:browser.focus",
      runId: "run-141",
      requestGroupId: "run-141",
      approvalDecision: "allow_run",
      approvalId: "approval-141",
    },
  }
}

function setupDb() {
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-yeonjang-browser-focus-observed-"))
  initializeTestDbRuntime(stateDir)
  const now = Date.now()
  realDb.insertSession({
    id: "session-141",
    source: "telegram",
    source_id: null,
    created_at: now,
    updated_at: now,
    summary: null,
  })
  createRootRun({
    id: "run-141",
    sessionId: "session-141",
    prompt: "업무 브라우저를 앞으로 가져와줘",
    source: "telegram",
  })
}

function setupSnapshot() {
  getMqttExtensionSnapshots.mockReturnValue([
    {
      extensionId: "yeonjang-main",
      displayName: "작업용 맥",
      instanceId: "instance-private",
      instanceAlias: "local-mac",
      state: "online",
      message: "ready",
      platform: "macos",
      methods: ["browser.focus"],
      sessionId: "target-session-1",
      trustState: "trusted",
    },
  ])
}

function operationRows(): Array<{ state: string; adapter_id: string }> {
  return realDb
    .getDb()
    .prepare<[], { state: string; adapter_id: string }>(
      "SELECT state, adapter_id FROM side_effect_operations ORDER BY created_at",
    )
    .all()
}

function serializedReceipts(): string {
  return JSON.stringify(realDb.getDb().prepare("SELECT * FROM side_effect_operation_receipts").all())
}

describe("Task 141 Yeonjang browser.focus observed target integration", () => {
  beforeEach(() => {
    setupDb()
    setupSnapshot()
    invokeYeonjangMethod.mockReset()
  })

  afterEach(() => {
    realDb.closeDb()
    if (stateDir) rmSync(stateDir, { recursive: true, force: true })
    stateDir = ""
  })

  it("verifies the side-effect operation when observed focused target matches", async () => {
    const params = { ...baseParams }
    invokeYeonjangMethod.mockResolvedValueOnce({
      status: "dispatch_prepared",
      reasonCode: "browser_focus_dispatch_contract_ready",
      commandAccepted: true,
      observedFocusedTarget: target(),
    })

    const result = await executeToolWithSideEffectLedger({
      tool: yeonjangBrowserFocusTool,
      params,
      ctx: createContext(params),
    })

    expect(result.success).toBe(true)
    expect(operationRows()).toEqual([
      { state: "VERIFIED", adapter_id: "tool:yeonjang_browser_focus" },
    ])
    expect(JSON.stringify(result)).not.toMatch(/Private Admin Console|token=private|instance-private|window-private|tab-private|AppleScript/u)
    expect(serializedReceipts()).not.toMatch(/Private Admin Console|token=private|instance-private|window-private|tab-private|AppleScript/u)
  })

  it("keeps mismatched observed focused target as manual intervention", async () => {
    const params = { ...baseParams }
    invokeYeonjangMethod.mockResolvedValueOnce({
      status: "dispatch_prepared",
      reasonCode: "browser_focus_dispatch_contract_ready",
      commandAccepted: true,
      observedFocusedTarget: target({ targetAlias: "다른 브라우저", url: "https://example.test/other" }),
    })

    const result = await executeToolWithSideEffectLedger({
      tool: yeonjangBrowserFocusTool,
      params,
      ctx: createContext(params),
    })

    expect(result).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_MANUAL_INTERVENTION",
    })
    expect(operationRows()).toEqual([
      { state: "MANUAL_INTERVENTION", adapter_id: "tool:yeonjang_browser_focus" },
    ])
  })

  it("drops unsafe raw observed target payload instead of exposing it publicly", async () => {
    const params = { ...baseParams }
    invokeYeonjangMethod.mockResolvedValueOnce({
      status: "dispatch_prepared",
      reasonCode: "browser_focus_dispatch_contract_ready",
      commandAccepted: true,
      observedFocusedTarget: {
        rawTitle: "Private Admin Console",
        rawUrl: "https://example.test/admin?token=private",
        pid: 4401,
        windowId: "window-private",
        tabId: "tab-private",
      },
    })

    const result = await executeToolWithSideEffectLedger({
      tool: yeonjangBrowserFocusTool,
      params,
      ctx: createContext(params),
    })

    expect(result).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_MANUAL_INTERVENTION",
    })
    expect(JSON.stringify(result)).not.toMatch(/Private Admin Console|token=private|4401|window-private|tab-private/u)
    expect(serializedReceipts()).not.toMatch(/Private Admin Console|token=private|4401|window-private|tab-private/u)
  })
})
