import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  validateYeonjangBrowserActiveTabInfoRustSourceDrift,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-rust-source-drift-guard.ts"

describe("Task 197 Yeonjang browser.active_tab_info Rust source drift guard", () => {
  it("accepts the current capability-advertised Rust source while dispatch remains closed", () => {
    const source = readFileSync("Yeonjang/src/node.rs", "utf8")

    expect(validateYeonjangBrowserActiveTabInfoRustSourceDrift({ source })).toEqual({
      status: "inventory_open_dispatch_closed",
      reasonCode: "browser_active_tab_info_inventory_ready_dispatch_not_registered",
      missingSections: ["dispatch"],
    })
  })

  it("rejects a partial Rust method addition that has dispatch but no complete inventory fields", () => {
    const source = `
      "browser.active_tab_info" => dispatch_browser_active_tab_info_request(request, &permissions, &support_profile),
      "browser.active_tab_info": capability_entry(
        "browser.active_tab_info",
        true,
        false,
        Some("allow_browser_read"),
        flags.platform,
        support_profile,
        last_checked_at,
      ),
    `

    expect(validateYeonjangBrowserActiveTabInfoRustSourceDrift({ source })).toEqual({
      status: "drift_detected",
      reasonCode: "browser_active_tab_info_inventory_incomplete",
      missingSections: [
        "methods_inventory",
        "method_classification",
        "tool_health",
        "method_metadata",
        "requires_approval_true",
        "requires_interactive_desktop_true",
        "broadcast_safe_false",
        "default_target_policy_exact_instance",
        "risk_level_moderate",
        "side_effect_class_read_local",
        "raw_payload_visibility_audit_only",
        "audit_only_raw_details_schema",
      ],
    })
  })

  it("accepts a complete future Rust inventory source shape", () => {
    const source = `
      { "name": "browser.active_tab_info", "implemented": capability_flags.active_tab_observation, "category": "browser" }
      "browser.active_tab_info" => dispatch_browser_active_tab_info_request(request, &permissions, &support_profile),
      "browser.active_tab_info": capability_entry(
        "browser.active_tab_info",
        flags.active_tab_observation,
        true,
        Some("allow_browser_read"),
        flags.platform,
        support_profile,
        last_checked_at,
      ),
      "browser.active_tab_info": tool_health_entry(flags.active_tab_observation, permissions.allow_browser_read, Some("allow_browser_read"), last_checked_at),
      "rawDetailsSchema": {
        "visibility": "audit_only",
        "required": ["browserName"],
        "optional": ["title", "url", "profileName", "profilePath", "pid", "windowId", "tabId"]
      },
      "browser.active_tab_info" => CapabilityMethodClassification {
        group: "browser",
        risk_level: "moderate",
        side_effect_class: "read_local",
      },
      "browser.active_tab_info" => CapabilityMethodMetadata {
        requires_interactive_desktop: true,
        broadcast_safe: false,
        default_target_policy: "exact_instance",
        raw_payload_visibility: "audit_only",
      },
    `

    expect(validateYeonjangBrowserActiveTabInfoRustSourceDrift({ source })).toEqual({
      status: "complete",
      reasonCode: "browser_active_tab_info_inventory_complete",
      missingSections: [],
    })
  })
})
