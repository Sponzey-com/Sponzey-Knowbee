import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
  isSafeYeonjangBrowserActiveTabInfoEvidenceRef,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"

const OBSERVATION = projectYeonjangBrowserActiveTabInfo({
  browserName: "Google Chrome",
  title: "Private Ticket",
  url: "https://example.test/account?token=private",
  profilePath: "/Users/example/Profile 1",
  pid: 5511,
  windowId: "window-private",
  tabId: "tab-private",
  observationStatus: "available",
})

describe("Task 213 Yeonjang browser.active_tab_info safe evidenceRef", () => {
  it("builds a stable evidenceRef without raw active tab data", () => {
    if (!OBSERVATION.ok) throw new Error(OBSERVATION.reasonCode)

    const evidenceRef = buildYeonjangBrowserActiveTabInfoEvidenceRef({
      publicTargetName: "Studio Mac",
      observation: OBSERVATION.observation,
    })

    expect(evidenceRef).toMatch(/^tool-result:yeonjang:browser-active-tab-info:[a-f0-9]{48}$/u)
    expect(isSafeYeonjangBrowserActiveTabInfoEvidenceRef(evidenceRef)).toBe(true)
    expect(evidenceRef).not.toContain("Private Ticket")
    expect(evidenceRef).not.toContain("token=private")
    expect(evidenceRef).not.toContain("Profile 1")
    expect(evidenceRef).not.toContain("5511")
    expect(evidenceRef).not.toContain("window-private")
    expect(evidenceRef).not.toContain("tab-private")
  })

  it("rejects unsafe evidenceRef strings before final or log projection", () => {
    if (!OBSERVATION.ok) throw new Error(OBSERVATION.reasonCode)

    const unsafeRef = "tool-result:yeonjang:browser-active-tab-info:Private Ticket token=private"

    expect(isSafeYeonjangBrowserActiveTabInfoEvidenceRef(unsafeRef)).toBe(false)
    expect(buildYeonjangBrowserActiveTabInfoFinalResultProjection({
      publicTargetName: "Studio Mac",
      observation: OBSERVATION.observation,
      evidenceRef: unsafeRef,
      verificationStatus: "verified",
    })).toEqual({
      ok: false,
      reasonCode: "evidence_ref_unsafe",
    })
    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef: unsafeRef,
    })).toEqual({
      ok: false,
      reasonCode: "evidence_ref_unsafe",
    })
  })
})
