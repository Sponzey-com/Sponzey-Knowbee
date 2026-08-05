import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { classifyYeonjangCapabilityMethod } from "../packages/core/src/capabilities/yeonjang-capability-schema.ts"
import { YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS } from "../packages/core/src/runs/yeonjang-live-smoke.ts"
import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"

const CURRENT_READ_ONLY_METHODS = [
  "browser.list",
  "browser.active_hint",
  "process.list",
  "process.info",
] as const

const FUTURE_CONTROL_OR_SENSITIVE_METHODS = [
  "browser.active_tab_info",
  "process.kill",
  "process.focus_window",
] as const

describe("Task 055 browser/process control boundary", () => {
  it("classifies only current browser/process methods as safe read-only", () => {
    for (const method of CURRENT_READ_ONLY_METHODS) {
      expect(classifyYeonjangCapabilityMethod(method), method).toMatchObject({
        riskLevel: "safe",
        sideEffectClass: "read_local",
      })
    }

    for (const method of FUTURE_CONTROL_OR_SENSITIVE_METHODS) {
      expect(classifyYeonjangCapabilityMethod(method), method).not.toMatchObject({
        riskLevel: "safe",
        sideEffectClass: "read_local",
      })
    }
    expect(classifyYeonjangCapabilityMethod("browser.open_url")).toMatchObject({
      group: "browser",
      riskLevel: "moderate",
      sideEffectClass: "process_control",
    })
    expect(classifyYeonjangCapabilityMethod("browser.focus")).toMatchObject({
      group: "browser",
      riskLevel: "moderate",
      sideEffectClass: "process_control",
    })
  })

  it("keeps future browser/process control methods out of live smoke and Skill mapping", () => {
    const mappedMethods = YEONJANG_TOOL_MAPPINGS.flatMap((mapping) => mapping.methodIds)

    for (const method of FUTURE_CONTROL_OR_SENSITIVE_METHODS) {
      expect(YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS).not.toContain(method)
      expect(mappedMethods).not.toContain(method)
    }
    expect(YEONJANG_SKILL_TOOL_NAMES).not.toEqual(
      expect.arrayContaining([
        "yeonjang_browser_active_tab_info",
        "yeonjang_browser_focus",
        "yeonjang_process_kill",
        "yeonjang_process_focus_window",
      ]),
    )
    expect(YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS).not.toContain("browser.open_url")
    expect(YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS).not.toContain("browser.focus")
    expect(mappedMethods).toContain("browser.open_url")
    expect(mappedMethods).toContain("browser.focus")
    expect(YEONJANG_SKILL_TOOL_NAMES).toContain("yeonjang_browser_open_url")
    expect(YEONJANG_SKILL_TOOL_NAMES).toContain("yeonjang_browser_focus")
  })

  it("keeps sensitive inventory separate from Rust dispatch and system.exec fallback", () => {
    const nodeSource = readFileSync("Yeonjang/src/node.rs", "utf8")
    const browserSource = readFileSync("Yeonjang/src/features/browser.rs", "utf8")
    const processSource = readFileSync("Yeonjang/src/features/process.rs", "utf8")

    expect(nodeSource).toContain('"name": "browser.active_tab_info"')
    expect(nodeSource).toContain('"browser.active_tab_info": capability_entry')
    expect(nodeSource).not.toContain(
      '"browser.active_tab_info" => dispatch_browser_active_tab_info_request',
    )
    for (const method of ["process.kill", "process.focus_window"] as const) {
      expect(nodeSource).not.toContain(`"${method}" =>`)
      expect(nodeSource).not.toContain(`"${method}": capability_entry`)
    }
    expect(nodeSource).toContain('"browser.open_url" =>')
    expect(nodeSource).toContain('"browser.focus" =>')
    expect(browserSource).not.toMatch(/system\.exec|active_tab_info/u)
    expect(browserSource).toContain("BrowserOpenUrlParams")
    expect(processSource).not.toMatch(/system\.exec|Command::new|kill|focus_window/u)
  })
})
