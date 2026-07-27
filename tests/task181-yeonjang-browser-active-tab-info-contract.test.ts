import { describe, expect, it } from "vitest"

import {
  projectYeonjangBrowserActiveTabInfo,
  YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT,
} from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import { classifyYeonjangCapabilityMethod } from "../packages/core/src/capabilities/yeonjang-capability-schema.ts"
import { YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS } from "../packages/core/src/runs/yeonjang-live-smoke.ts"
import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"

describe("Task 181 Yeonjang browser.active_tab_info contract", () => {
  it("defines active tab info as sensitive read-only and keeps it out of default execution surfaces", () => {
    expect(YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT).toEqual({
      method: "browser.active_tab_info",
      group: "browser",
      riskLevel: "moderate",
      sideEffectClass: "read_local",
      permissionSetting: "allow_browser_read",
      requiresApproval: true,
      requiresInteractiveDesktop: true,
      defaultLiveSmokeAllowed: false,
      rawPayloadVisibility: "audit_only",
      postCheckMode: "observation_schema_required",
    })
    expect(classifyYeonjangCapabilityMethod("browser.active_tab_info")).toMatchObject({
      group: "browser",
      riskLevel: "moderate",
      sideEffectClass: "read_local",
    })
    expect(YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS).not.toContain("browser.active_tab_info")
    expect(YEONJANG_TOOL_MAPPINGS.flatMap((mapping) => mapping.methodIds)).not.toContain("browser.active_tab_info")
    expect(YEONJANG_SKILL_TOOL_NAMES).not.toContain("yeonjang_browser_active_tab_info")
  })

  it("projects active tab observation without raw browser internals", () => {
    const projection = projectYeonjangBrowserActiveTabInfo({
      browserName: "Google Chrome",
      title: "Private Customer Ticket 12345",
      url: "https://example.com/account?token=secret-token&user=private",
      profileName: "Work Profile",
      profilePath: "/Users/example/Library/Application Support/Google/Chrome/Profile 1",
      pid: 7788,
      windowId: "window-private",
      tabId: "tab-private",
      observationStatus: "available",
    })

    expect(projection.ok).toBe(true)
    if (!projection.ok) throw new Error(projection.reasonCode)
    expect(projection.observation).toMatchObject({
      schemaVersion: "yeonjang-browser-active-tab-info-v1",
      method: "browser.active_tab_info",
      observationStatus: "available",
      browserName: "Google Chrome",
      titleLength: "Private Customer Ticket 12345".length,
      urlScheme: "https",
      urlLength: "https://example.com/account?token=secret-token&user=private".length,
    })
    expect(projection.observation.titleHash).toMatch(/^[a-f0-9]{64}$/u)
    expect(projection.observation.urlHash).toMatch(/^[a-f0-9]{64}$/u)
    expect(projection.observation.auditOnlyFields).toEqual(
      expect.arrayContaining(["title", "url", "profileName", "profilePath", "pid", "windowId", "tabId"]),
    )

    const publicJson = JSON.stringify(projection.observation)
    expect(publicJson).not.toContain("Private Customer Ticket")
    expect(publicJson).not.toContain("secret-token")
    expect(publicJson).not.toContain("Profile 1")
    expect(publicJson).not.toContain("7788")
    expect(publicJson).not.toContain("window-private")
    expect(publicJson).not.toContain("tab-private")
  })

  it("rejects malformed observation inputs instead of normalizing unknown raw data into public output", () => {
    expect(projectYeonjangBrowserActiveTabInfo({ observationStatus: "available" }).ok).toBe(false)
    expect(projectYeonjangBrowserActiveTabInfo({ browserName: "", observationStatus: "available" })).toEqual({
      ok: false,
      reasonCode: "browser_name_invalid",
    })
    expect(
      projectYeonjangBrowserActiveTabInfo({
        browserName: "Chrome",
        title: "",
        observationStatus: "available",
      }),
    ).toEqual({
      ok: false,
      reasonCode: "title_invalid",
    })
  })
})
