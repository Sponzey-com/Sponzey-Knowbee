import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import type { ToolDispatcher } from "../packages/core/src/tools/dispatcher.ts"

import {
  YEONJANG_TOOL_MAPPINGS,
  YEONJANG_TOOL_NAMES,
} from "../packages/core/src/yeonjang/tool-mapping.ts"
import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import { registerBuiltinTools } from "../packages/core/src/tools/index.ts"

interface YeonjangInventory {
  rustMethods: string[]
  skillTools: string[]
}

function inventory(): YeonjangInventory {
  return JSON.parse(readFileSync(join(process.cwd(), "docs/yeonjang/capability-inventory.json"), "utf8")) as YeonjangInventory
}

describe("task014 Yeonjang tool mapping contract", () => {
  it("keeps every yeonjang-prefixed skill tool in the explicit mapping manifest", () => {
    const yeonjangSkillTools = YEONJANG_SKILL_TOOL_NAMES.filter((name) => name.startsWith("yeonjang_"))

    expect(YEONJANG_TOOL_NAMES).toEqual(yeonjangSkillTools)
    expect(new Set(YEONJANG_TOOL_NAMES).size).toBe(YEONJANG_TOOL_NAMES.length)
  })

  it("keeps dispatcher registration aligned with the mapping manifest", () => {
    const registered: Array<{ name: string }> = []
    const dispatcher = {
      registerAll(tools: Array<{ name: string }>) {
        registered.push(...tools)
      },
    } as unknown as ToolDispatcher

    registerBuiltinTools(dispatcher)

    expect(registered.map((tool) => tool.name)).toEqual(expect.arrayContaining([...YEONJANG_TOOL_NAMES]))
  })

  it("keeps inventory skill tools aligned with the mapping manifest", () => {
    const yeonjangInventoryTools = inventory().skillTools.filter((name) => name.startsWith("yeonjang_"))

    expect(yeonjangInventoryTools).toEqual([...YEONJANG_TOOL_NAMES])
  })

  it("maps every runtime method to a Rust method in inventory", () => {
    const rustMethods = new Set(inventory().rustMethods)
    const missing = YEONJANG_TOOL_MAPPINGS
      .flatMap((mapping) => mapping.methodIds)
      .filter((method) => !rustMethods.has(method))

    expect(missing).toEqual([])
  })

  it("records risk, approval, group, and permission for mapped Yeonjang tools", () => {
    for (const mapping of YEONJANG_TOOL_MAPPINGS) {
      expect(mapping.toolName).toMatch(/^yeonjang_/u)
      expect(mapping.group.length).toBeGreaterThan(0)
      expect(["safe", "moderate", "dangerous"]).toContain(mapping.riskLevel)
      expect(typeof mapping.requiresApproval).toBe("boolean")
      if (mapping.permissionSetting != null) {
        expect(mapping.permissionSetting).toMatch(/^allow_/u)
      }
    }
  })
})
