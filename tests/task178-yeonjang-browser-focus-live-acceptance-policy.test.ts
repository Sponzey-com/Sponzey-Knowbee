import { createHash } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  projectYeonjangBrowserFocusTarget,
  type YeonjangBrowserFocusTargetProjection,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"
import { expandYeonjangLiveAcceptanceSelections } from "../packages/core/src/release/live-acceptance-verified-executor.ts"
import { YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS } from "../packages/core/src/runs/yeonjang-live-smoke.ts"
import type { YeonjangLiveSmokeSelection } from "../packages/core/src/runs/yeonjang-live-smoke-runner.ts"
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

const NOW = Date.parse("2026-07-22T01:00:00.000Z")

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

function defaultSelection(): YeonjangLiveSmokeSelection {
  return Object.freeze({
    scenario: Object.freeze({
      id: "live-acceptance:yeonjang-file-list",
      expectedInstanceId: "instance:office",
      expectedSessionId: "session:office:1",
      expectedMethod: "file.list",
      params: Object.freeze({ path: "/Users/example/Documents" }),
      readOnly: true,
    }),
    instance: Object.freeze({
      instanceId: "instance:office",
      publicName: "Office",
      sessionId: "session:office:1",
      status: "connected",
      observedAt: NOW,
      duplicateActiveIdentityCount: 0,
      trustState: "trusted",
      runnableTarget: true,
    }),
  })
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
    sessionId: "session-178",
    runId: "run-178",
    requestGroupId: "run-178",
    workDir: process.cwd(),
    userMessage: "업무 브라우저를 앞으로 가져와줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: vi.fn(),
    signal: new AbortController().signal,
    ...(withApproval
      ? {
          authorizationReceipt: {
            policyDecisionId: "policy-178",
            toolName: "yeonjang_browser_focus",
            paramsHash: hash(params),
            policyDecision: "allow",
            permissionScope: "yeonjang:browser.focus",
            runId: "run-178",
            requestGroupId: "run-178",
            approvalDecision: "allow_run",
            approvalId: "approval-178",
          },
        }
      : {}),
  }
}

function setupDb() {
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-yeonjang-browser-focus-live-policy-"))
  initializeTestDbRuntime(stateDir)
  realDb.insertSession({
    id: "session-178",
    source: "telegram",
    source_id: null,
    created_at: NOW,
    updated_at: NOW,
    summary: null,
  })
  createRootRun({
    id: "run-178",
    sessionId: "session-178",
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

describe("Task 178 Yeonjang browser.focus live acceptance policy", () => {
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

  it("keeps browser.focus out of read-only live smoke and default live acceptance expansion", () => {
    expect(YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS).not.toContain("browser.focus")

    const expanded = expandYeonjangLiveAcceptanceSelections(defaultSelection())
    expect(expanded.map((item) => item.scenario.expectedMethod)).toEqual([
      "node.capabilities",
      "system.info",
      "camera.list",
      "file.list",
      "disk.usage",
    ])
    expect(expanded.some((item) => item.scenario.expectedMethod === "browser.focus")).toBe(false)
    expect(expanded.every((item) => item.scenario.readOnly)).toBe(true)
  })

  it("requires explicit approval, target projection, and observed target evidence for manual focus acceptance", async () => {
    const missingApproval = { ...baseParams }
    await expect(
      executeToolWithSideEffectLedger({
        tool: yeonjangBrowserFocusTool,
        params: missingApproval,
        ctx: createContext(missingApproval, false),
      }),
    ).resolves.toMatchObject({
      success: false,
      error: "SIDE_EFFECT_OPERATION_BLOCKED",
      details: { reasonCode: "side_effect_authorization_required" },
    })
    expect(invokeYeonjangMethod).not.toHaveBeenCalled()

    const missingTarget = { ...baseParams, targetAlias: "", processName: "", title: "", url: "" }
    await expect(
      yeonjangBrowserFocusTool.execute(missingTarget, createContext(missingTarget)),
    ).resolves.toMatchObject({
      success: false,
      error: "target_identity_required",
    })
    expect(invokeYeonjangMethod).not.toHaveBeenCalled()

    invokeYeonjangMethod.mockResolvedValueOnce({
      status: "dispatch_prepared",
      reasonCode: "browser_focus_dispatch_contract_ready",
      commandAccepted: true,
    })
    await expect(
      executeToolWithSideEffectLedger({
        tool: yeonjangBrowserFocusTool,
        params: { ...baseParams },
        ctx: createContext({ ...baseParams }),
      }),
    ).resolves.toMatchObject({
      success: false,
      error: "SIDE_EFFECT_MANUAL_INTERVENTION",
      details: {
        kind: "side_effect_manual_intervention",
        goalValidationCandidate: true,
      },
    })

    const verifiedParams = {
      ...baseParams,
      targetAlias: "업무 브라우저 검증",
      url: "https://example.test/admin/verified",
    }
    invokeYeonjangMethod.mockResolvedValueOnce({
      status: "dispatch_prepared",
      reasonCode: "browser_focus_dispatch_contract_ready",
      commandAccepted: true,
      observedFocusedTarget: target({
        targetAlias: verifiedParams.targetAlias,
        url: verifiedParams.url,
      }),
    })
    await expect(
      executeToolWithSideEffectLedger({
        tool: yeonjangBrowserFocusTool,
        params: verifiedParams,
        ctx: createContext(verifiedParams),
      }),
    ).resolves.toMatchObject({
      success: true,
      details: {
        method: "browser.focus",
        postCheck: {
          state: "VERIFIED",
          reasonCode: "focused_target_matched",
        },
      },
    })
    expect(invokeYeonjangMethod).toHaveBeenCalledTimes(2)
  })
})
