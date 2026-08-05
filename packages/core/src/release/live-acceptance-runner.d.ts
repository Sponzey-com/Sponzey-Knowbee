import type { LiveAcceptanceCapability } from "./live-acceptance-admission.js";
import type { LiveAcceptanceBundleApproval, LiveAcceptanceBundleCandidate, LiveAcceptanceBundlePayload } from "./live-acceptance-bundle.js";
import { type LiveAcceptanceCollectionBlocker, type LiveAcceptanceProducerResult } from "./live-acceptance-collector.js";
import { type LiveAcceptanceSigningRequest } from "./live-acceptance-signing-exchange.js";
import type { LiveAcceptanceRuntimeIdentityReceipt } from "./live-acceptance-runtime-identity.js";
export type LiveAcceptanceRunnerStage = "channels" | "web" | "extensions" | "yeonjang";
export type LiveAcceptanceRunnerFailurePolicy = "continue_diagnostics" | "stop_on_failure";
export interface LiveAcceptanceRunnerContext {
    candidate: Readonly<LiveAcceptanceBundleCandidate>;
    observedAt: number;
    requiredCapabilities: readonly LiveAcceptanceCapability[];
}
export type LiveAcceptanceRunnerPortResult = {
    status: "produced";
    result: LiveAcceptanceProducerResult;
} | {
    status: "unavailable";
    reasonCode: string;
};
export interface LiveAcceptanceRunnerPort {
    execute(context: LiveAcceptanceRunnerContext): Promise<LiveAcceptanceRunnerPortResult>;
}
export interface LiveAcceptancePayloadSink {
    write(payload: Readonly<LiveAcceptanceBundlePayload>): Promise<{
        status: "written";
    } | {
        status: "rejected";
        reasonCode: string;
    }>;
}
export interface LiveAcceptanceSigningRequestSink {
    write(request: Readonly<LiveAcceptanceSigningRequest>): Promise<{
        status: "written";
    } | {
        status: "rejected";
        reasonCode: string;
    }>;
}
export declare function createSigningRequestPayloadSink(input: {
    candidate: LiveAcceptanceBundleCandidate;
    requestedKeyId: string;
    now: number;
    requestSink: LiveAcceptanceSigningRequestSink;
}): LiveAcceptancePayloadSink;
export interface LiveAcceptanceRunnerEvent {
    state: "initialized" | "executing" | "validating" | "coverage_complete" | "payload_written" | "blocked" | "cancelled";
    stage?: LiveAcceptanceRunnerStage;
}
export type LiveAcceptanceRunnerResult = {
    status: "collected";
    payload: Readonly<LiveAcceptanceBundlePayload>;
    events: readonly LiveAcceptanceRunnerEvent[];
    runtimeIdentity?: Readonly<LiveAcceptanceRuntimeIdentityReceipt>;
} | {
    status: "blocked" | "cancelled";
    blockers: readonly LiveAcceptanceCollectionBlocker[];
    events: readonly LiveAcceptanceRunnerEvent[];
    runtimeIdentity?: Readonly<LiveAcceptanceRuntimeIdentityReceipt>;
};
export declare function runLiveAcceptanceCollection(input: {
    candidate: LiveAcceptanceBundleCandidate;
    approval: LiveAcceptanceBundleApproval;
    ports: Readonly<Record<LiveAcceptanceRunnerStage, LiveAcceptanceRunnerPort>>;
    payloadSink: LiveAcceptancePayloadSink;
    failurePolicy: LiveAcceptanceRunnerFailurePolicy;
    now: number;
    maxEvidenceAgeMs: number;
    isCancelled: () => boolean;
}): Promise<LiveAcceptanceRunnerResult>;
//# sourceMappingURL=live-acceptance-runner.d.ts.map