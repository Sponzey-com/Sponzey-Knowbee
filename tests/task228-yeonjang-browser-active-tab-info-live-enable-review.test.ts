import { describe, expect, it } from "vitest"

import {
  validateYeonjangBrowserActiveTabInfoLiveEnableReviewRecord,
} from "../packages/core/src/release/yeonjang-browser-active-tab-info-live-enable-review.ts"

const CHECKSUM = `sha256:${"a".repeat(64)}` as const
const REVIEWER = `sha256:${"b".repeat(64)}` as const

function validRecord() {
  return {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-review.v1",
    method: "browser.active_tab_info",
    reviewId: "review:active-tab-info-001",
    reviewerIdentityHash: REVIEWER,
    approvedAt: "2026-07-22T00:00:00.000Z",
    expiresAt: "2026-07-23T00:00:00.000Z",
    approvedSurfaces: ["rust_live_handler", "skill_mapping", "production_binding"],
    evidenceChecksums: [CHECKSUM],
    redactionPrivacyAcknowledged: true,
    rollbackCondition: {
      reasonCode: "active_tab_info_live_enable_rollback",
      disableSurfaces: ["rust_live_handler", "skill_mapping", "production_binding"],
    },
  } as const
}

describe("Task 228 Yeonjang browser.active_tab_info live enable review record", () => {
  it("accepts a structured manual review record without enabling runtime by itself", () => {
    expect(validateYeonjangBrowserActiveTabInfoLiveEnableReviewRecord(validRecord(), {
      now: new Date("2026-07-22T01:00:00.000Z"),
    })).toEqual({
      ok: true,
      reasonCode: "active_tab_info_live_enable_review_accepted",
      method: "browser.active_tab_info",
      approvedSurfaces: ["rust_live_handler", "skill_mapping", "production_binding"],
      evidenceChecksumCount: 1,
      expiresAt: "2026-07-23T00:00:00.000Z",
    })
  })

  it.each([
    ["missing record", null, "active_tab_info_live_enable_review_required"],
    ["wrong schema", { ...validRecord(), schemaVersion: "v0" }, "active_tab_info_live_enable_review_schema_invalid"],
    ["wrong method", { ...validRecord(), method: "browser.list" }, "active_tab_info_live_enable_review_method_invalid"],
    ["bad reviewer", { ...validRecord(), reviewerIdentityHash: "user@example.com" }, "active_tab_info_live_enable_review_identity_invalid"],
    ["bad review id", { ...validRecord(), reviewId: "/Users/reviewer/raw" }, "active_tab_info_live_enable_review_raw_data"],
    ["bad time", { ...validRecord(), expiresAt: "2026-07-21T00:00:00.000Z" }, "active_tab_info_live_enable_review_time_invalid"],
    ["expired", { ...validRecord(), expiresAt: "2026-07-22T00:30:00.000Z" }, "active_tab_info_live_enable_review_expired"],
    ["bad surface", { ...validRecord(), approvedSurfaces: ["rust_live_handler", "unknown"] }, "active_tab_info_live_enable_review_surface_invalid"],
    ["duplicate surface", { ...validRecord(), approvedSurfaces: ["rust_live_handler", "rust_live_handler"] }, "active_tab_info_live_enable_review_surface_invalid"],
    ["bad evidence", { ...validRecord(), evidenceChecksums: ["raw-output"] }, "active_tab_info_live_enable_review_evidence_invalid"],
    ["missing ack", { ...validRecord(), redactionPrivacyAcknowledged: false }, "active_tab_info_live_enable_review_redaction_ack_required"],
    ["missing rollback", { ...validRecord(), rollbackCondition: null }, "active_tab_info_live_enable_review_rollback_required"],
    [
      "rollback surface mismatch",
      { ...validRecord(), rollbackCondition: { reasonCode: "active_tab_info_live_enable_rollback", disableSurfaces: ["rust_live_handler"] } },
      "active_tab_info_live_enable_review_rollback_required",
    ],
    [
      "raw url",
      { ...validRecord(), note: "https://example.test/?token=secret" },
      "active_tab_info_live_enable_review_raw_data",
    ],
  ])("rejects %s with a reason code only", (_label, record, reasonCode) => {
    const result = validateYeonjangBrowserActiveTabInfoLiveEnableReviewRecord(record, {
      now: new Date("2026-07-22T01:00:00.000Z"),
    })

    expect(result.ok).toBe(false)
    expect(result.reasonCode).toBe(reasonCode)
    expect(JSON.stringify(result)).not.toMatch(/https?:\/\/|\/Users\/|token=|raw-output|user@example\.com/u)
  })
})
