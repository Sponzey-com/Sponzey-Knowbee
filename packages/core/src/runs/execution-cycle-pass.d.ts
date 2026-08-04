import type { AgentContextMode } from "../agent/index.js";
import type { ResponseLanguageMode, TaskExecutionSemantics } from "../agent/intake.js";
import type { insertMessage } from "../db/index.js";
import type { AIProvider } from "../ai/index.js";
import type { KnowbeeConfig } from "../config/types.js";
import type { ArtifactStorageContext } from "../artifacts/lifecycle.js";
import type { MemoryJournalRepository } from "../memory/journal.js";
import { applyPostExecutionPassResult, applyRecoveryEntryPassResult, applyReviewCyclePassResult } from "./loop-pass-application.js";
import { runExecutionAttemptPass, type ExecutionAttemptPassResult } from "./execution-attempt-pass.js";
import { runRecoveryEntryPass } from "./recovery-entry-pass.js";
import { runPostExecutionPass } from "./post-execution-pass.js";
import { runReviewCyclePass } from "./review-cycle-pass.js";
import type { logAssistantReply, RunChunkDeliveryHandler, SuccessfulFileDelivery } from "./delivery.js";
import type { CanonicalPendingResponseConsumer, CanonicalPendingResponseStager, FinalizationDependencies, FinalizationSource } from "./finalization.js";
import type { RecoveryBudgetUsage } from "./recovery-budget.js";
import type { SuccessfulToolEvidence } from "./recovery.js";
import type { TaskProfile } from "./types.js";
import type { WorkerRuntimeTarget } from "./worker-runtime.js";
import type { SyntheticApprovalRuntimeDependencies } from "./approval.js";
import type { CanonicalCompletionOutcomeRecorder } from "./review-outcome-pass.js";
import type { CanonicalDeliveryRecorder } from "./finalization.js";
import type { FinalResponseIdentityContext } from "./final-response-renderer.js";
import type { AdmittedCapabilityExecutionScope } from "./run-scoped-tool-admission.js";
import type { WebExecutionState } from "../contracts/web-execution-state.js";
import type { NextAttemptToolPolicy } from "./next-attempt-tool-policy.js";
type RecoveryLimitStop = {
    summary: string;
    reason: string;
    remainingItems: string[];
} | null;
export interface ExecutionCycleState {
    currentMessage: string;
    requiredToolNames: string[];
    nextAttemptToolPolicy?: NextAttemptToolPolicy;
    currentModel: string | undefined;
    currentProviderId: string | undefined;
    currentProvider: AIProvider | undefined;
    currentTargetId: string | undefined;
    currentTargetLabel: string | undefined;
    activeWorkerRuntime: WorkerRuntimeTarget | undefined;
    executionRecoveryLimitStop: RecoveryLimitStop;
    aiRecoveryLimitStop: RecoveryLimitStop;
    sawRealFilesystemMutation: boolean;
    filesystemMutationRecoveryAttempted: boolean;
    truncatedOutputRecoveryAttempted: boolean;
    successfulTools: SuccessfulToolEvidence[];
    webExecutionState: WebExecutionState;
    recoveredAttempt?: RecoveredExecutionAttempt;
}
export interface RecoveredExecutionAttempt {
    preview: string;
    canonicalAttemptEvidenceRefs: string[];
    successfulFileDeliveries?: SuccessfulFileDelivery[];
}
export type ExecutionCyclePassResult = {
    kind: "break";
} | {
    kind: "retry";
    state: ExecutionCycleState;
};
export interface CanonicalRecoveryReentryInput {
    runId: string;
    previousResult: string;
    strategy: {
        message: string;
        model?: string | undefined;
        providerId?: string | undefined;
        targetId?: string | undefined;
        targetLabel?: string | undefined;
        workerRuntimeKind?: string | undefined;
    };
}
export type CanonicalRecoveryReentryRecorder = (input: CanonicalRecoveryReentryInput) => Promise<{
    ok: true;
} | {
    ok: false;
    reasonCode: string;
}>;
interface ExecutionCyclePassDependencies {
    rememberRunFailure: (params: {
        runId: string;
        sessionId: string;
        source: FinalizationSource;
        summary: string;
        detail?: string;
        title?: string;
    }) => void;
    incrementDelegationTurnCount: (runId: string, summary: string) => void;
    appendRunEvent: (runId: string, message: string) => void;
    updateRunSummary: (runId: string, summary: string) => void;
    setRunStepStatus: (runId: string, step: string, status: "pending" | "running" | "completed" | "failed" | "cancelled", summary: string) => void;
    updateRunStatus: (runId: string, status: "queued" | "running" | "awaiting_approval" | "awaiting_user" | "completed" | "failed" | "cancelled" | "interrupted", summary: string, active: boolean) => void;
    markAbortedRunCancelledIfActive: (runId: string) => void;
    getDelegationTurnState: () => {
        usedTurns: number;
        maxTurns: number;
    };
    getFinalizationDependencies: () => FinalizationDependencies;
    insertMessage: typeof insertMessage;
    writeReplyLog: typeof logAssistantReply;
    createId: () => string;
    now: () => number;
    runVerificationSubtask: () => Promise<{
        ok: boolean;
        summary: string;
        reason?: string;
        remainingItems?: string[];
    }>;
    rememberRunApprovalScope: (runId: string, toolName: string) => void;
    grantRunApprovalScope: (runId: string, toolName: string) => void;
    grantRunSingleApproval: (runId: string, toolName: string) => void;
    onReviewError?: (message: string) => void;
    recordCanonicalAttempt: (input: {
        runId: string;
        attempt: ExecutionAttemptPassResult;
        successfulToolNames: string[];
    }) => Promise<{
        ok: true;
        evidenceRefs?: string[];
    } | {
        ok: false;
        reasonCode: string;
    }>;
    recordCanonicalRecoveryReentry: CanonicalRecoveryReentryRecorder;
    recordCanonicalCompletionOutcome: CanonicalCompletionOutcomeRecorder;
    recordCanonicalDelivery: CanonicalDeliveryRecorder;
    stageCanonicalPendingResponse: CanonicalPendingResponseStager;
    consumeCanonicalPendingResponse: CanonicalPendingResponseConsumer;
}
interface ExecutionCyclePassModuleDependencies {
    runExecutionAttemptPass: typeof runExecutionAttemptPass;
    runRecoveryEntryPass: typeof runRecoveryEntryPass;
    runPostExecutionPass: typeof runPostExecutionPass;
    runReviewCyclePass: typeof runReviewCyclePass;
    applyRecoveryEntryPassResult: typeof applyRecoveryEntryPassResult;
    applyPostExecutionPassResult: typeof applyPostExecutionPassResult;
    applyReviewCyclePassResult: typeof applyReviewCyclePassResult;
}
export declare function runExecutionCyclePass(params: {
    artifactStorage: ArtifactStorageContext;
    memoryJournal: MemoryJournalRepository;
    runId: string;
    sessionId: string;
    requestGroupId: string;
    source: FinalizationSource;
    onChunk: RunChunkDeliveryHandler | undefined;
    signal: AbortSignal;
    state: ExecutionCycleState;
    executionSemantics: TaskExecutionSemantics;
    originalRequest: string;
    responseLanguageMode?: ResponseLanguageMode | undefined;
    memorySearchQuery: string;
    admittedCapabilityExecutionScope?: AdmittedCapabilityExecutionScope | undefined;
    scheduleId?: string;
    includeScheduleMemory?: boolean;
    config: KnowbeeConfig;
    verificationRequest: string;
    workDir: string;
    finalResponseIdentityContext?: FinalResponseIdentityContext | undefined;
    toolsEnabled?: boolean;
    onDeliveryError?: (message: string) => void;
    abortExecutionStream: () => void;
    isRootRequest: boolean;
    contextMode: AgentContextMode;
    taskProfile: TaskProfile;
    workerSessionId?: string;
    wantsDirectArtifactDelivery: boolean;
    requiresFilesystemMutation: boolean;
    requiresPrivilegedToolExecution: boolean;
    pendingToolParams: Map<string, unknown>;
    filesystemMutationPaths: Set<string>;
    successfulTools: SuccessfulToolEvidence[];
    completionConditions: string[];
    seenFollowupPrompts: Set<string>;
    seenCommandFailureRecoveryKeys: Set<string>;
    seenExecutionRecoveryKeys: Set<string>;
    seenDeliveryRecoveryKeys: Set<string>;
    seenAiRecoveryKeys: Set<string>;
    recoveryBudgetUsage: RecoveryBudgetUsage;
    priorAssistantMessages: string[];
    syntheticApprovalAlreadyApproved: boolean;
    syntheticApprovalRuntimeDependencies: SyntheticApprovalRuntimeDependencies;
    defaultMaxDelegationTurns: number;
}, dependencies: ExecutionCyclePassDependencies, moduleDependencies?: ExecutionCyclePassModuleDependencies): Promise<ExecutionCyclePassResult>;
export {};
//# sourceMappingURL=execution-cycle-pass.d.ts.map