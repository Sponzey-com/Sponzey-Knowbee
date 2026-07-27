import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import {
  yeonjangBrowserActiveHintTool,
  yeonjangBrowserFocusTool,
  yeonjangBrowserListTool,
  yeonjangBrowserOpenUrlTool,
  yeonjangProcessInfoTool,
  yeonjangProcessListTool,
} from "../packages/core/src/tools/builtin/yeonjang.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"

const READ_ONLY_EXPECTATIONS = [
  ["yeonjang_process_list", ["process.list"], "process", "allow_process_read"],
  ["yeonjang_process_info", ["process.info"], "process", "allow_process_read"],
  ["yeonjang_browser_list", ["browser.list"], "browser", "allow_browser_read"],
  ["yeonjang_browser_active_hint", ["browser.active_hint"], "browser", "allow_browser_read"],
] as const

const FUTURE_CONTROL_METHODS = [
  "process.kill",
  "process.focus_window",
  "browser.active_tab_info",
] as const

const FUTURE_CONTROL_TOOLS = [
  "yeonjang_process_kill",
  "yeonjang_process_focus_window",
  "yeonjang_browser_active_tab_info",
] as const

describe("task038 browser/process boundary", () => {
  it("keeps current browser/process Yeonjang tools read-only", () => {
    for (const [toolName, methodIds, group, permissionSetting] of READ_ONLY_EXPECTATIONS) {
      const mapping = YEONJANG_TOOL_MAPPINGS.find((entry) => entry.toolName === toolName)
      expect(mapping).toMatchObject({
        toolName,
        methodIds,
        group,
        riskLevel: "safe",
        requiresApproval: false,
        permissionSetting,
        targetKind: "yeonjang_remote",
        requiresTargetResolution: true,
        evidenceSourceKind: "yeonjang",
      })
    }

    expect(yeonjangProcessListTool.runtimeMethodIds).toEqual(["process.list"])
    expect(yeonjangProcessInfoTool.runtimeMethodIds).toEqual(["process.info"])
    expect(yeonjangBrowserListTool.runtimeMethodIds).toEqual(["browser.list"])
    expect(yeonjangBrowserActiveHintTool.runtimeMethodIds).toEqual(["browser.active_hint"])
  })

  it("exposes browser.open_url only as an approved Yeonjang side-effect tool", () => {
    const mapping = YEONJANG_TOOL_MAPPINGS.find((entry) => entry.toolName === "yeonjang_browser_open_url")
    expect(mapping).toMatchObject({
      toolName: "yeonjang_browser_open_url",
      methodIds: ["browser.open_url"],
      group: "browser",
      riskLevel: "moderate",
      requiresApproval: true,
      permissionSetting: "allow_browser_control",
      targetKind: "yeonjang_remote",
      requiresTargetResolution: true,
      evidenceSourceKind: "yeonjang",
    })
    expect(yeonjangBrowserOpenUrlTool.runtimeMethodIds).toEqual(["browser.open_url"])
    expect(yeonjangBrowserOpenUrlTool.requiresApproval).toBe(true)
    expect(YEONJANG_SKILL_TOOL_NAMES).toContain("yeonjang_browser_open_url")
  })

  it("exposes browser.focus only as an approved Yeonjang side-effect tool", () => {
    const mapping = YEONJANG_TOOL_MAPPINGS.find((entry) => entry.toolName === "yeonjang_browser_focus")
    expect(mapping).toMatchObject({
      toolName: "yeonjang_browser_focus",
      methodIds: ["browser.focus"],
      group: "browser",
      riskLevel: "moderate",
      requiresApproval: true,
      permissionSetting: "allow_browser_control",
      targetKind: "yeonjang_remote",
      requiresTargetResolution: true,
      evidenceSourceKind: "yeonjang",
    })
    expect(yeonjangBrowserFocusTool.runtimeMethodIds).toEqual(["browser.focus"])
    expect(yeonjangBrowserFocusTool.requiresApproval).toBe(true)
    expect(YEONJANG_SKILL_TOOL_NAMES).toContain("yeonjang_browser_focus")
  })

  it("does not expose future browser/process control through Skill or mapping", () => {
    const mappedMethods = YEONJANG_TOOL_MAPPINGS.flatMap((mapping) => mapping.methodIds)
    const toolNames = YEONJANG_TOOL_MAPPINGS.map((mapping) => mapping.toolName)

    for (const method of FUTURE_CONTROL_METHODS) {
      expect(mappedMethods).not.toContain(method)
    }
    for (const toolName of FUTURE_CONTROL_TOOLS) {
      expect(toolNames).not.toContain(toolName)
      expect(YEONJANG_SKILL_TOOL_NAMES).not.toContain(toolName)
    }
  })

  it("does not claim unsupported browser/process control in Rust dispatch", () => {
    const nodeSource = readFileSync("Yeonjang/src/node.rs", "utf8")

    for (const method of FUTURE_CONTROL_METHODS) {
      expect(nodeSource).not.toContain(`"${method}" =>`)
    }
    expect(nodeSource).toContain('"browser.open_url" =>')
    expect(nodeSource).toContain('"browser.focus" =>')
    expect(nodeSource).toContain('"process.list" =>')
    expect(nodeSource).toContain('"process.info" =>')
    expect(nodeSource).toContain('"browser.list" =>')
    expect(nodeSource).toContain('"browser.active_hint" =>')
  })
})
