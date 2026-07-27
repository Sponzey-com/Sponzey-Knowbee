import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT,
  YEONJANG_BROWSER_ACTIVE_TAB_INFO_REQUIRED_GATES,
} from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import { YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS } from "../packages/core/src/runs/yeonjang-live-smoke.ts"
import {
  hasYeonjangBrowserActiveTabInfoRuntimeInventoryExposure,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-rust-source-drift-guard.ts"
import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"

describe("Task 192 Yeonjang browser.active_tab_info fail-closed inventory", () => {
  it("keeps browser.active_tab_info out of dispatch and user execution surfaces before all gates exist", () => {
    const mappedMethods = YEONJANG_TOOL_MAPPINGS.flatMap((mapping) => mapping.methodIds)
    const mappedTools = YEONJANG_TOOL_MAPPINGS.map((mapping) => mapping.toolName)
    const nodeSource = readFileSync("Yeonjang/src/node.rs", "utf8")

    expect(YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method).toBe("browser.active_tab_info")
    expect(YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS).not.toContain("browser.active_tab_info")
    expect(mappedMethods).not.toContain("browser.active_tab_info")
    expect(mappedTools).not.toContain("yeonjang_browser_active_tab_info")
    expect(YEONJANG_SKILL_TOOL_NAMES).not.toContain("yeonjang_browser_active_tab_info")
    const nodeImplementation = nodeSource.split("#[cfg(test)]")[0] ?? nodeSource
    expect(nodeImplementation).toMatch(/"name"\s*:\s*"browser\.active_tab_info"/u)
    expect(nodeImplementation).toContain('"browser.active_tab_info": capability_entry')
    expect(nodeImplementation).toContain('"browser.active_tab_info": browser_active_tab_info_tool_health_entry')
    expect(nodeImplementation).not.toContain('"browser.active_tab_info" => dispatch_browser_active_tab_info_request')
    expect(hasYeonjangBrowserActiveTabInfoRuntimeInventoryExposure(nodeImplementation)).toBe(true)
  })

  it("requires explicit gates before active tab info can be exposed", () => {
    expect(YEONJANG_BROWSER_ACTIVE_TAB_INFO_REQUIRED_GATES).toEqual([
      "os_active_tab_observation_backend",
      "browser_read_permission",
      "explicit_approval_receipt",
      "redacted_public_projection",
      "audit_only_raw_evidence_boundary",
      "llm_result_diagnosis_input_sanitizer",
      "default_live_smoke_exclusion",
      "system_exec_bypass_prohibited",
    ])
  })

  it("does not contain fallback implementation paths that read raw browser state through command or profile files", () => {
    const browserSource = readFileSync("Yeonjang/src/features/browser.rs", "utf8")
    const nodeSource = readFileSync("Yeonjang/src/node.rs", "utf8")
    const browserImplementation = browserSource.split("#[cfg(test)]")[0] ?? browserSource
    const nodeImplementation = nodeSource.split("#[cfg(test)]")[0] ?? nodeSource
    const combinedImplementation = `${browserImplementation}\n${nodeImplementation}`

    expect(combinedImplementation).not.toMatch(/activeTabInfo|current_tab|Current Tabs/u)
    expect(browserImplementation).not.toMatch(/activeTabInfo|active_tab|current_tab|Current Tabs/u)
    expect(browserImplementation).not.toMatch(/sqlite|History|Preferences|profilePath/u)
  })
})
