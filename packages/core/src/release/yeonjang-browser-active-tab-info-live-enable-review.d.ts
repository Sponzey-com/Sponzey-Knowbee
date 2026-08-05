export type YeonjangBrowserActiveTabInfoLiveEnableSurface = "rust_live_handler" | "skill_mapping" | "production_binding" | "default_live_smoke";
export type YeonjangBrowserActiveTabInfoLiveEnableReviewReasonCode = "active_tab_info_live_enable_review_accepted" | "active_tab_info_live_enable_review_required" | "active_tab_info_live_enable_review_schema_invalid" | "active_tab_info_live_enable_review_method_invalid" | "active_tab_info_live_enable_review_identity_invalid" | "active_tab_info_live_enable_review_time_invalid" | "active_tab_info_live_enable_review_expired" | "active_tab_info_live_enable_review_surface_invalid" | "active_tab_info_live_enable_review_evidence_invalid" | "active_tab_info_live_enable_review_redaction_ack_required" | "active_tab_info_live_enable_review_rollback_required" | "active_tab_info_live_enable_review_raw_data";
export interface YeonjangBrowserActiveTabInfoLiveEnableReviewRecord {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-review.v1";
    method: "browser.active_tab_info";
    reviewId: string;
    reviewerIdentityHash: `sha256:${string}`;
    approvedAt: string;
    expiresAt: string;
    approvedSurfaces: readonly YeonjangBrowserActiveTabInfoLiveEnableSurface[];
    evidenceChecksums: readonly `sha256:${string}`[];
    redactionPrivacyAcknowledged: true;
    rollbackCondition: {
        reasonCode: string;
        disableSurfaces: readonly YeonjangBrowserActiveTabInfoLiveEnableSurface[];
    };
}
export type YeonjangBrowserActiveTabInfoLiveEnableReviewValidation = {
    ok: true;
    reasonCode: "active_tab_info_live_enable_review_accepted";
    method: "browser.active_tab_info";
    approvedSurfaces: readonly YeonjangBrowserActiveTabInfoLiveEnableSurface[];
    evidenceChecksumCount: number;
    expiresAt: string;
} | {
    ok: false;
    reasonCode: Exclude<YeonjangBrowserActiveTabInfoLiveEnableReviewReasonCode, "active_tab_info_live_enable_review_accepted">;
    method: "browser.active_tab_info";
    approvedSurfaces: readonly YeonjangBrowserActiveTabInfoLiveEnableSurface[];
    evidenceChecksumCount: number;
};
export type YeonjangBrowserActiveTabInfoLiveEnableReviewProjection = {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-review-projection.v1";
    method: "browser.active_tab_info";
    status: "not_provided";
    visibility: "release_summary";
    reasonCode: "active_tab_info_live_enable_review_required";
    approvedSurfaceCount: 0;
    evidenceChecksumCount: 0;
    rollbackSurfaceCount: 0;
} | {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-review-projection.v1";
    method: "browser.active_tab_info";
    status: "rejected";
    visibility: "release_summary";
    reasonCode: Exclude<YeonjangBrowserActiveTabInfoLiveEnableReviewReasonCode, "active_tab_info_live_enable_review_accepted">;
    approvedSurfaceCount: number;
    evidenceChecksumCount: number;
    rollbackSurfaceCount: 0;
} | {
    schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-review-projection.v1";
    method: "browser.active_tab_info";
    status: "accepted";
    visibility: "release_summary";
    reasonCode: "active_tab_info_live_enable_review_accepted";
    reviewIdHash: `sha256:${string}`;
    reviewerIdentityHash: `sha256:${string}`;
    approvedSurfaceCount: number;
    evidenceChecksumCount: number;
    rollbackSurfaceCount: number;
    expiresAt: string;
};
export declare function validateYeonjangBrowserActiveTabInfoLiveEnableReviewRecord(value: unknown, options?: {
    now?: Date | number;
}): YeonjangBrowserActiveTabInfoLiveEnableReviewValidation;
export declare function buildYeonjangBrowserActiveTabInfoLiveEnableReviewProjection(value: unknown, options?: {
    now?: Date | number;
}): YeonjangBrowserActiveTabInfoLiveEnableReviewProjection;
//# sourceMappingURL=yeonjang-browser-active-tab-info-live-enable-review.d.ts.map