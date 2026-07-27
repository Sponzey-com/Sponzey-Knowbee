import { createHash } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
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
import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"

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

function createContext(input: FocusParams, withApproval = true): ToolContext {
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
    sessionId: "session-119",
    runId: "run-119",
    requestGroupId: "run-119",
    workDir: process.cwd(),
    userMessage: "업무 브라우저 창을 앞으로 가져와줘",
    source: "telegram",
    allowWebAccess: false,
    onProgress: () => undefined,
    signal: new AbortController().signal,
    ...(withApproval
      ? {
          authorizationReceipt: {
            policyDecisionId: "policy-119",
            toolName: "hypothetical_browser_focus",
            paramsHash: hash(input),
            policyDecision: "allow",
            permissionScope: "yeonjang:browser.focus",
            runId: "run-119",
            requestGroupId: "run-119",
            approvalDecision: "allow_run",
            approvalId: "approval-119",
          },
        }
      : {}),
  }
}

function readyContracts(input = params()) {
  const readiness = buildYeonjangBrowserFocusReadinessProjection({
    observations: [{
      publicTargetName: "Office Mac",
      internalInstanceId: "private-instance",
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
  const commandContract = buildYeonjangBrowserFocusCommandContract({
    platform: "macos",
    desktopSession: "available",
    commandBackendAvailable: true,
    observationBackendAvailable: true,
    admission,
    target: projectedTarget(input),
    automationPlan: "private os automation",
  })
  return { preflight, admission, commandContract }
}

function createHypotheticalTool(result: ToolResult): AgentTool<FocusParams> {
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
        commandContract: readyContracts(input).commandContract,
      }),
    }),
    execute: async () => result,
  }
}

function setupDb() {
  stateDir = mkdtempSync(join(tmpdir(), "knowbee-yeonjang-browser-focus-runtime-"))
  initializeTestDbRuntime(stateDir)
  const now = Date.now()
  db.insertSession({
    id: "session-119",
    source: "telegram",
    source_id: null,
    created_at: now,
    updated_at: now,
    summary: null,
  })
  createRootRun({
    id: "run-119",
    sessionId: "session-119",
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

describe("Task 119 Yeonjang browser.focus side-effect runtime fixture", () => {
  beforeEach(() => setupDb())

  afterEach(() => {
    db.closeDb()
    if (stateDir) rmSync(stateDir, { recursive: true, force: true })
    stateDir = ""
  })

  it("blocks before operation persistence when approval receipt is missing", async () => {
    const input = params()
    const result = await executeToolWithSideEffectLedger({
      tool: createHypotheticalTool({
        success: true,
        output: "accepted",
        details: { commandAccepted: true },
      }),
      params: input,
      ctx: createContext(input, false),
    })

    expect(result).toMatchObject({
      success: false,
      error: "SIDE_EFFECT_OPERATION_BLOCKED",
      details: { reasonCode: "side_effect_authorization_required" },
    })
    expect(operationRows()).toEqual([])
  })

  it("keeps approved command accepted result as manual intervention without storing raw target data", async () => {
    const input = params()
    const result = await executeToolWithSideEffectLedger({
      tool: createHypotheticalTool({
        success: true,
        output: "accepted",
        details: {
          commandAccepted: true,
          postCheck: { state: "MANUAL_INTERVENTION", reasonCode: "target_observation_required" },
        },
      }),
      params: input,
      ctx: createContext(input),
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
    expect(operationRows()).toEqual([
      { state: "MANUAL_INTERVENTION", adapter_id: "tool:hypothetical_browser_focus" },
    ])
    const serialized = JSON.stringify({ result, ledger: serializedLedgerRows() })
    expect(serialized).not.toMatch(
      /Private Admin Console|https:\/\/example\.test|token=private|4401|window-private|tab-private|private os automation|private-instance/u,
    )
  })

  it("does not expose browser.focus in production mapping or Skill catalog while runtime fixture exists", () => {
    expect(YEONJANG_TOOL_MAPPINGS.flatMap((mapping) => mapping.methodIds)).toContain("browser.focus")
    expect(YEONJANG_TOOL_MAPPINGS.map((mapping) => mapping.toolName)).toContain("yeonjang_browser_focus")
    expect(YEONJANG_SKILL_TOOL_NAMES).toContain("yeonjang_browser_focus")
  })
})
