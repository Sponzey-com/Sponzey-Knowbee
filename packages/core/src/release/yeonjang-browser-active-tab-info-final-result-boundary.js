import { createHash } from "node:crypto";
import { YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT } from "../capabilities/yeonjang-browser-active-tab-info-contract.js";
import { validateYeonjangBrowserActiveTabInfoEvidenceUse } from "./yeonjang-browser-active-tab-info-audit-evidence-boundary.js";
const SAFE_EVIDENCE_REF_PATTERN = /^tool-result:yeonjang:browser-active-tab-info:[a-f0-9]{48}$/u;
export function buildYeonjangBrowserActiveTabInfoEvidenceRef(input) {
    const digest = createHash("sha256")
        .update(JSON.stringify({
        method: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method,
        publicTargetName: normalizePublicTargetName(input.publicTargetName),
        observation: {
            schemaVersion: input.observation.schemaVersion,
            observationStatus: input.observation.observationStatus,
            browserName: input.observation.browserName,
            titleHash: input.observation.titleHash,
            titleLength: input.observation.titleLength,
            urlScheme: input.observation.urlScheme,
            urlHash: input.observation.urlHash,
            urlLength: input.observation.urlLength,
        },
    }))
        .digest("hex")
        .slice(0, 48);
    return `tool-result:yeonjang:browser-active-tab-info:${digest}`;
}
export function isSafeYeonjangBrowserActiveTabInfoEvidenceRef(value) {
    return SAFE_EVIDENCE_REF_PATTERN.test(value.trim());
}
export function buildYeonjangBrowserActiveTabInfoFinalResultProjection(input) {
    const evidenceRef = normalizeEvidenceRef(input.evidenceRef);
    if (!evidenceRef)
        return { ok: false, reasonCode: "evidence_ref_required" };
    if (!isSafeYeonjangBrowserActiveTabInfoEvidenceRef(evidenceRef)) {
        return { ok: false, reasonCode: "evidence_ref_unsafe" };
    }
    const validation = validateYeonjangBrowserActiveTabInfoEvidenceUse({
        destination: "final_response",
        visibility: "redacted",
        explicitAuditContext: false,
        fields: Object.keys(input.observation),
    });
    if (!validation.ok)
        return { ok: false, reasonCode: "final_result_redaction_required" };
    return {
        ok: true,
        projection: {
            schemaVersion: "yeonjang-browser-active-tab-info-final-result-v1",
            method: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method,
            publicTargetName: normalizePublicTargetName(input.publicTargetName),
            verificationStatus: input.verificationStatus,
            evidenceRef,
            observation: {
                schemaVersion: input.observation.schemaVersion,
                method: input.observation.method,
                observationStatus: input.observation.observationStatus,
                browserName: input.observation.browserName,
                ...(input.observation.titleHash
                    ? { titleHash: input.observation.titleHash, titleLength: input.observation.titleLength }
                    : {}),
                ...(input.observation.urlHash
                    ? {
                        urlScheme: input.observation.urlScheme,
                        urlHash: input.observation.urlHash,
                        urlLength: input.observation.urlLength,
                    }
                    : {}),
            },
        },
    };
}
export function buildYeonjangBrowserActiveTabInfoProductLogProjection(input) {
    const evidenceRef = normalizeEvidenceRef(input.evidenceRef);
    if (!evidenceRef)
        return { ok: false, reasonCode: "evidence_ref_required" };
    if (!isSafeYeonjangBrowserActiveTabInfoEvidenceRef(evidenceRef)) {
        return { ok: false, reasonCode: "evidence_ref_unsafe" };
    }
    const validation = validateYeonjangBrowserActiveTabInfoEvidenceUse({
        destination: "product_log",
        visibility: "evidence_ref",
        explicitAuditContext: false,
        fields: input.fields ?? ["evidenceRef"],
    });
    if (!validation.ok)
        return { ok: false, reasonCode: "product_log_evidence_ref_only" };
    return {
        ok: true,
        projection: {
            method: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method,
            evidenceRef,
        },
    };
}
function normalizeEvidenceRef(value) {
    const normalized = value.trim();
    return normalized || undefined;
}
function normalizePublicTargetName(value) {
    const normalized = value.trim().replace(/\s+/gu, " ");
    return normalized || "Yeonjang target";
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-final-result-boundary.js.map