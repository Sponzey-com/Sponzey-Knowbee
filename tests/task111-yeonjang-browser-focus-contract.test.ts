import { describe, expect, it } from "vitest"
import {
  evaluateYeonjangBrowserFocusPostCheck,
  observeYeonjangFocusedBrowserTargetContract,
  projectYeonjangBrowserFocusTarget,
  YEONJANG_BROWSER_FOCUS_CONTRACT,
} from "../packages/core/src/capabilities/yeonjang-browser-focus-contract.ts"
import { YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS } from "../packages/core/src/runs/yeonjang-live-smoke.ts"
import { YEONJANG_SKILL_TOOL_NAMES } from "../packages/core/src/skills/builtin.ts"
import { YEONJANG_TOOL_MAPPINGS } from "../packages/core/src/yeonjang/tool-mapping.ts"

describe("Task 111 Yeonjang browser.focus contract", () => {
  it("defines browser.focus as an approval-required desktop control contract before implementation", () => {
    expect(YEONJANG_BROWSER_FOCUS_CONTRACT).toEqual({
      method: "browser.focus",
      group: "browser",
      riskLevel: "moderate",
      sideEffectClass: "process_control",
      permissionSetting: "allow_browser_control",
      requiresApproval: true,
      requiresInteractiveDesktop: true,
      defaultLiveSmokeAllowed: false,
      rawPayloadVisibility: "audit_only",
      postCheckMode: "focused_target_observation_required",
    })
  })

  it("projects browser focus target without raw title, URL, pid, windowId, or tabId", () => {
    const result = projectYeonjangBrowserFocusTarget({
      targetAlias: "업무 브라우저",
      processName: "Google Chrome",
      title: "Private Dashboard - 고객 토큰 123",
      url: "https://example.test/dashboard?token=private",
      pid: 1234,
      windowId: "window-secret-1",
      tabId: "tab-secret-1",
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const serialized = JSON.stringify(result.projection)
    expect(result.projection).toMatchObject({
      schemaVersion: "yeonjang-browser-focus-target-v1",
      targetKind: "browser_window_or_tab",
      targetAlias: "업무 브라우저",
      displayName: "업무 브라우저",
      processName: "Google Chrome",
      titleLength: "Private Dashboard - 고객 토큰 123".length,
      urlScheme: "https",
      urlLength: "https://example.test/dashboard?token=private".length,
      auditOnlyFields: ["rawTitle", "rawUrl", "pid", "windowId", "tabId"],
    })
    expect(result.projection.titleHash).toMatch(/^[a-f0-9]{64}$/u)
    expect(result.projection.urlHash).toMatch(/^[a-f0-9]{64}$/u)
    expect(serialized).not.toContain("Private Dashboard")
    expect(serialized).not.toContain("고객 토큰")
    expect(serialized).not.toContain("https://example.test")
    expect(serialized).not.toContain("token=private")
    expect(serialized).not.toContain("1234")
    expect(serialized).not.toContain("window-secret-1")
    expect(serialized).not.toContain("tab-secret-1")
  })

  it("keeps browser.focus out of runtime exposure until the implementation task starts", () => {
    const mappedMethods = YEONJANG_TOOL_MAPPINGS.flatMap((mapping) => mapping.methodIds)

    expect(YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS).not.toContain("browser.focus")
    expect(mappedMethods).toContain("browser.focus")
    expect(YEONJANG_SKILL_TOOL_NAMES).toContain("yeonjang_browser_focus")
  })

  it("rejects missing or unsafe browser focus target input", () => {
    expect(projectYeonjangBrowserFocusTarget({})).toEqual({
      ok: false,
      reasonCode: "target_identity_missing",
    })
    expect(projectYeonjangBrowserFocusTarget({ url: "file:///tmp/private.html" })).toEqual({
      ok: false,
      reasonCode: "url_invalid",
    })
    expect(projectYeonjangBrowserFocusTarget({ title: "bad\u0000title" })).toEqual({
      ok: false,
      reasonCode: "title_invalid",
    })
  })

  it("does not verify browser.focus from command acceptance without focused target observation", () => {
    const expected = projectYeonjangBrowserFocusTarget({
      targetAlias: "업무 브라우저",
      processName: "Google Chrome",
      title: "Private Dashboard",
      url: "https://example.test/dashboard?token=private",
    })
    expect(expected.ok).toBe(true)
    if (!expected.ok) return

    const commandOnly = evaluateYeonjangBrowserFocusPostCheck({
      commandAccepted: true,
      expectedTarget: expected.projection,
    })
    expect(commandOnly).toMatchObject({
      state: "MANUAL_INTERVENTION",
      reasonCode: "target_observation_required",
    })

    const mismatchTarget = projectYeonjangBrowserFocusTarget({
      targetAlias: "다른 브라우저",
      processName: "Google Chrome",
      title: "Other Page",
      url: "https://example.test/other",
    })
    expect(mismatchTarget.ok).toBe(true)
    if (!mismatchTarget.ok) return
    expect(evaluateYeonjangBrowserFocusPostCheck({
      commandAccepted: true,
      expectedTarget: expected.projection,
      observedFocusedTarget: mismatchTarget.projection,
    })).toMatchObject({
      state: "MANUAL_INTERVENTION",
      reasonCode: "focused_target_mismatch",
    })

    const verified = evaluateYeonjangBrowserFocusPostCheck({
      commandAccepted: true,
      expectedTarget: expected.projection,
      observedFocusedTarget: expected.projection,
    })
    expect(verified).toMatchObject({
      state: "VERIFIED",
      reasonCode: "focused_target_matched",
    })
    expect(JSON.stringify(verified)).not.toContain("token=private")
  })

  it("normalizes platform focused browser observation without leaking raw target data", () => {
    const available = observeYeonjangFocusedBrowserTargetContract({
      platform: "macos",
      desktopSession: "available",
      permissionGranted: true,
      backendAvailable: true,
      rawTarget: {
        targetAlias: "업무 브라우저",
        processName: "Safari",
        title: "Private Dashboard",
        url: "https://example.test/dashboard?token=private",
        pid: 9988,
        windowId: "mac-window-secret",
        tabId: "mac-tab-secret",
      },
    })

    expect(available).toMatchObject({
      status: "available",
      platform: "macos",
      focusedTarget: {
        targetAlias: "업무 브라우저",
        processName: "Safari",
        urlScheme: "https",
      },
    })
    const serialized = JSON.stringify(available)
    expect(serialized).not.toContain("Private Dashboard")
    expect(serialized).not.toContain("https://example.test")
    expect(serialized).not.toContain("token=private")
    expect(serialized).not.toContain("9988")
    expect(serialized).not.toContain("mac-window-secret")
    expect(serialized).not.toContain("mac-tab-secret")

    expect(observeYeonjangFocusedBrowserTargetContract({
      platform: "linux",
      desktopSession: "headless",
      permissionGranted: true,
      backendAvailable: true,
    })).toEqual({
      status: "headless_unavailable",
      platform: "linux",
      reasonCode: "desktop_session_headless",
    })
    expect(observeYeonjangFocusedBrowserTargetContract({
      platform: "windows",
      desktopSession: "available",
      permissionGranted: false,
      backendAvailable: true,
    })).toEqual({
      status: "permission_required",
      platform: "windows",
      reasonCode: "browser_focus_observation_permission_required",
    })
    expect(observeYeonjangFocusedBrowserTargetContract({
      platform: "linux",
      desktopSession: "available",
      permissionGranted: true,
      backendAvailable: false,
    })).toEqual({
      status: "unsupported",
      platform: "linux",
      reasonCode: "browser_focus_observation_unsupported",
    })
  })
})
