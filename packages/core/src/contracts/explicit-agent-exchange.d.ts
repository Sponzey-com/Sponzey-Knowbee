import { type ChildWorkResult, type WorkHandoffPackage } from "./work-record.js";
import { type ResultReport } from "./sub-agent-orchestration.js";
export type ExplicitAgentExchangeKind = "work_handoff" | "child_result" | "result_report" | "approved_shared_context";
interface ExchangeBase {
    exchangeId: string;
    senderAgentName: string;
    receiverAgentName: string;
    purpose: string;
}
export type ExplicitAgentExchangeInput = (ExchangeBase & {
    kind: "work_handoff";
    artifact: WorkHandoffPackage;
}) | (ExchangeBase & {
    kind: "child_result";
    artifact: ChildWorkResult;
}) | (ExchangeBase & {
    kind: "result_report";
    artifact: ResultReport;
}) | (ExchangeBase & {
    kind: "approved_shared_context";
    contextId: string;
    approvedByAgentName: string;
    scope: string[];
    sourceRefs: string[];
    evaluatedAt: number;
    expiresAt?: number;
});
export interface ExplicitAgentExchangeEnvelope {
    schemaVersion: 1;
    exchangeId: string;
    kind: ExplicitAgentExchangeKind;
    senderAgentName: string;
    receiverAgentName: string;
    purpose: string;
    artifactRef: string;
    sourceRefs: string[];
    approvedScope: string[];
    memoryVisibility: "explicit_handoff_only";
    fingerprint: `sha256:${string}`;
}
export declare function createExplicitAgentExchange(input: ExplicitAgentExchangeInput): ExplicitAgentExchangeEnvelope;
export {};
//# sourceMappingURL=explicit-agent-exchange.d.ts.map