import { describe, expect, it } from "vitest"

import { projectYeonjangBrowserActiveTabInfo } from "../packages/core/src/capabilities/yeonjang-browser-active-tab-info-contract.ts"
import {
  buildYeonjangBrowserActiveTabInfoEvidenceRef,
  buildYeonjangBrowserActiveTabInfoFinalResultProjection,
  buildYeonjangBrowserActiveTabInfoProductLogProjection,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-final-result-boundary.ts"

const REDACTED = projectYeonjangBrowserActiveTabInfo({
  browserName: "Google Chrome",
  title: "Private Ticket",
  url: "https://example.test/account?token=private",
  profilePath: "/Users/example/Profile 1",
  pid: 4411,
  windowId: "window-private",
  tabId: "tab-private",
  observationStatus: "available",
})

describe("Task 212 Yeonjang browser.active_tab_info final result boundary", () => {
  it("builds final/LLM result input from redacted observation and evidence reference only", () => {
    if (!REDACTED.ok) throw new Error(REDACTED.reasonCode)
    const evidenceRef = buildYeonjangBrowserActiveTabInfoEvidenceRef({
      publicTargetName: "Studio Mac",
      observation: REDACTED.observation,
    })

    const result = buildYeonjangBrowserActiveTabInfoFinalResultProjection({
      publicTargetName: "Studio Mac",
      observation: REDACTED.observation,
      evidenceRef,
      verificationStatus: "verified",
    })

    expect(result).toMatchObject({
      ok: true,
      projection: {
        schemaVersion: "yeonjang-browser-active-tab-info-final-result-v1",
        method: "browser.active_tab_info",
        publicTargetName: "Studio Mac",
        verificationStatus: "verified",
        evidenceRef,
        observation: {
          schemaVersion: "yeonjang-browser-active-tab-info-v1",
          method: "browser.active_tab_info",
          observationStatus: "available",
          browserName: "Google Chrome",
          urlScheme: "https",
        },
      },
    })

    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain("Private Ticket")
    expect(serialized).not.toContain("token=private")
    expect(serialized).not.toContain("Profile 1")
    expect(serialized).not.toContain("4411")
    expect(serialized).not.toContain("window-private")
    expect(serialized).not.toContain("tab-private")
  })

  it("fails closed when final projection input contains public-forbidden raw fields", () => {
    if (!REDACTED.ok) throw new Error(REDACTED.reasonCode)
    const evidenceRef = buildYeonjangBrowserActiveTabInfoEvidenceRef({
      publicTargetName: "Studio Mac",
      observation: REDACTED.observation,
    })

    const result = buildYeonjangBrowserActiveTabInfoFinalResultProjection({
      publicTargetName: "Studio Mac",
      observation: {
        ...REDACTED.observation,
        title: "Private Ticket",
        rawDetails: {
          url: "https://example.test/account?token=private",
        },
      } as unknown as typeof REDACTED.observation,
      evidenceRef,
      verificationStatus: "verified",
    })

    expect(result).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })
    expect(JSON.stringify(result)).not.toContain("Private Ticket")
    expect(JSON.stringify(result)).not.toContain("token=private")
  })

  it("does not accept release-note runtime transition summaries as final response evidence", () => {
    if (!REDACTED.ok) throw new Error(REDACTED.reasonCode)
    const evidenceRef = buildYeonjangBrowserActiveTabInfoEvidenceRef({
      publicTargetName: "Studio Mac",
      observation: REDACTED.observation,
    })

    const result = buildYeonjangBrowserActiveTabInfoFinalResultProjection({
      publicTargetName: "Studio Mac",
      observation: {
        ...REDACTED.observation,
        yeonjangBrowserActiveTabInfoRuntimeTransition: {
          state: "review_record_accepted",
          reasonCode: "active_tab_info_live_enable_review_record_accepted",
          transitionOk: true,
        },
        releaseNotes: {
          knownLimitations: [
            "Yeonjang browser.active_tab_info runtime transition: review_record_accepted reason=active_tab_info_live_enable_review_record_accepted openSurfaces=0.",
          ],
        },
      } as unknown as typeof REDACTED.observation,
      evidenceRef,
      verificationStatus: "verified",
    })

    expect(result).toEqual({
      ok: false,
      reasonCode: "final_result_redaction_required",
    })
    expect(JSON.stringify(result)).not.toContain("review_record_accepted")
    expect(JSON.stringify(result)).not.toContain("runtime transition")
  })

  it("keeps product log projection evidence-ref only", () => {
    if (!REDACTED.ok) throw new Error(REDACTED.reasonCode)
    const evidenceRef = buildYeonjangBrowserActiveTabInfoEvidenceRef({
      publicTargetName: "Studio Mac",
      observation: REDACTED.observation,
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
    })).toEqual({
      ok: true,
      projection: {
        method: "browser.active_tab_info",
        evidenceRef,
      },
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "browserName"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })

    expect(buildYeonjangBrowserActiveTabInfoProductLogProjection({
      evidenceRef,
      fields: ["evidenceRef", "yeonjangBrowserActiveTabInfoRuntimeTransition"],
    })).toEqual({
      ok: false,
      reasonCode: "product_log_evidence_ref_only",
    })
  })
})
