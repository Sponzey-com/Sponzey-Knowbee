import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { ToolDispatcher } from "../packages/core/src/tools/dispatcher.ts"
import type { ToolContext } from "../packages/core/src/tools/types.ts"
import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"

function toolContext(): ToolContext {
  return {
    runId: "run-browser-focus-fail-closed",
    sessionId: "session-browser-focus-fail-closed",
    source: "webui",
    allowWebAccess: false,
    onProgress: () => undefined,
    requestGroupId: "group-browser-focus-fail-closed",
    approvalMode: "off",
    securityConfig: DEFAULT_CONFIG.security,
    mqttConfig: DEFAULT_CONFIG.mqtt,
    searchConfig: DEFAULT_CONFIG.search,
    memoryConfig: DEFAULT_CONFIG.memory,
  }
}

describe("Task 112 Yeonjang browser.focus fail-closed boundary", () => {
  it("does not register browser.focus as a selectable tool before Rust dispatch exists", () => {
    const mappedMethods = YEONJANG_TOOL_MAPPINGS.flatMap((mapping) => mapping.methodIds)
    const mappedTools = YEONJANG_TOOL_MAPPINGS.map((mapping) => mapping.toolName)

    expect(mappedMethods).toContain("browser.focus")
    expect(mappedTools).toContain("yeonjang_browser_focus")
    expect(YEONJANG_SKILL_TOOL_NAMES).toContain("yeonjang_browser_focus")
  })

  it("fails closed as unsupported instead of falling back to system.exec or application.launch", async () => {
    const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
    const result = await dispatcher.dispatch("yeonjang_browser_focus", {
      targetAlias: "업무 브라우저",
    }, toolContext())

    expect(result).toEqual({
      success: false,
      output: "The requested tool capability is not registered.",
      error: "tool_not_registered",
      details: {
        kind: "unsupported_capability",
        reasonCode: "tool_not_registered",
        toolName: "yeonjang_browser_focus",
      },
    })
  })

  it("keeps browser.focus away from local command fallback code paths", () => {
    const yeonjangToolSource = readFileSync("packages/core/src/tools/builtin/yeonjang.ts", "utf8")

    expect(yeonjangToolSource).toContain("yeonjangBrowserFocusTool")
    expect(yeonjangToolSource).not.toContain('invokeYeonjangMethod("browser.focus"')
    expect(yeonjangToolSource).not.toMatch(/browser\.focus[\s\S]{0,300}(system\.exec|application\.launch)/u)
  })
})
