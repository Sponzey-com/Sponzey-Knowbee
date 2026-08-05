import { buildYeonjangFleetProjection, type YeonjangProjectionSummary } from "../yeonjang/topology.js";
export type YeonjangMultiInstanceReleaseGateStatus = "passed" | "warning" | "failed";
export interface YeonjangMultiInstanceReleaseGateCheck {
    id: "exact_target_regression" | "ambiguous_target_fail_guard" | "revoked_target_block_guard" | "broadcast_approval_guard" | "idempotency_delivery_guard" | "duplicate_session_guard";
    status: YeonjangMultiInstanceReleaseGateStatus;
    summary: string;
    detail: Record<string, unknown>;
}
export interface YeonjangManualSmokeChecklistItem {
    id: "macos" | "windows" | "linux_desktop" | "linux_headless";
    profile: "desktop_interactive" | "headless_managed";
    status: "manual_required";
    title: string;
    steps: string[];
}
export type YeonjangProfileSmokeId = YeonjangManualSmokeChecklistItem["id"];
export type YeonjangProfileSmokeProfile = YeonjangManualSmokeChecklistItem["profile"];
export type YeonjangProfileSmokeStatus = "passed" | "failed" | "stale" | "not_run";
export interface YeonjangProfileSmokeEvidence {
    id: YeonjangProfileSmokeId;
    platform: "macos" | "windows" | "linux";
    profile: YeonjangProfileSmokeProfile;
    startupMode: "autostart" | "manual" | "managed";
    windowMode: "hidden" | "visible" | "unavailable";
    trayState: "visible" | "hidden" | "unsupported" | "unavailable";
    observedAt: number;
    evidenceRef: string;
}
export interface YeonjangProfileSmokeResult {
    id: YeonjangProfileSmokeId;
    platform: "macos" | "windows" | "linux";
    profile: YeonjangProfileSmokeProfile;
    status: YeonjangProfileSmokeStatus;
    reasonCodes: string[];
    evidenceRefs: string[];
    observedAt?: number;
}
export interface YeonjangMultiInstanceReleaseGateSummary {
    kind: "knowbee.release.yeonjang_multi_instance";
    generatedAt: string;
    policyVersion: "2026-05-18.yeonjang-multi-instance.release-gate.v1";
    gateStatus: YeonjangMultiInstanceReleaseGateStatus;
    liveFleetSummary: YeonjangProjectionSummary;
    checks: YeonjangMultiInstanceReleaseGateCheck[];
    manualSmoke: YeonjangManualSmokeChecklistItem[];
    profileSmoke: YeonjangProfileSmokeResult[];
    warnings: string[];
    blockingFailures: string[];
}
export declare function buildYeonjangMultiInstanceReleaseGateSummary(options?: {
    now?: Date;
    liveFleetProjection?: ReturnType<typeof buildYeonjangFleetProjection>;
    profileSmokeEvidence?: readonly YeonjangProfileSmokeEvidence[];
    profileSmokeMaxAgeMs?: number;
}): YeonjangMultiInstanceReleaseGateSummary;
//# sourceMappingURL=yeonjang-multi-instance-gate.d.ts.map