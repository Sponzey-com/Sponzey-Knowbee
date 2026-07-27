import { type AuditedWorkRecordStatusTransitionApplicationResult, type StructuredWorkAuditResult } from "../contracts/structured-work-audit.js";
import type { WorkRecord, WorkRecordStatus } from "../contracts/work-record.js";
import type { LlmDiagnosedActionFlowAcceptance } from "../contracts/llm-diagnosed-action-flow.js";
import type { StructuredWorkDecisionReadiness } from "../contracts/structured-work-decision-readiness.js";
import type { WorkRecordContinuityRecoveryAcceptance } from "../contracts/work-record-continuity-recovery.js";
export type StructuredWorkAuditLedgerStage = "pre_dispatch_handoff" | "post_review_child_result" | "status_transition" | "diagnosed_action_flow" | "decision_readiness" | "continuity_recovery";
export interface StructuredWorkAuditLedgerInput {
    audit: StructuredWorkAuditResult<unknown>;
    runId: string;
    stage: StructuredWorkAuditLedgerStage;
    source: string;
    dedupeKey: string;
    subSessionId?: string | undefined;
    agentId?: string | undefined;
    correlationId?: string | undefined;
    payload?: Record<string, unknown> | undefined;
}
export interface StructuredWorkAuditLedgerResult {
    recorded: boolean;
    reasonCode?: "ledger_write_failed";
}
export interface AuditedWorkRecordTransitionLedgerInput {
    record: WorkRecord;
    nextStatus: WorkRecordStatus;
    runId: string;
    source: string;
    dedupeKey: string;
    subSessionId?: string | undefined;
    agentId?: string | undefined;
    correlationId?: string | undefined;
    payload?: Record<string, unknown> | undefined;
}
export interface AuditedWorkRecordTransitionLedgerResult {
    application: AuditedWorkRecordStatusTransitionApplicationResult;
    ledger: StructuredWorkAuditLedgerResult;
}
export interface DiagnosedActionFlowLedgerInput {
    acceptance: LlmDiagnosedActionFlowAcceptance;
    source: string;
    dedupeKey: string;
    agentId?: string | undefined;
    correlationId?: string | undefined;
}
export interface StructuredWorkDecisionReadinessLedgerInput {
    readiness: StructuredWorkDecisionReadiness;
    workId: string;
    runId: string;
    source: string;
    dedupeKey: string;
    agentId?: string | undefined;
    correlationId?: string | undefined;
}
export interface WorkRecordContinuityRecoveryLedgerInput {
    acceptance: WorkRecordContinuityRecoveryAcceptance;
    workId: string;
    runId: string;
    source: string;
    dedupeKey: string;
    agentId?: string | undefined;
    correlationId?: string | undefined;
}
export declare function buildStructuredWorkAuditPayload(audit: StructuredWorkAuditResult<unknown>): Record<string, unknown>;
export declare function recordStructuredWorkAuditEventSafely(input: StructuredWorkAuditLedgerInput): StructuredWorkAuditLedgerResult;
export declare function applyAndRecordWorkRecordStatusTransitionSafely(input: AuditedWorkRecordTransitionLedgerInput): AuditedWorkRecordTransitionLedgerResult;
export declare function recordDiagnosedActionFlowAcceptanceSafely(input: DiagnosedActionFlowLedgerInput): StructuredWorkAuditLedgerResult;
export declare function recordStructuredWorkDecisionReadinessSafely(input: StructuredWorkDecisionReadinessLedgerInput): StructuredWorkAuditLedgerResult;
export declare function recordWorkRecordContinuityRecoverySafely(input: WorkRecordContinuityRecoveryLedgerInput): StructuredWorkAuditLedgerResult;
//# sourceMappingURL=structured-work-audit-ledger.d.ts.map