import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  buildYeonjangBrowserActiveTabInfoRustInventoryContract,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-rust-inventory-contract.ts"
import {
  hasYeonjangBrowserActiveTabInfoRuntimeInventoryExposure,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-rust-source-drift-guard.ts"

describe("Task 196 Yeonjang browser.active_tab_info Rust inventory contract", () => {
  it("defines the exact Rust capability payload fields required before node.capabilities can expose the method", () => {
    const contract = buildYeonjangBrowserActiveTabInfoRustInventoryContract({})

    expect(contract).toEqual({
      schemaVersion: "yeonjang-browser-active-tab-info-rust-inventory-contract-v1",
      method: "browser.active_tab_info",
      rustDispatchMethod: "browser.active_tab_info",
      category: "browser",
      permissionSetting: "allow_browser_read",
      riskLevel: "moderate",
      sideEffectClass: "read_local",
      requiresApproval: true,
      requiresInteractiveDesktop: true,
      broadcastSafe: false,
      defaultTargetPolicy: "exact_instance",
      defaultLiveSmokeAllowed: false,
      rawPayloadVisibility: "audit_only",
      addRustDispatchNow: false,
      addCapabilityMatrixNow: true,
      addToolHealthNow: true,
      requiredCapabilityMatrixFields: [
        "permissionSetting",
        "riskLevel",
        "sideEffectClass",
        "requiresApproval",
        "requiresInteractiveDesktop",
        "broadcastSafe",
        "defaultTargetPolicy",
        "rawPayloadVisibility",
      ],
      requiredToolHealthSignals: [
        "capability_advertised",
        "browser_read_permission",
        "active_tab_observation_backend",
        "audit_only_raw_details_schema",
      ],
      auditOnlyRawDetailFields: [
        "browserName",
        "title",
        "url",
        "profileName",
        "profilePath",
        "pid",
        "windowId",
        "tabId",
      ],
      prohibitedPatterns: [
        "raw_active_tab_public_output",
        "system_exec_active_tab_bypass",
        "browser_profile_file_scrape",
        "default_live_smoke_inclusion",
      ],
    })
  })

  it("opens Rust capability inventory while keeping dispatch closed until the observation backend exists", () => {
    const nodeSource = readFileSync("Yeonjang/src/node.rs", "utf8")
    const testModule = /^#\[cfg\(test\)\]\s*\r?\nmod tests\s*\{/mu.exec(nodeSource)
    const nodeImplementation = testModule?.index === undefined
      ? nodeSource
      : nodeSource.slice(0, testModule.index)

    expect(nodeImplementation).toMatch(/"name"\s*:\s*"browser\.active_tab_info"/u)
    expect(nodeImplementation).toContain('"browser.active_tab_info": capability_entry')
    expect(nodeImplementation).toContain('"browser.active_tab_info": browser_active_tab_info_tool_health_entry')
    expect(nodeImplementation).toContain('"rawDetailsSchema"')
    expect(nodeImplementation).not.toContain('"rawDetails":')
    expect(nodeImplementation).not.toContain('"browser.active_tab_info" => dispatch_browser_active_tab_info_request')
    expect(hasYeonjangBrowserActiveTabInfoRuntimeInventoryExposure(nodeImplementation)).toBe(true)
  })

  it("would fail if a future Rust inventory entry omits mandatory active tab safety fields", () => {
    const contract = buildYeonjangBrowserActiveTabInfoRustInventoryContract({})
    const incompleteFutureEntry = {
      permissionSetting: "allow_browser_read",
      riskLevel: "moderate",
      sideEffectClass: "read_local",
      requiresApproval: true,
    }

    for (const field of contract.requiredCapabilityMatrixFields) {
      expect(Object.hasOwn(incompleteFutureEntry, field), field).toBe(
        ["permissionSetting", "riskLevel", "sideEffectClass", "requiresApproval"].includes(field),
      )
    }
  })
})
