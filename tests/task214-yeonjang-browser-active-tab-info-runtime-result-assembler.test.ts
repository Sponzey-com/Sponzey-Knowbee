import { describe, expect, it } from "vitest"

import {
  assembleYeonjangBrowserActiveTabInfoRuntimeResult,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-runtime-result-assembler.ts"

describe("Task 214 Yeonjang browser.active_tab_info runtime result assembler", () => {
  it("assembles raw runtime result into redacted observation, safe evidenceRef, and final projection", () => {
    const result = assembleYeonjangBrowserActiveTabInfoRuntimeResult({
      publicTargetName: " Studio   Mac ",
      toolHealthStatus: "ready",
      rawDetails: {
        browserName: "Google Chrome",
        title: "Private Ticket",
        url: "https://example.test/account?token=private",
        profileName: "Profile 1",
        profilePath: "/Users/example/Profile 1",
        pid: 6611,
        windowId: "window-private",
        tabId: "tab-private",
        backendFamily: "accessibility_api",
      },
      verificationStatus: "verified",
      internalInstanceId: "internal-private-instance",
      sessionId: "session-private",
      clientId: "client-private",
    })

    expect(result).toMatchObject({
      ok: true,
      finalProjection: {
        schemaVersion: "yeonjang-browser-active-tab-info-final-result-v1",
        method: "browser.active_tab_info",
        publicTargetName: "Studio Mac",
        verificationStatus: "verified",
        observation: {
          schemaVersion: "yeonjang-browser-active-tab-info-v1",
          method: "browser.active_tab_info",
          observationStatus: "available",
          browserName: "Google Chrome",
          urlScheme: "https",
        },
      },
      productLogProjection: {
        method: "browser.active_tab_info",
      },
      invokeNow: false,
      addRustDispatchNow: false,
      addProductionBindingNow: false,
    })
    if (!result.ok) throw new Error(result.reasonCode)
    expect(result.evidenceRef).toMatch(/^tool-result:yeonjang:browser-active-tab-info:[a-f0-9]{48}$/u)
    expect(result.finalProjection.evidenceRef).toBe(result.evidenceRef)
    expect(result.productLogProjection.evidenceRef).toBe(result.evidenceRef)

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("Private Ticket")
    expect(serialized).not.toContain("token=private")
    expect(serialized).not.toContain("Profile 1")
    expect(serialized).not.toContain("/Users/example")
    expect(serialized).not.toContain("6611")
    expect(serialized).not.toContain("window-private")
    expect(serialized).not.toContain("tab-private")
    expect(serialized).not.toContain("accessibility_api")
    expect(serialized).not.toContain("internal-private-instance")
    expect(serialized).not.toContain("session-private")
    expect(serialized).not.toContain("client-private")
  })

  it("fails closed without returning raw details when raw runtime result is invalid", () => {
    const result = assembleYeonjangBrowserActiveTabInfoRuntimeResult({
      publicTargetName: "Studio Mac",
      toolHealthStatus: "ready",
      rawDetails: {
        title: "Private Ticket",
        url: "https://example.test/account?token=private",
      },
      verificationStatus: "verified",
    })

    expect(result).toEqual({
      ok: false,
      reasonCode: "browser_name_required",
      invokeNow: false,
      addRustDispatchNow: false,
      addProductionBindingNow: false,
    })
    expect(JSON.stringify(result)).not.toContain("Private Ticket")
    expect(JSON.stringify(result)).not.toContain("token=private")
  })
})
