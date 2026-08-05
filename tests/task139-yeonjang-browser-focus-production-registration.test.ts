import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { closeDb, insertSession } from "../packages/core/src/db/index.js"
import { eventBus } from "../packages/core/src/events/index.js"
import { createRootRun } from "../packages/core/src/runs/store.ts"
import { registerBuiltinTools } from "../packages/core/src/tools/index.ts"
import { yeonjangBrowserFocusTool } from "../packages/core/src/tools/builtin/yeonjang.ts"
import { ToolDispatcher } from "../packages/core/src/tools/dispatcher.ts"
import type { ToolContext } from "../packages/core/src/tools/types.ts"
import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"
import { initializeTestDbRuntime } from "./fixtures/runtime-db.ts"

const tempDirs: string[] = []

beforeEach(() => {
  closeDb()
  const stateDir = mkdtempSync(join(tmpdir(), "knowbee-browser-focus-registration-"))
  tempDirs.push(stateDir)
  initializeTestDbRuntime(stateDir)
  insertSession({
    id: "session-browser-focus-production-registration",
    source: "webui",
    source_id: null,
    created_at: Date.now(),
    updated_at: Date.now(),
    summary: null,
  })
  createRootRun({
    id: "run-browser-focus-production-registration",
    sessionId: "session-browser-focus-production-registration",
    prompt: "브라우저를 앞으로 가져와줘",
    source: "webui",
    requestGroupId: "group-browser-focus-production-registration",
  })
})

afterEach(() => {
  closeDb()
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

function toolContext(approvalMode: "always" | "on-miss" | "off" = "off"): ToolContext {
  return {
    runId: "run-browser-focus-production-registration",
    sessionId: "session-browser-focus-production-registration",
    requestGroupId: "group-browser-focus-production-registration",
    workDir: "/tmp",
    artifactStorage: { rootDir: "/tmp/knowbee-artifacts" },
    source: "webui",
    allowWebAccess: false,
    onProgress: () => undefined,
    signal: new AbortController().signal,
    securityConfig: { ...DEFAULT_CONFIG.security, approvalMode },
    mqttConfig: DEFAULT_CONFIG.mqtt,
    searchConfig: DEFAULT_CONFIG.search,
    memoryConfig: DEFAULT_CONFIG.memory,
  }
}

describe("Task 139 Yeonjang browser.focus production registration", () => {
  it("registers browser.focus in Yeonjang mapping and Skill catalog", () => {
    const mapping = YEONJANG_TOOL_MAPPINGS.find((candidate) => candidate.toolName === "yeonjang_browser_focus")

    expect(mapping).toMatchObject({
      toolName: "yeonjang_browser_focus",
      methodIds: ["browser.focus"],
      group: "browser",
      riskLevel: "moderate",
      requiresApproval: true,
      permissionSetting: "allow_browser_control",
    })
    expect(YEONJANG_SKILL_TOOL_NAMES).toContain("yeonjang_browser_focus")
  })

  it("registers the ToolDispatcher tool but blocks as approval-required instead of unsupported", async () => {
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    registerBuiltinTools(dispatcher)

    expect(dispatcher.get("yeonjang_browser_focus")).toBeDefined()

    const result = await dispatcher.dispatch("yeonjang_browser_focus", {
      targetAlias: "업무 브라우저",
    }, toolContext())

    expect(result).toMatchObject({
      success: false,
      error: "approval_required",
      details: {
        kind: "tool_policy_denied",
        reasonCode: "approval_required",
      },
    })
    expect(result.error).not.toBe("tool_not_registered")
  })

  it("blocks after explicit approval when the pre-dispatch fixture is missing", async () => {
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    registerBuiltinTools(dispatcher)
    const detach = eventBus.on("approval.request", ({ resolve }) => resolve("allow_once"))

    try {
      const result = await dispatcher.dispatch("yeonjang_browser_focus", {
        targetAlias: "업무 브라우저",
      }, toolContext("on-miss"))

      expect(result).toMatchObject({
        success: false,
        error: "SIDE_EFFECT_MANUAL_INTERVENTION",
        details: {
          kind: "side_effect_manual_intervention",
          reasonCode: "side_effect_irreversible",
        },
      })
      expect(JSON.stringify(result)).not.toMatch(/Private Admin Console|token=private|window-private|tab-private|AppleScript/u)
    } finally {
      detach()
    }
  })

  it("requires a resolvable Yeonjang target before transport invocation", async () => {
    const result = await yeonjangBrowserFocusTool.execute({
      targetAlias: "업무 브라우저",
    }, {
      ...toolContext("off"),
      authorizationReceipt: {
        policyDecisionId: "policy-browser-focus",
        toolName: "yeonjang_browser_focus",
        paramsHash: "not-used-by-direct-tool-test",
        policyDecision: "allow",
        permissionScope: "yeonjang:browser.focus",
        runId: "run-browser-focus-production-registration",
        requestGroupId: "group-browser-focus-production-registration",
        approvalDecision: "allow_once",
        approvalId: "approval-browser-focus",
      },
    })

    expect(result).toMatchObject({
      success: false,
      error: "YEONJANG_TARGET_SELECTION_REQUIRED",
      details: {
        selectionStatus: "selection_required",
      },
    })
  })

  it("injects the immutable runtime admission issuer into dispatcher tool contexts", async () => {
    const issuer = {
      issue: vi.fn(() => ({ ok: false as const, reasonCode: "not_used" })),
    }
    const execute = vi.fn(async (_params: Record<string, unknown>, ctx: ToolContext) => ({
      success: true,
      output: "runtime issuer captured",
      details: { issuerInjected: ctx.yeonjangBrowserFocusExecutionAdmissionIssuer === issuer },
    }))
    const dispatcher = new ToolDispatcher({
      config: DEFAULT_CONFIG,
      yeonjangBrowserFocusExecutionAdmissionIssuer: issuer,
    })
    dispatcher.register({
      name: "runtime_issuer_capture",
      description: "test-only runtime dependency capture",
      parameters: { type: "object", properties: {} },
      riskLevel: "safe",
      requiresApproval: false,
      execute,
    })

    await expect(dispatcher.dispatch("runtime_issuer_capture", {}, toolContext())).resolves.toMatchObject({
      success: true,
      details: { issuerInjected: true },
    })
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it("keeps the browser.focus tool implementation free of local command fallback and raw target disclosure", () => {
    const source = readFileSync("packages/core/src/tools/builtin/yeonjang.ts", "utf8")
    const focusToolIndex = source.indexOf("yeonjangBrowserFocusTool")

    expect(focusToolIndex).toBeGreaterThan(-1)
    const focusToolSource = source.slice(focusToolIndex, focusToolIndex + 8_000)
    expect(focusToolSource).toContain('invokeYeonjangMethod<YeonjangBrowserFocusResult>("browser.focus"')
    expect(focusToolSource).not.toMatch(/browser\.focus[\s\S]{0,1200}(system\.exec|application\.launch)/u)
    expect(focusToolSource).not.toContain("rawTitle")
    expect(focusToolSource).not.toContain("rawUrl")
    expect(focusToolSource).not.toContain("AppleScript")
  })
})
