import { projectYeonjangBrowserActiveTabInfo } from "../capabilities/yeonjang-browser-active-tab-info-contract.js";
export function assembleYeonjangBrowserActiveTabInfoReadinessObservationsFromRegistry(input) {
    return input.records.map((record) => {
        const health = record.toolHealth["browser.active_tab_info"];
        const capabilityAdvertised = record.methods.includes("browser.active_tab_info");
        const diagnostic = normalizeDiagnostic(health);
        return Object.freeze({
            publicTargetName: normalizePublicName(record.publicTargetName),
            platform: record.platform,
            desktopSession: record.desktopSession,
            capabilityAdvertised,
            permissionGranted: record.permissions.allow_browser_read === true,
            observationBackendAvailable: capabilityAdvertised && health?.status === "ready",
            ...(diagnostic ? { diagnostic } : {}),
        });
    });
}
export function selectYeonjangBrowserActiveTabInfoRedactedObservationFromRegistry(input) {
    const targetName = normalizePublicName(input.publicTargetName);
    const matches = input.records.filter((record) => normalizePublicName(record.publicTargetName) === targetName);
    if (matches.length === 0)
        return { ok: false, reasonCode: "active_tab_info_redacted_source_missing" };
    if (matches.length > 1)
        return { ok: false, reasonCode: "active_tab_info_redacted_source_ambiguous" };
    const record = matches[0];
    const health = record?.toolHealth["browser.active_tab_info"];
    const rawDetails = health?.rawDetails;
    const projection = projectYeonjangBrowserActiveTabInfo({
        browserName: readString(rawDetails, "browserName"),
        title: readString(rawDetails, "title"),
        url: readString(rawDetails, "url"),
        profileName: readString(rawDetails, "profileName"),
        profilePath: readString(rawDetails, "profilePath"),
        pid: readNumber(rawDetails, "pid"),
        windowId: readString(rawDetails, "windowId"),
        tabId: readString(rawDetails, "tabId"),
        observationStatus: observationStatusFromHealth(health),
    });
    if (!projection.ok)
        return projection;
    return { ok: true, observation: projection.observation };
}
function normalizePublicName(value) {
    const normalized = value.trim().replace(/\s+/gu, " ");
    return normalized || "Yeonjang target";
}
const PUBLIC_REASON_CODES = new Set([
    "active_tab_observation_backend_ready",
    "active_tab_observation_backend_missing",
    "browser_read_permission_disabled",
    "interactive_desktop_required",
    "unknown",
]);
const PUBLIC_BACKEND_FAMILIES = new Set([
    "accessibility_api",
    "browser_extension_bridge",
    "windows_ui_automation",
    "linux_accessibility_api",
    "wayland_portal",
]);
function normalizeDiagnostic(health) {
    if (!health)
        return undefined;
    const reasonCode = normalizeReasonCode(health.reasonCode);
    const candidateBackendFamilies = normalizeBackendFamilies(health.candidateBackendFamilies);
    if (reasonCode === "unknown" && candidateBackendFamilies.length === 0) {
        return undefined;
    }
    return Object.freeze({
        reasonCode,
        candidateBackendFamilies,
    });
}
function normalizeReasonCode(value) {
    if (value && PUBLIC_REASON_CODES.has(value)) {
        return value;
    }
    return "unknown";
}
function normalizeBackendFamilies(values) {
    if (!values)
        return [];
    return values.filter((value) => (typeof value === "string" && PUBLIC_BACKEND_FAMILIES.has(value)));
}
function readString(record, key) {
    const value = record?.[key];
    return typeof value === "string" ? value : undefined;
}
function readNumber(record, key) {
    const value = record?.[key];
    return typeof value === "number" ? value : undefined;
}
function observationStatusFromHealth(health) {
    switch (health?.status) {
        case "ready":
            return "available";
        case "permission_disabled":
            return "permission_required";
        case "unsupported":
            return "unsupported";
        default:
            return "unknown";
    }
}
//# sourceMappingURL=yeonjang-browser-active-tab-info-readiness-source-adapter.js.map