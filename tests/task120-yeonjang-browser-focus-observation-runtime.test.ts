import { createHash } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  buildYeonjangBrowserFocusCommandContract,
  buildYeonjangBrowserFocusReadinessProjection,
  evaluateYeonjangBrowserFocusPreflight,
  evaluateYeonjangBrowserFocusToolAdmission,
  projectYeonjangBrowserFocusTarget,
  selectYeonjangBrowserFocusReadyTargets,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"
import { createYeonjangBrowserFocusSideEffect } from "../packages/core/src/tools/builtin/yeonjang-browser-focus-side-effect.ts"
import { executeToolWithSideEffectLedger } from "../packages/core/src/tools/side-effect-runtime.ts"
import type { AgentTool, ToolContext, ToolResult } from "../packages/core/src/tools/types.ts"

const db = await import("../packages/core/src/db/index.js")
const { createRootRun } = await import("../packages/core/src/runs/store.ts")
const { initializeTestDbRuntime } = await import("./fixtures/runtime-db.ts")

let stateDir = ""

interface FocusParams {
  extensionId: string
  targetAlias: string
  processName: string
  title: string
  url: string
  pid: number
  windowId: string
  tabId: string
}

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

function params(): FocusParams {
  return {
    extensionId: "yeonjang-main",
    targetAlias: "업무 브라우저",
    processName: "Google Chrome",
    title: "Private Admin Console",
    url: "https://example.test/admin?token=private",
    pid: 4401,
    windowId: "window-private",
    tabId: "tab-private",
  }
}

function projectedTarget(input = params()) {
  const projected = projectYeonjangBrowserFocusTarget(input)
  expect(projected.ok).toBe(true)
  if (!projected.ok) throw new Error("target projection failed")
  return projected.projection
}

function otherTarget() {
  const projected = projectYeonjangBrowserFocusTarget({
    targetAlias: "다른 브라우저",
    processName: "Safari",
    title: "Private Other Window",
    url: "https://other.example.test/?token=other",
    pid: 9900,
    windowId: "window-other",
    tabId: "tab-other",
  })
  expect(projected.ok).toBe(true)
  if (!projected.ok) throw new Error("other target projection failed")
  return projected.projection
}

function createContext(input: FocusParams): ToolContext {
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
    sessionId: "session-120",
    runId: "run-120",
    requestGroupId: "run-120",
    workDir: process.cwd(),
    userMessage: "업무 브라우저 창을 앞으로 가져와줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: () => undefined,
    signal: new AbortController().signal,
    authorizationReceipt: {
      policyDecisionId: "policy-120",
      toolName: "hypothetical_browser_focus",
      paramsHash: hash(input),
      policyDecision: "allow",
      permissionScope: "yeonjang:browser.focus",
      runId: "run-120",
      requestGroupId: "run-120",
      approvalDecision: "allow_run",
      approvalId: "approval-120",
    },
  }
}

function readyContracts(input = params()) {
  const readiness = buildYeonjangBrowserFocusReadinessProjection({
    observations: [{
      publicTargetName: "Office Mac",
      platform: "macos",
      desktopSession: "available",
      capabilitySupported: true,
      permissionGranted: true,
      commandBackendAvailable: true,
      observationBackendAvailable: true,
      rawFocusedTarget: input,
    }],
  })
  const preflight = evaluateYeonjangBrowserFocusPreflight({
    capabilitySupported: true,
    approvalGranted: true,
    target: projectedTarget(input),
  })
  const admission = evaluateYeonjangBrowserFocusToolAdmission({
    readyTargets: selectYeonjangBrowserFocusReadyTargets(readiness),
    approvalGranted: true,
    preflight,
  })
  return buildYeonjangBrowserFocusCommandContract({
    platform: "macos",
    desktopSession: "available",
    commandBackendAvailable: true,
    observationBackendAvailable: true,
    admission,
    target: projectedTarget(input),
    automationPlan: "private os automation",
  })
}

