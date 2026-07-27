import { describe, expect, it } from "vitest"

import {
  assembleYeonjangBrowserActiveTabInfoRuntimeResult,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-runtime-result-assembler.ts"
import {
  buildYeonjangBrowserActiveTabInfoReviewReadyBundle,
  applyYeonjangBrowserActiveTabInfoReviewDecisionToBundle,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-review-ready-bundle.ts"

const RAW_DETAILS = {
  browserName: "Google Chrome",
  title: "Private Ticket",
  url: "https://example.test/account?token=private",
  profilePath: "/Users/example/Profile 1",
  pid: 8811,
  windowId: "window-private",
  tabId: "tab-private",
}

describe("Task 216 Yeonjang browser.active_tab_info review-ready bundle", () => {
  it("builds review-ready bundle from runtime assembly without exposing raw details", () => {
    const assembly = assembleYeonjangBrowserActiveTabInfoRuntimeResult({
      publicTargetName: "Studio Mac",
      toolHealthStatus: "ready",
      rawDetails: RAW_DETAILS,
      verificationStatus: "unverifiable",
    })
    if (!assembly.ok) throw new Error(assembly.reasonCode)

    const bundle = buildYeonjangBrowserActiveTabInfoReviewReadyBundle({
      runtimeAssembly: assembly,
      originalRequest: "현재 활성 브라우저 탭을 확인해줘.",
      completionCriteria: ["active tab observation이 요청 확인에 충분해야 한다."],
      commandAccepted: true,
      rawDetails: RAW_DETAILS,
    })

    expect(bundle).toMatchObject({
      ok: true,
      status: "review_required",
      goalSuccessBeforeReview: false,
      evidenceRef: assembly.evidenceRef,
      finalProjection: assembly.finalProjection,
      reviewAdmissionInput: {
        schemaVersion: "yeonjang-browser-active-tab-info-llm-review-admission-v1",
        method: "browser.active_tab_info",
        commandAccepted: true,
        successCanBeConcludedWithoutReview: false,
      },
      invokeNow: false,
      addRustDispatchNow: false,
      addProductionBindingNow: false,
    })
    if (!bundle.ok) throw new Error(bundle.reasonCode)
    expect(bundle.reviewAdmissionInput.finalProjection.evidenceRef).toBe(assembly.evidenceRef)

    const serialized = JSON.stringify(bundle)
    expect(serialized).not.toContain("Private Ticket")
    expect(serialized).not.toContain("token=private")
    expect(serialized).not.toContain("Profile 1")
    expect(serialized).not.toContain("/Users/example")
    expect(serialized).not.toContain("8811")
    expect(serialized).not.toContain("window-private")
    expect(serialized).not.toContain("tab-private")
  })

  it("applies review decision and only then marks verified review as goal success", () => {
    const assembly = assembleYeonjangBrowserActiveTabInfoRuntimeResult({
      publicTargetName: "Studio Mac",
      toolHealthStatus: "ready",
      rawDetails: RAW_DETAILS,
      verificationStatus: "unverifiable",
    })
    if (!assembly.ok) throw new Error(assembly.reasonCode)
    const bundle = buildYeonjangBrowserActiveTabInfoReviewReadyBundle({
      runtimeAssembly: assembly,
      originalRequest: "현재 활성 브라우저 탭을 확인해줘.",
      completionCriteria: ["active tab observation이 요청 확인에 충분해야 한다."],
      commandAccepted: true,
    })
    if (!bundle.ok) throw new Error(bundle.reasonCode)

    expect(applyYeonjangBrowserActiveTabInfoReviewDecisionToBundle({
      bundle,
      review: {
        verdict: "satisfied",
        evidenceRefs: [bundle.evidenceRef],
        reason: "Safe final projection satisfies the request.",
      },
    })).toEqual({
      ok: true,
      status: "review_verified",
      verificationStatus: "verified",
      goalSuccess: true,
      reasonCode: "llm_review_satisfied",
      evidenceRefs: [bundle.evidenceRef],
      finalProjection: {
        ...bundle.finalProjection,
        verificationStatus: "verified",
      },
      productLogProjection: bundle.productLogProjection,
      invokeNow: false,
      addRustDispatchNow: false,
      addProductionBindingNow: false,
    })

    expect(applyYeonjangBrowserActiveTabInfoReviewDecisionToBundle({
      bundle,
      review: {
        verdict: "uncertain",
        evidenceRefs: [bundle.evidenceRef],
        reason: "Need additional user-visible evidence.",
      },
    })).toMatchObject({
      ok: true,
      status: "review_unverifiable",
      verificationStatus: "unverifiable",
      goalSuccess: false,
      reasonCode: "llm_review_uncertain",
    })
  })

  it("fails closed when runtime assembly failed", () => {
    const assembly = assembleYeonjangBrowserActiveTabInfoRuntimeResult({
      publicTargetName: "Studio Mac",
      toolHealthStatus: "ready",
      rawDetails: {
        title: "Private Ticket",
        url: "https://example.test/account?token=private",
      },
      verificationStatus: "unverifiable",
    })

    const bundle = buildYeonjangBrowserActiveTabInfoReviewReadyBundle({
      runtimeAssembly: assembly,
      originalRequest: "현재 활성 브라우저 탭을 확인해줘.",
      completionCriteria: ["active tab observation이 요청 확인에 충분해야 한다."],
      commandAccepted: true,
    })

    expect(bundle).toEqual({
      ok: false,
      reasonCode: "browser_name_required",
      invokeNow: false,
      addRustDispatchNow: false,
      addProductionBindingNow: false,
    })
    expect(JSON.stringify(bundle)).not.toContain("Private Ticket")
    expect(JSON.stringify(bundle)).not.toContain("token=private")
  })
})
