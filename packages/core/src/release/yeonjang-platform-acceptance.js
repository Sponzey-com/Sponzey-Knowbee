import { produceYeonjangLiveAcceptanceEvidence } from "./yeonjang-live-acceptance-evidence.js";
const PLATFORMS = ["linux", "macos", "windows"];
export function buildYeonjangPlatformAcceptanceMatrix(input) {
    const required = new Set(input.requiredPlatforms);
    const available = new Set(input.availablePlatforms);
    const requiredCapabilityMethods = [...new Set(input.requiredCapabilityMethods ?? [])]
        .map((method) => method.trim())
        .filter(Boolean)
        .sort();
    const capabilityReceipts = input.capabilityReceipts ?? [];
    const rows = PLATFORMS.map((platform) => {
        const deterministicMatches = input.deterministicReceipts.filter((item) => item.platform === platform);
        const liveMatches = input.liveRecords.filter((item) => item.platform === platform);
        const deterministic = deterministicMatches[0];
        const live = liveMatches[0];
        const reasons = [...(deterministic?.reasonCodes ?? [])];
        let liveStatus = available.has(platform)
            ? "not_run"
            : "unavailable";
        let evidenceRefs = [];
        const capabilityReadiness = [];
        let executedAt;
        if (deterministicMatches.length > 1)
            reasons.push("platform_deterministic_receipt_duplicate");
        if (liveMatches.length > 1) {
            liveStatus = "failed";
            reasons.push("platform_live_record_duplicate");
        }
        if (available.has(platform) && live) {
            const produced = produceYeonjangLiveAcceptanceEvidence({
                run: live.run,
                now: input.now,
                maxSessionAgeMs: input.maxSessionAgeMs,
            });
            liveStatus =
                liveMatches.length === 1 && produced.accepted.length > 0 && produced.rejected.length === 0
                    ? "passed"
                    : "failed";
            evidenceRefs = produced.accepted.map((item) => item.evidenceRef).sort();
            executedAt =
                produced.accepted.length > 0
                    ? Math.max(...produced.accepted.map((item) => item.executedAt))
                    : undefined;
            reasons.push(...produced.rejected.map((item) => item.reasonCode));
            if (!live.buildRevision.trim()) {
                liveStatus = "failed";
                reasons.push("platform_live_build_revision_missing");
            }
            if (!live.run.results[0]?.trace?.instance.publicName.trim()) {
                liveStatus = "failed";
                reasons.push("platform_live_public_target_missing");
            }
        }
        for (const method of requiredCapabilityMethods) {
            const matches = capabilityReceipts.filter((item) => item.platform === platform && item.method.trim() === method);
            const receipt = matches[0];
            let status = "passed";
            let reasonStatus = "passed";
            if (!receipt) {
                status = available.has(platform) ? "missing" : "unsupported";
                reasonStatus = status;
            }
            else if (matches.length > 1) {
                status = "failed";
                reasonStatus = "duplicate";
            }
            else if (input.maxSessionAgeMs <= 0 || receipt.observedAt > input.now || input.now - receipt.observedAt > input.maxSessionAgeMs) {
                status = "stale";
                reasonStatus = status;
            }
            else if (!receipt.supported || receipt.toolHealthStatus === "unsupported") {
                status = "unsupported";
                reasonStatus = status;
            }
            else if (!receipt.permissionEnabled || receipt.toolHealthStatus === "permission_disabled") {
                status = "permission_disabled";
                reasonStatus = status;
            }
            else if (receipt.toolHealthStatus !== "ready" || !receipt.evidenceRef.trim()) {
                status = "failed";
                reasonStatus = status;
            }
            capabilityReadiness.push(Object.freeze({
                method,
                status,
                ...(receipt ? { observedAt: receipt.observedAt } : {}),
                ...(receipt?.evidenceRef.trim() ? { evidenceRef: receipt.evidenceRef.trim() } : {}),
            }));
            if (reasonStatus !== "passed")
                reasons.push(capabilityReasonCode(method, reasonStatus));
            if (status === "passed" && receipt?.evidenceRef.trim())
                evidenceRefs.push(receipt.evidenceRef.trim());
            if (matches.length > 1) {
                for (const duplicate of matches.slice(1)) {
                    if (duplicate.evidenceRef.trim())
                        evidenceRefs.push(duplicate.evidenceRef.trim());
                }
            }
        }
        const publicTargetName = live?.run.results[0]?.trace?.instance.publicName.trim();
        return Object.freeze({
            platform,
            required: required.has(platform),
            available: available.has(platform),
            deterministic: deterministicMatches.length > 1 ? "failed" : (deterministic?.status ?? "not_run"),
            live: liveStatus,
            reasonCodes: Object.freeze([...new Set(reasons)].sort()),
            ...(live?.buildRevision.trim() ? { buildRevision: live.buildRevision.trim() } : {}),
            ...(publicTargetName ? { publicTargetName } : {}),
            ...(executedAt !== undefined ? { executedAt } : {}),
            evidenceRefs: Object.freeze([...new Set(evidenceRefs)].sort()),
            capabilityReadiness: Object.freeze(capabilityReadiness),
        });
    });
    const requiredRows = rows.filter((row) => row.required);
    const availableRows = rows.filter((row) => row.available);
    const deterministicReady = requiredRows.every((row) => row.deterministic === "passed");
    const availableLiveReady = availableRows.length > 0 && availableRows.every((row) => row.live === "passed");
    const capabilityReady = requiredCapabilityMethods.length === 0 ||
        requiredRows.every((row) => row.capabilityReadiness.length === requiredCapabilityMethods.length &&
            row.capabilityReadiness.every((item) => item.status === "passed"));
    const publicReleaseReady = requiredRows.length > 0 &&
        requiredRows.every((row) => row.deterministic === "passed" && row.live === "passed") &&
        capabilityReady;
    return Object.freeze({
        platforms: Object.freeze(rows),
        deterministicReady,
        availableLiveReady,
        capabilityReady,
        publicReleaseReady,
    });
}
function capabilityReasonCode(method, status) {
    return `platform_capability_${method.replace(/[^a-z0-9]+/giu, "_").replace(/^_+|_+$/gu, "")}_${status}`;
}
//# sourceMappingURL=yeonjang-platform-acceptance.js.map