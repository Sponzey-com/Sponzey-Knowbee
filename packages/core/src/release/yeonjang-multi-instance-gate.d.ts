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
export interface YeonjangMultiInstanceReleaseGateSummary {
    kind: "nobie.release.yeonjang_multi_instance";
    generatedAt: string;
    policyVersion: "2026-05-18.yeonjang-multi-instance.release-gate.v1";
    gateStatus: YeonjangMultiInstanceReleaseGateStatus;
    liveFleetSummary: YeonjangProjectionSummary;
    checks: YeonjangMultiInstanceReleaseGateCheck[];
    manualSmoke: YeonjangManualSmokeChecklistItem[];
    warnings: string[];
    blockingFailures: string[];
}
export declare function buildYeonjangMultiInstanceReleaseGateSummary(options?: {
    now?: Date;
    liveFleetProjection?: ReturnType<typeof buildYeonjangFleetProjection>;
}): YeonjangMultiInstanceReleaseGateSummary;
//# sourceMappingURL=yeonjang-multi-instance-gate.d.ts.map