function createHypotheticalTool(execute: () => Promise<ToolResult>): AgentTool<FocusParams> {
  return {
    name: "hypothetical_browser_focus",
    description: "Hypothetical browser focus tool used only for contract tests.",
    parameters: { type: "object", properties: {} },
    riskLevel: "moderate",
    requiresApproval: true,
    runtimeHealthMode: "required",
    runtimeMethodIds: ["browser.focus"],
    sideEffect: createYeonjangBrowserFocusSideEffect<FocusParams>({
      target: projectedTarget,
      targetRef: (input) => `yeonjang:${input.extensionId}:browser.focus`,
      expectedState: (input) => ({
        method: "browser.focus",
        target: projectedTarget(input),
        commandContract: readyContracts(input),
      }),
    }),
    execute,
  }
}

function setupDb() {
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-yeonjang-browser-focus-observation-"))
  initializeTestDbRuntime(stateDir)
  const now = Date.now()
  db.insertSession({
    id: "session-120",
    source: "telegram",
    source_id: null,
    created_at: now,
    updated_at: now,
    summary: null,
  })
  createRootRun({
    id: "run-120",
    sessionId: "session-120",
    prompt: "업무 브라우저 창을 앞으로 가져와줘",
    source: "telegram",
  })
}

function operationRows(): Array<{ state: string; adapter_id: string }> {
  return db
    .getDb()
    .prepare<[], { state: string; adapter_id: string }>(
      "SELECT state, adapter_id FROM side_effect_operations ORDER BY created_at",
    )
    .all()
}

function serializedLedgerRows(): string {
  return JSON.stringify({
    operations: db.getDb().prepare("SELECT * FROM side_effect_operations").all(),
    receipts: db.getDb().prepare("SELECT * FROM side_effect_operation_receipts").all(),
  })
}

describe("Task 120 Yeonjang browser.focus observed target runtime branches", () => {
  beforeEach(() => setupDb())

  afterEach(() => {
    db.closeDb()
    if (stateDir) rmSync(stateDir, { recursive: true, force: true })
    stateDir = ""
  })

  it("keeps operation manual when observed focused target does not match expected projection", async () => {
    const input = params()
    const tool = createHypotheticalTool(async () => ({
      success: true,
      output: "accepted",
      details: {
        commandAccepted: true,
        observedFocusedTarget: otherTarget(),
      },
    }))

    const result = await executeToolWithSideEffectLedger({
      tool,
      params: input,
      ctx: createContext(input),
    })

    expect(result).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_MANUAL_INTERVENTION",
    })
    expect(operationRows()).toEqual([
      { state: "MANUAL_INTERVENTION", adapter_id: "tool:hypothetical_browser_focus" },
    ])
    expect(serializedLedgerRows()).not.toMatch(
      /Private Other Window|https:\/\/other\.example|token=other|9900|window-other|tab-other/u,
    )
  })

  it("verifies operation when observed focused target matches and duplicate replay does not execute again", async () => {
    const input = params()
    const execute = vi.fn(async () => ({
      success: true,
      output: "accepted",
      details: {
        commandAccepted: true,
        observedFocusedTarget: projectedTarget(input),
      },
    }))
    const tool = createHypotheticalTool(execute)

    const first = await executeToolWithSideEffectLedger({
      tool,
      params: input,
      ctx: createContext(input),
    })
    const replay = await executeToolWithSideEffectLedger({
      tool,
      params: input,
      ctx: createContext(input),
    })

    expect(first.success).toBe(true)
    expect(replay).toMatchObject({
      success: true,
      details: { kind: "side_effect_duplicate_verified" },
    })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(operationRows()).toEqual([
      { state: "VERIFIED", adapter_id: "tool:hypothetical_browser_focus" },
    ])
    const serialized = JSON.stringify({ first, replay, ledger: serializedLedgerRows() })
    expect(serialized).not.toMatch(
      /Private Admin Console|https:\/\/example\.test|token=private|4401|window-private|tab-private|private os automation/u,
    )
  })
})
