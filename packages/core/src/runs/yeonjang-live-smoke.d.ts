export type YeonjangLiveSmokeState = "prepared" | "dispatched" | "acknowledged" | "observed" | "verified" | "rejected";
export type YeonjangLiveSmokeEvent = "DISPATCH" | "ACK" | "OBSERVE" | "VERIFY" | "REJECT";
export type YeonjangLiveSmokeReadOnlyMethod = "node.capabilities" | "system.info" | "camera.list" | "file.metadata" | "file.list" | "file.read" | "file.search" | "disk.info" | "disk.usage" | "disk.exists" | "clipboard.read" | "network.status" | "device.status";
export declare const YEONJANG_LIVE_SMOKE_READ_ONLY_METHODS: readonly YeonjangLiveSmokeReadOnlyMethod[];
export declare function isYeonjangLiveSmokeReadOnlyMethod(value: unknown): value is YeonjangLiveSmokeReadOnlyMethod;
export interface YeonjangLiveSmokeScenario {
    id: string;
    expectedInstanceId: string;
    expectedSessionId: string;
    expectedMethod: YeonjangLiveSmokeReadOnlyMethod;
    params?: Readonly<Record<string, unknown>>;
    readOnly: true;
}
export interface YeonjangLiveInstanceReceipt {
    instanceId: string;
    publicName: string;
    sessionId: string;
    status: "connected" | "stale" | "disconnected";
    observedAt: number;
    duplicateActiveIdentityCount: number;
    trustState: "trusted" | "pending" | "revoked" | "quarantined";
    runnableTarget: boolean;
}
export interface YeonjangLiveCommandReceipt {
    runId: string;
    requestGroupId: string;
    commandId: string;
    instanceId: string;
    sessionId: string;
    method: string;
    readOnly: boolean;
    deliveryStatus: "acked" | "failed" | "expired";
}
export interface YeonjangLiveObservedResultReceipt {
    runId: string;
    commandId: string;
    instanceId: string;
    sessionId: string;
    status: "observed" | "missing" | "failed";
    evidenceRef: string;
}
export interface YeonjangLiveResultDiagnosisReceipt {
    diagnosedBy: "llm";
    status: "complete" | "followup" | "ask_user";
    contextFingerprint: `sha256:${string}`;
    criterionKeys: readonly string[];
    evidenceRefs: readonly string[];
}
export interface YeonjangLiveSmokeTrace {
    requestGroupId: string;
    instance: YeonjangLiveInstanceReceipt;
    command?: YeonjangLiveCommandReceipt | null;
    observedResult?: YeonjangLiveObservedResultReceipt | null;
    resultDiagnosis?: YeonjangLiveResultDiagnosisReceipt | null;
    auditEventId?: string | null;
    redactionStatus: "verified" | "unverified";
}
export interface YeonjangLiveSmokeResult {
    scenario: YeonjangLiveSmokeScenario;
    state: YeonjangLiveSmokeState;
    status: "passed" | "failed" | "skipped";
    trace?: YeonjangLiveSmokeTrace | null;
    reasonCode?: string;
    startedAt: number;
    finishedAt: number;
}
export interface YeonjangLiveSmokeSummary {
    kind: "yeonjang.live_smoke";
    mode: "dry-run" | "live-run";
    runId: string;
    status: "passed" | "failed" | "skipped";
    startedAt: number;
    finishedAt: number;
    results: readonly YeonjangLiveSmokeResult[];
}
export type YeonjangLiveSmokeTransitionResult = {
    ok: true;
    state: YeonjangLiveSmokeState;
} | {
    ok: false;
    state: YeonjangLiveSmokeState;
    reasonCode: "yeonjang_smoke_transition_invalid";
};
export declare function transitionYeonjangLiveSmokeState(state: YeonjangLiveSmokeState, event: YeonjangLiveSmokeEvent): YeonjangLiveSmokeTransitionResult;
//# sourceMappingURL=yeonjang-live-smoke.d.ts.map