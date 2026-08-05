import { createHash } from "node:crypto";
export const YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT = {
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
};
export const YEONJANG_BROWSER_ACTIVE_TAB_INFO_REQUIRED_GATES = [
    "os_active_tab_observation_backend",
    "browser_read_permission",
    "explicit_approval_receipt",
    "redacted_public_projection",
    "audit_only_raw_evidence_boundary",
    "llm_result_diagnosis_input_sanitizer",
    "default_live_smoke_exclusion",
    "system_exec_bypass_prohibited",
];
const PUBLIC_FIELDS = [
    "schemaVersion",
    "method",
    "observationStatus",
    "browserName",
    "titleHash",
    "titleLength",
    "urlScheme",
    "urlHash",
    "urlLength",
];
const AUDIT_ONLY_FIELDS = ["title", "url", "profileName", "profilePath", "pid", "windowId", "tabId"];
export function projectYeonjangBrowserActiveTabInfo(input) {
    const browserName = normalizeRequiredPublicString(input.browserName);
    if (browserName === undefined)
        return { ok: false, reasonCode: "browser_name_required" };
    if (browserName === null)
        return { ok: false, reasonCode: "browser_name_invalid" };
    const title = normalizeOptionalRawString(input.title);
    if (title === null)
        return { ok: false, reasonCode: "title_invalid" };
    const url = normalizeOptionalRawString(input.url);
    if (url === null)
        return { ok: false, reasonCode: "url_invalid" };
    const profileName = normalizeOptionalRawString(input.profileName);
    if (profileName === null)
        return { ok: false, reasonCode: "profile_name_invalid" };
    const profilePath = normalizeOptionalRawString(input.profilePath);
    if (profilePath === null)
        return { ok: false, reasonCode: "profile_path_invalid" };
    if (input.pid !== undefined && (!Number.isSafeInteger(input.pid) || input.pid <= 0)) {
        return { ok: false, reasonCode: "pid_invalid" };
    }
    if (input.windowId !== undefined && normalizeOptionalRawString(input.windowId) === null) {
        return { ok: false, reasonCode: "window_id_invalid" };
    }
    if (input.tabId !== undefined && normalizeOptionalRawString(input.tabId) === null) {
        return { ok: false, reasonCode: "tab_id_invalid" };
    }
    return {
        ok: true,
        observation: {
            schemaVersion: "yeonjang-browser-active-tab-info-v1",
            method: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method,
            observationStatus: input.observationStatus,
            browserName,
            ...(title ? { titleHash: hashPublicEvidence(title), titleLength: title.length } : {}),
            ...(url ? projectUrlEvidence(url) : {}),
            publicEvidenceFields: [...PUBLIC_FIELDS],
            auditOnlyFields: [...AUDIT_ONLY_FIELDS],
        },
    };
}
export function projectYeonjangBrowserActiveTabInfoReadiness(observations) {
    const targets = observations.map(projectReadinessTarget);
    const readyCount = targets.filter((target) => target.readinessStatus === "ready").length;
    return {
        schemaVersion: "yeonjang-browser-active-tab-info-readiness-v1",
        method: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method,
        permissionSetting: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.permissionSetting,
        requiresApproval: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.requiresApproval,
        readyCount,
        blockedCount: targets.length - readyCount,
        targets,
    };
}
export function selectReadyYeonjangBrowserActiveTabInfoTargets(projection) {
    return projection.targets
        .filter((target) => target.readinessStatus === "ready")
        .map((target) => ({
        publicTargetName: target.publicTargetName,
        platform: target.platform,
        method: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.method,
        requiresApproval: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.requiresApproval,
        permissionSetting: YEONJANG_BROWSER_ACTIVE_TAB_INFO_CONTRACT.permissionSetting,
    }));
}
function projectReadinessTarget(observation) {
    const missingRequirements = [];
    if (observation.platform === "unknown")
        missingRequirements.push("supported_platform");
    if (observation.desktopSession !== "available")
        missingRequirements.push("interactive_desktop_session");
    if (!observation.capabilityAdvertised)
        missingRequirements.push("browser_active_tab_info_capability");
    if (!observation.permissionGranted)
        missingRequirements.push("browser_read_permission");
    if (!observation.observationBackendAvailable)
        missingRequirements.push("active_tab_observation_backend");
    const readinessStatus = deriveReadinessStatus(observation, missingRequirements);
    return {
        publicTargetName: normalizeReadinessPublicName(observation.publicTargetName),
        platform: observation.platform,
        readinessStatus,
        missingRequirementCount: missingRequirements.length,
        missingRequirements,
        userAction: actionForReadiness(readinessStatus),
    };
}
function deriveReadinessStatus(observation, missingRequirements) {
    if (observation.platform === "unknown")
        return "unknown";
    if (observation.desktopSession === "headless")
        return "headless_unavailable";
    if (!observation.capabilityAdvertised)
        return "unsupported";
    if (!observation.permissionGranted)
        return "permission_required";
    if (!observation.observationBackendAvailable)
        return "observation_backend_required";
    if (missingRequirements.length === 0)
        return "ready";
    return "unknown";
}
function actionForReadiness(status) {
    if (status === "ready")
        return "ready_to_request_active_tab_approval";
    if (status === "permission_required")
        return "enable_browser_read_permission";
    if (status === "observation_backend_required")
        return "update_or_reinstall_yeonjang";
    if (status === "headless_unavailable")
        return "start_interactive_desktop_session";
    if (status === "unsupported")
        return "install_supported_yeonjang";
    return "select_supported_platform";
}
function normalizeReadinessPublicName(value) {
    const trimmed = value.trim();
    return trimmed || "Unnamed Yeonjang";
}
function normalizeRequiredPublicString(value) {
    if (value === undefined)
        return undefined;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    return trimmed;
}
function normalizeOptionalRawString(value) {
    if (value === undefined)
        return undefined;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    return trimmed;
}
function projectUrlEvidence(url) {
    return {
        urlScheme: extractUrlScheme(url),
        urlHash: hashPublicEvidence(url),
        urlLength: url.length,
    };
}
function extractUrlScheme(url) {
    const match = /^([a-z][a-z0-9+.-]*):/iu.exec(url.trim());
    if (!match)
        return "unknown";
    return match[1].toLowerCase();
}
function hashPublicEvidence(value) {
    return createHash("sha256").update(value).digest("hex");
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-contract.js.map