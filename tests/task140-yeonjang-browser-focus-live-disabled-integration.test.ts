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

const baseParams = {
  extensionId: "yeonjang-main",
  targetAlias: "업무 브라우저",
  processName: "Google Chrome",
  title: "Private Admin Console",
  url: "https://example.test/admin?token=private",
} as const

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
    sessionId: "session-140",
    runId: "run-140",
    requestGroupId: "run-140",
    workDir: process.cwd(),
    userMessage: "업무 브라우저를 앞으로 가져와줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    ...(withApproval
      ? {
          authorizationReceipt: {
            policyDecisionId: "policy-140",
            toolName: "yeonjang_browser_focus",
            paramsHash: hash(params),
            policyDecision: "allow",
            permissionScope: "yeonjang:browser.focus",
            runId: "run-140",
            requestGroupId: "run-140",
            approvalDecision: "allow_run",
            approvalId: "approval-140",
          },
        }
      : {}),
  }
}

function setupDb() {
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-yeonjang-browser-focus-"))
  initializeTestDbRuntime(stateDir)
  const now = Date.now()
  realDb.insertSession({
    id: "session-140",
    source: "telegram",
    source_id: null,
    created_at: now,
    updated_at: now,
    summary: null,
  })
  createRootRun({
    id: "run-140",
    sessionId: "session-140",
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

describe("Task 140 Yeonjang browser.focus live-disabled integration", () => {
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

  it("creates the pre-dispatch receipt internally after approval", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce({
      status: "dispatch_prepared",
      reasonCode: "browser_focus_dispatch_contract_ready",
      invokeNow: false,
      commandAccepted: true,
      message: "prepared",
    })

    const result = await executeToolWithSideEffectLedger({
      tool: yeonjangBrowserFocusTool,
      params: { ...baseParams },
      ctx: createContext({ ...baseParams }),
    })

    expect(result).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_MANUAL_INTERVENTION",
      details: {
        kind: "side_effect_manual_intervention",
        goalValidationCandidate: true,
      },
    })
    expect(invokeYeonjangMethod).toHaveBeenCalledTimes(1)
    expect(invokeYeonjangMethod).toHaveBeenCalledWith(
      "browser.focus",
      expect.objectContaining({
        target: expect.objectContaining({
          displayName: "업무 브라우저",
          urlScheme: "https",
        }),
        preDispatch: expect.objectContaining({
          status: "dispatch_prepared",
          invokeNow: false,
        }),
      }),
      expect.objectContaining({ extensionId: "yeonjang-main" }),
    )
    expect(operationRows()).toEqual([
      { state: "MANUAL_INTERVENTION", adapter_id: "tool:yeonjang_browser_focus" },
    ])
    expect(JSON.stringify(result)).not.toMatch(/Private Admin Console|token=private|instance-private|window-private|tab-private|AppleScript/u)
    expect(serializedReceipts()).not.toMatch(/Private Admin Console|token=private|instance-private|window-private|tab-private|AppleScript/u)
  })

  it("does not invoke Yeonjang when approval is missing", async () => {
    const result = await executeToolWithSideEffectLedger({
      tool: yeonjangBrowserFocusTool,
      params: { ...baseParams },
      ctx: createContext({ ...baseParams }, false),
    })

    expect(result).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_OPERATION_BLOCKED",
      details: { reasonCode: "side_effect_authorization_required" },
    })
    expect(invokeYeonjangMethod).not.toHaveBeenCalled()
  })

  it("adds a signed execution admission only from the injected runtime issuer", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce({
      status: "dispatch_prepared",
      reasonCode: "browser_focus_dispatch_contract_ready",
      invokeNow: false,
      commandAccepted: true,
      message: "prepared",
    })
    const issue = vi.fn(() => ({
      ok: true as const,
      admission: {
        schemaVersion: "knowbee.yeonjang-browser-focus-execution-admission.v1" as const,
        method: "browser.focus" as const,
        extensionId: "yeonjang-main",
        sessionId: "target-session-1",
        targetHash: "sha256:internal-target-hash",
        approvalScopeId: "yeonjang:browser.focus",
        expiresAt: "2026-07-23T09:01:00.000Z",
        nonce: "nonce-private",
        signature: "hmac-sha256:private-signature",
      },
    }))

    await executeToolWithSideEffectLedger({
      tool: yeonjangBrowserFocusTool,
      params: { ...baseParams },
      ctx: {
        ...createContext({ ...baseParams }),
        yeonjangBrowserFocusExecutionAdmissionIssuer: { issue },
      },
    })

    expect(issue).toHaveBeenCalledWith(expect.objectContaining({
      extensionId: "yeonjang-main",
      sessionId: "target-session-1",
      approvalScopeId: "yeonjang:browser.focus",
      targetHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
    }))
    expect(invokeYeonjangMethod).toHaveBeenCalledWith(
      "browser.focus",
      expect.objectContaining({
        executionAdmission: expect.objectContaining({
          nonce: "nonce-private",
          signature: "hmac-sha256:private-signature",
        }),
        preDispatch: expect.objectContaining({
          invokeNow: true,
        }),
      }),
      expect.any(Object),
    )
  })

  it("does not invoke Yeonjang when the injected issuer cannot create an admission", async () => {
    const result = await yeonjangBrowserFocusTool.execute({ ...baseParams }, {
      ...createContext({ ...baseParams }),
      yeonjangBrowserFocusExecutionAdmissionIssuer: {
        issue: () => ({ ok: false, reasonCode: "browser_focus_execution_admission_key_unavailable" }),
      },
    })

    expect(result).toMatchObject({
      success: false,
      error: "browser_focus_execution_admission_key_unavailable",
      details: { reasonCode: "browser_focus_execution_admission_key_unavailable" },
    })
    expect(invokeYeonjangMethod).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toMatch(/nonce-private|private-signature|pairing-secret/iu)
  })

  it("ignores caller-provided legacy receipts and creates its own prepared receipt", async () => {
    invokeYeonjangMethod.mockResolvedValueOnce({
      status: "dispatch_prepared",
      reasonCode: "browser_focus_dispatch_contract_ready",
      commandAccepted: true,
    })
    const params = {
      ...baseParams,
      preDispatch: { status: "forged", invokeNow: true },
      macosBridge: { status: "bridge_verified" },
    }

    await yeonjangBrowserFocusTool.execute(params, createContext(params))

    expect(invokeYeonjangMethod).toHaveBeenCalledWith(
      "browser.focus",
      expect.objectContaining({
        preDispatch: expect.objectContaining({
          status: "dispatch_prepared",
          invokeNow: false,
        }),
      }),
      expect.any(Object),
    )
  })
})
