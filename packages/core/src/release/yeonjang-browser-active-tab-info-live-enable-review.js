import { createHash } from "node:crypto";
const SCHEMA_VERSION = "knowbee.yeonjang-browser-active-tab-info-live-enable-review.v1";
const METHOD = "browser.active_tab_info";
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const REVIEW_ID_PATTERN = /^review:[a-z0-9][a-z0-9:_-]{2,120}$/u;
const REASON_CODE_PATTERN = /^[a-z][a-z0-9_:-]{2,120}$/u;
const RAW_DATA_PATTERN = /https?:\/\/|token=|\/Users\/|\/private\/|raw title|raw url|active tab title|active tab url|browser profile|stack trace/iu;
const LIVE_ENABLE_SURFACES = [
    "rust_live_handler",
    "skill_mapping",
    "production_binding",
    "default_live_smoke",
];
function rejected(reasonCode, approvedSurfaces = [], evidenceChecksumCount = 0) {
    return {
        ok: false,
        reasonCode,
        method: METHOD,
        approvedSurfaces: [...approvedSurfaces],
        evidenceChecksumCount,
    };
}
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function parseSurfaces(value) {
    if (!Array.isArray(value) || value.length === 0)
        return null;
    const surfaces = [];
    for (const item of value) {
        if (!LIVE_ENABLE_SURFACES.includes(item))
            return null;
        if (surfaces.includes(item))
            return null;
        surfaces.push(item);
    }
    return surfaces;
}
function parseEvidenceChecksums(value) {
    if (!Array.isArray(value) || value.length === 0)
        return null;
    const checksums = [];
    for (const item of value) {
        if (typeof item !== "string" || !SHA256_PATTERN.test(item))
            return null;
        if (checksums.includes(item))
            return null;
        checksums.push(item);
    }
    return checksums;
}
function parseTime(value) {
    if (typeof value !== "string" || value.trim() !== value || !value)
        return null;
    const millis = Date.parse(value);
    return Number.isFinite(millis) ? millis : null;
}
export function validateYeonjangBrowserActiveTabInfoLiveEnableReviewRecord(value, options = {}) {
    if (!isRecord(value))
        return rejected("active_tab_info_live_enable_review_required");
    const serialized = JSON.stringify(value);
    if (RAW_DATA_PATTERN.test(serialized)) {
        return rejected("active_tab_info_live_enable_review_raw_data");
    }
    if (value.schemaVersion !== SCHEMA_VERSION) {
        return rejected("active_tab_info_live_enable_review_schema_invalid");
    }
    if (value.method !== METHOD) {
        return rejected("active_tab_info_live_enable_review_method_invalid");
    }
    if (typeof value.reviewId !== "string" ||
        !REVIEW_ID_PATTERN.test(value.reviewId) ||
        typeof value.reviewerIdentityHash !== "string" ||
        !SHA256_PATTERN.test(value.reviewerIdentityHash)) {
        return rejected("active_tab_info_live_enable_review_identity_invalid");
    }
    const approvedAt = parseTime(value.approvedAt);
    const expiresAt = parseTime(value.expiresAt);
    if (approvedAt === null || expiresAt === null || expiresAt <= approvedAt) {
        return rejected("active_tab_info_live_enable_review_time_invalid");
    }
    const surfaces = parseSurfaces(value.approvedSurfaces);
    if (!surfaces)
        return rejected("active_tab_info_live_enable_review_surface_invalid");
    const evidenceChecksums = parseEvidenceChecksums(value.evidenceChecksums);
    if (!evidenceChecksums) {
        return rejected("active_tab_info_live_enable_review_evidence_invalid", surfaces);
    }
    const now = typeof options.now === "number"
        ? options.now
        : options.now instanceof Date
            ? options.now.getTime()
            : Date.now();
    if (expiresAt <= now) {
        return rejected("active_tab_info_live_enable_review_expired", surfaces, evidenceChecksums.length);
    }
    if (value.redactionPrivacyAcknowledged !== true) {
        return rejected("active_tab_info_live_enable_review_redaction_ack_required", surfaces, evidenceChecksums.length);
    }
    if (!isRecord(value.rollbackCondition)) {
        return rejected("active_tab_info_live_enable_review_rollback_required", surfaces, evidenceChecksums.length);
    }
    const rollbackSurfaces = parseSurfaces(value.rollbackCondition.disableSurfaces);
    if (typeof value.rollbackCondition.reasonCode !== "string" ||
        !REASON_CODE_PATTERN.test(value.rollbackCondition.reasonCode) ||
        !rollbackSurfaces ||
        surfaces.some((surface) => !rollbackSurfaces.includes(surface))) {
        return rejected("active_tab_info_live_enable_review_rollback_required", surfaces, evidenceChecksums.length);
    }
    return {
        ok: true,
        reasonCode: "active_tab_info_live_enable_review_accepted",
        method: METHOD,
        approvedSurfaces: [...surfaces],
        evidenceChecksumCount: evidenceChecksums.length,
        expiresAt: String(value.expiresAt),
    };
}
function sha256(value) {
    return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
export function buildYeonjangBrowserActiveTabInfoLiveEnableReviewProjection(value, options = {}) {
    if (value === undefined || value === null) {
        return {
            schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-review-projection.v1",
            method: METHOD,
            status: "not_provided",
            visibility: "release_summary",
            reasonCode: "active_tab_info_live_enable_review_required",
            approvedSurfaceCount: 0,
            evidenceChecksumCount: 0,
            rollbackSurfaceCount: 0,
        };
    }
    const validation = validateYeonjangBrowserActiveTabInfoLiveEnableReviewRecord(value, options);
    if (!validation.ok) {
        return {
            schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-review-projection.v1",
            method: METHOD,
            status: "rejected",
            visibility: "release_summary",
            reasonCode: validation.reasonCode,
            approvedSurfaceCount: validation.approvedSurfaces.length,
            evidenceChecksumCount: validation.evidenceChecksumCount,
            rollbackSurfaceCount: 0,
        };
    }
    const record = value;
    return {
        schemaVersion: "knowbee.yeonjang-browser-active-tab-info-live-enable-review-projection.v1",
        method: METHOD,
        status: "accepted",
        visibility: "release_summary",
        reasonCode: validation.reasonCode,
        reviewIdHash: sha256(record.reviewId),
        reviewerIdentityHash: record.reviewerIdentityHash,
        approvedSurfaceCount: validation.approvedSurfaces.length,
        evidenceChecksumCount: validation.evidenceChecksumCount,
        rollbackSurfaceCount: record.rollbackCondition.disableSurfaces.length,
        expiresAt: validation.expiresAt,
    };
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-live-enable-review.js.map