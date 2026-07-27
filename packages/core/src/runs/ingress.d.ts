import { type IntakeAcknowledgementControl, type IntakeAcknowledgementLanguage } from "../channels/intake-acknowledgement-control.js";
import { type IngressAdmissionReservation } from "./message-ledger.js";
import { type InboundMessageRecord } from "./request-isolation.js";
import { type StartRootRunParams, type StartedRootRun } from "./start.js";
import type { RootRun } from "./types.js";
export type IngressReceiptLanguage = IntakeAcknowledgementLanguage;
export interface IngressExternalIdentity {
    source: StartRootRunParams["source"];
    sessionId: string;
    externalChatId?: string | number | undefined;
    externalThreadId?: string | number | undefined;
    externalMessageId?: string | number | undefined;
}
export interface SubmitUserRequestTransport {
    source: StartRootRunParams["source"];
    channelEventId: string;
    externalChatId?: string | number | undefined;
    externalThreadId?: string | number | null | undefined;
    externalMessageId?: string | number | undefined;
    userId?: string | number | null | undefined;
    receivedAt?: number | undefined;
}
export type SubmitUserRequestInput = Omit<StartRootRunParams, "source" | "inboundMessage"> & {
    transport: SubmitUserRequestTransport;
};
export interface StartedIngressRun {
    requestId: string;
    sessionId: string;
    source: StartRootRunParams["source"];
    inboundMessage: InboundMessageRecord;
    acknowledgement: IntakeAcknowledgementControl;
    started: StartedRootRun;
    admission?: {
        status: "admitted" | "duplicate";
        idempotencyKey: string;
        originalRunId?: string;
    };
}
export interface IngressRunDependencies {
    startRootRun: (params: StartRootRunParams) => StartedRootRun;
    monotonicNow?: () => number;
    reserveIngressAdmission?: (input: {
        idempotencyKey: string;
        runId: string;
        sessionId: string;
        source: string;
    }) => IngressAdmissionReservation;
    getRootRun?: (runId: string) => RootRun | undefined;
}
export declare const defaultIngressRunDependencies: IngressRunDependencies;
export interface ResolvedIngressStartParams extends StartRootRunParams {
    runId: string;
    sessionId: string;
    inboundMessage: InboundMessageRecord;
}
export declare function buildIngressDedupeKey(identity: IngressExternalIdentity): string;
export declare function buildIngressAcknowledgement(message: string): IntakeAcknowledgementControl;
export declare function resolveIngressStartParams(params: StartRootRunParams): ResolvedIngressStartParams;
export declare function buildSubmitUserRequestCommand(input: SubmitUserRequestInput): ResolvedIngressStartParams;
export declare function submitUserRequest(input: SubmitUserRequestInput, dependencies?: IngressRunDependencies): StartedIngressRun;
export declare class IngressAdmissionError extends Error {
    readonly reasonCode: "ingress_admission_persistence_unavailable";
    constructor(reasonCode: "ingress_admission_persistence_unavailable");
}
export declare function startIngressRun(params: StartRootRunParams, dependencies?: IngressRunDependencies): StartedIngressRun;
//# sourceMappingURL=ingress.d.ts.map