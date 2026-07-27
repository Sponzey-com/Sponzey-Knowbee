import { createHash } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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
const { yeonjangBrowserOpenUrlTool } = await import("../packages/core/src/tools/builtin/yeonjang.ts")

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
    sessionId: "session-108",
    runId: "run-108",
    requestGroupId: "run-108",
    workDir: process.cwd(),
    userMessage: "원격 컴퓨터 브라우저로 페이지를 열어줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    ...(withApproval
      ? {
          authorizationReceipt: {
            policyDecisionId: "policy-108",
            toolName: "yeonjang_browser_open_url",
            paramsHash: hash(params),
            policyDecision: "allow",
            permissionScope: "yeonjang:browser.open_url",
            runId: "run-108",
            requestGroupId: "run-108",
            approvalDecision: "allow_run",
            approvalId: "approval-108",
          },
        }
      : {}),
  }
}

function setupDb() {
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-yeonjang-browser-open-url-"))
  initializeTestDbRuntime(stateDir)
  const now = Date.now()
  realDb.insertSession({
    id: "session-108",
    source: "telegram",
    source_id: null,
    created_at: now,
    updated_at: now,
    summary: null,
  })
  createRootRun({
    id: "run-108",
    sessionId: "session-108",
    prompt: "원격 컴퓨터 브라우저로 페이지를 열어줘",
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
      methods: ["browser.open_url"],
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

describe("Task 108 Yeonjang browser.open_url side-effect integration", () => {
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

  it("blocks browser.open_url before Yeonjang invoke when approval receipt is missing", async () => {
    const params = {
      extensionId: "yeonjang-main",
      url: "https://example.test/dashboard?token=private",
    }

    const result = await executeToolWithSideEffectLedger({
      tool: yeonjangBrowserOpenUrlTool,
      params,
      ctx: createContext(params, false),
    })

    expect(result).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_OPERATION_BLOCKED",
      details: { reasonCode: "side_effect_authorization_required" },
    })
    expect(invokeYeonjangMethod).not.toHaveBeenCalled()
    expect(operationRows()).toEqual([])
  })

  it("records browser.open_url as manual until LLM goal validation confirms the user outcome", async () => {
    const params = {
      extensionId: "yeonjang-main",
      url: "https://example.test/dashboard?token=private",
    }
    invokeYeonjangMethod.mockResolvedValueOnce({
      urlScheme: "https",
      opened: true,
      postCheck: {
        verified: false,
        reason: "llm_goal_validation_required",
      },
      message: "accepted",
    })

    const result = await executeToolWithSideEffectLedger({
      tool: yeonjangBrowserOpenUrlTool,
      params,
      ctx: createContext(params),
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
    expect(invokeYeonjangMethod).toHaveBeenCalledTimes(1)
    expect(invokeYeonjangMethod).toHaveBeenCalledWith(
      "browser.open_url",
      { url: params.url },
      expect.objectContaining({ extensionId: "yeonjang-main" }),
    )
    expect(operationRows()).toEqual([
      { state: "MANUAL_INTERVENTION", adapter_id: "tool:yeonjang_browser_open_url" },
    ])
  })

  it("does not store the raw URL in public tool details or side-effect observation", async () => {
    const params = {
      extensionId: "yeonjang-main",
      url: "https://example.test/dashboard?token=private",
    }
    invokeYeonjangMethod.mockResolvedValueOnce({
      urlScheme: "https",
      opened: true,
      postCheck: {
        verified: false,
        reason: "llm_goal_validation_required",
      },
      message: "accepted",
    })

    const result = await yeonjangBrowserOpenUrlTool.execute(params, createContext(params))
    const observation = await yeonjangBrowserOpenUrlTool.sideEffect!.observe(
      params,
      createContext(params),
      result,
    )
    const publicPayload = JSON.stringify({ details: result.details, observation })

    expect(result.success).toBe(true)
    expect(publicPayload).not.toContain(params.url)
    expect(publicPayload).not.toContain("token=private")
    expect(publicPayload).toContain("urlHash")
    expect(publicPayload).toContain("urlLength")
    expect(publicPayload).toContain("llm_goal_validation_required")
  })
})
