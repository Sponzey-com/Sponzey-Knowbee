import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { DEFAULT_CONFIG } from "../packages/core/src/config/types.ts"
import { YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS } from "../packages/core/src/runs/yeonjang-live-smoke.ts"
import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import { registerBuiltinTools } from "../packages/core/src/tools/index.ts"
import { ToolDispatcher } from "../packages/core/src/tools/dispatcher.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"

const METHOD = "browser.active_tab_info"
const TOOL_NAME = "yeonjang_browser_active_tab_info"

function implementationBeforeTests(path: string): string {
  const source = readFileSync(path, "utf8")
  return source.split("#[cfg(test)]")[0] ?? source
}

function productionExposureAudit(): Record<string, boolean> {
  const dispatcher = new ToolDispatcher({ config: DEFAULT_CONFIG })
  registerBuiltinTools(dispatcher)
  const rustNode = implementationBeforeTests("Yeonjang/src/node.rs")
  const mappedMethods = YEONJANG_TOOL_MAPPINGS.flatMap((mapping) => mapping.methodIds)
  const mappedTools = YEONJANG_TOOL_MAPPINGS.map((mapping) => mapping.toolName)
  const registeredTools = dispatcher.getAll({ includeIsolated: true }).map((tool) => tool.name)

  return {
    rustInventoryAdvertised: /"name"\s*:\s*"browser\.active_tab_info"/u.test(rustNode),
    rustCapabilityMatrixAdvertised: /"browser\.active_tab_info"\s*:\s*capability_entry/u.test(rustNode),
    rustToolHealthAdvertised: /"browser\.active_tab_info"\s*:\s*browser_active_tab_info_tool_health_entry/u.test(rustNode),
    rustLiveHandlerRegistered: /"browser\.active_tab_info"\s*=>\s*dispatch_browser_active_tab_info_request/u.test(rustNode),
    toolMappingRegistered: mappedMethods.includes(METHOD) || mappedTools.includes(TOOL_NAME),
    skillCatalogRegistered: YEONJANG_SKILL_TOOL_NAMES.includes(TOOL_NAME as never),
    toolDispatcherRegistered: registeredTools.includes(TOOL_NAME),
    defaultLiveSmokeEnabled: YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS.includes(METHOD as never),
  }
}

describe("Task 227 Yeonjang browser.active_tab_info production exposure audit", () => {
  it("keeps inventory-only active tab info out of production execution surfaces", () => {
    expect(productionExposureAudit()).toEqual({
      rustInventoryAdvertised: true,
      rustCapabilityMatrixAdvertised: true,
      rustToolHealthAdvertised: true,
      rustLiveHandlerRegistered: false,
      toolMappingRegistered: false,
      skillCatalogRegistered: false,
      toolDispatcherRegistered: false,
      defaultLiveSmokeEnabled: false,
    })
  })

  it("keeps the audit result as code-only booleans without raw source or path disclosure", () => {
    const audit = productionExposureAudit()
    const serialized = JSON.stringify(audit)

    expect(Object.values(audit).every((value) => typeof value === "boolean")).toBe(true)
    expect(serialized).not.toMatch(/dispatch_browser_active_tab_info_request|capability_entry|browser_active_tab_info_tool_health_entry/u)
    expect(serialized).not.toMatch(/Yeonjang\/src|packages\/core|\/Users\/|https?:\/\//u)
    expect(serialized).not.toContain(METHOD)
    expect(serialized).not.toContain(TOOL_NAME)
  })
})
