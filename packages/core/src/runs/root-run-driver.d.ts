import type { AgentContextMode } from "../agent/index.js";
import type { TaskExecutionSemantics, TaskIntentEnvelope, TaskStructuredRequest } from "../agent/intake.js";
import type { insertMessage } from "../db/index.js";
import type { AIProvider } from "../ai/index.js";
import type { SyntheticApprovalRuntimeDependencies } from "./approval.js";
import type { RunChunkDeliveryHandler, logAssistantReply } from "./delivery.js";
import type { AgentAttributionSnapshot } from "../contracts/sub-agent-orchestration.js";
import type { SolutionPlanCapabilitySelection } from "../contracts/llm-solution-plan-provider.js";
import { createExecutionLoopRuntimeState } from "./execution-profile.js";
import { type FinalizationDependencies, type FinalizationSource } from "./finalization.js";
import type { FinalResponseIdentityContext } from "./final-response-renderer.js";
import type { CanonicalRecoveryReentryRecorder } from "./execution-cycle-pass.js";
import type { RecoveredExecutionAttempt } from "./execution-cycle-pass.js";
import type { CanonicalCompletionOutcomeRecorder } from "./review-outcome-pass.js";
import type { CanonicalDeliveryRecorder } from "./finalization.js";
import type { CanonicalPendingResponseConsumer, CanonicalPendingResponseStager } from "./finalization.js";
import type { LoopDirective } from "./loop-directive.js";
import { applyRootRunDriverFailure } from "./root-run-driver-failure.js";
import { prepareRootLoopLaunch } from "./root-loop-launch.js";
import { runRootLoop } from "./root-loop.js";
import type { ReconnectRequestGroupSelection } from "./store.js";
import type { TaskProfile } from "./types.js";
import type { WorkerRuntimeTarget } from "./worker-runtime.js";
import type { KnowbeeConfig } from "../config/types.js";
import type { ArtifactStorageContext } from "../artifacts/lifecycle.js";
import type { MemoryJournalRepository } from "../memory/journal.js";
import { runTopologyRootRun, type TopologyRootRunExecutionResult, type TopologyRootRunRoutingDecision } from "../topology-runtime/harness.js";
import type { CanonicalTerminalEvidenceResult } from "./canonical-terminal-evidence.js";
import type { AdmittedCapabilityExecutionScope } from "./run-scoped-tool-admission.js";
export interface RootRunDriverDependencies {
    getAdmittedCapabilityExecutionScope: () => AdmittedCapabilityExecutionScope | undefined;
    appendRunEvent: (runId: string, message: string) => void;
    updateRunSummary: (runId: string, summary: string) => void;
    setRunStepStatus: (runId: string, step: string, status: "pending" | "running" | "completed" | "failed" | "cancelled", summary: string) => void;
    updateRunStatus: (runId: string, status: "queued" | "running" | "awaiting_approval" | "awaiting_user" | "completed" | "failed" | "cancelled" | "interrupted", summary: string, active: boolean) => void;
    rememberRunFailure: (params: {
        runId: string;
        sessionId: string;
        source: FinalizationSource;
        summary: string;
        detail?: string;
        title?: string;
    }) => void;
    incrementDelegationTurnCount: (runId: string, summary: string) => void;
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
    runVerificationSubtask: (params: {
        originalRequest: string;
        mutationPaths: string[];
    }) => Promise<{
        ok: boolean;
        summary: string;
        reason?: string;
        remainingItems?: string[];
    }>;
    rememberRunApprovalScope: (runId: string, toolName: string) => void;
    grantRunApprovalScope: (runId: string, toolName: string) => void;
    grantRunSingleApproval: (runId: string, toolName: string) => void;
    onDeliveryError?: (message: string) => void;
    onReviewError?: (message: string) => void;
    recordCanonicalAttempt: (input: {
        runId: string;
        attempt: import("./execution-attempt-pass.js").ExecutionAttemptPassResult;
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
    recordCanonicalCancellation: (input: {
        runId: string;
        cancellationKind: "user_requested" | "runtime_abort";
        signalAborted: boolean;
    }) => Promise<{
        ok: true;
        receiptRef: string;
    } | {
        ok: false;
        reasonCode: string;
    }>;
    getCanonicalTerminalOutcome: (runId: string) => "blocked" | "cancelled" | "user_input" | "approval" | null;
    getCanonicalTerminalEvidence: (runId: string) => CanonicalTerminalEvidenceResult;
    admitCanonicalTopologyExecution: (input: {
        runId: string;
        route: Extract<TopologyRootRunRoutingDecision, {
            mode: "route";
        }>;
        requestDiagnosisReceiptId: string;
        solutionPlanReceiptId: string;
        capabilitySelections: SolutionPlanCapabilitySelection[];
    }) => Promise<{
        ok: true;
        capabilityAdmissionReceiptId?: string | undefined;
    } | {
        ok: false;
        reasonCode: string;
    }>;
    recordCanonicalTopologyResult: (input: {
        runId: string;
        result: TopologyRootRunExecutionResult;
        resultDiagnosisReceiptId?: string | undefined;
    }) => Promise<{
        ok: true;
        finalOutcome?: "succeeded" | "partial" | "blocked" | "exhausted" | undefined;
    } | {
        ok: false;
        reasonCode: string;
    }>;
    executeLoopDirective: (directive: LoopDirective) => Promise<"break">;
    tryHandleActiveQueueCancellation: () => Promise<LoopDirective | null>;
    tryHandleIntakeBridge: (params: {
        currentMessage: string;
        originalRequest: string;
    }) => Promise<LoopDirective | null>;
    getSyntheticApprovalAlreadyApproved: (toolName: string) => boolean;
    onBootstrapInfo?: (message: string, payload?: Record<string, unknown>) => void;
    onFinally?: () => void;
}
interface RootRunDriverModuleDependencies {
    createExecutionLoopRuntimeState: typeof createExecutionLoopRuntimeState;
    prepareRootLoopLaunch: typeof prepareRootLoopLaunch;
    runRootLoop: typeof runRootLoop;
    applyRootRunDriverFailure: typeof applyRootRunDriverFailure;
    runTopologyRootRun: typeof runTopologyRootRun;
}
export declare function executeRootRunDriver(params: {
    artifactStorage: ArtifactStorageContext;
    memoryJournal: MemoryJournalRepository;
    runId: string;
    sessionId: string;
    requestGroupId: string;
    source: FinalizationSource;
    onChunk: RunChunkDeliveryHandler | undefined;
    controller: AbortController;
    message: string;
    originalRequest?: string;
    executionSemantics?: TaskExecutionSemantics;
    structuredRequest?: TaskStructuredRequest;
    intentEnvelope?: TaskIntentEnvelope;
    currentModel: string | undefined;
    currentProviderId: string | undefined;
    currentProvider: AIProvider | undefined;
    currentTargetId: string | undefined;
    currentTargetLabel: string | undefined;
    workDir: string;
    config: KnowbeeConfig;
    finalResponseIdentityContext?: FinalResponseIdentityContext | undefined;
    skipIntake?: boolean;
    immediateCompletionText?: string;
    reconnectNeedsClarification: boolean;
    reconnectTargetTitle?: string;
    reconnectSelection?: ReconnectRequestGroupSelection;
    queuedBehindRequestGroupRun: boolean;
    activeWorkerRuntime: WorkerRuntimeTarget | undefined;
    workerSessionId?: string;
    toolsEnabled?: boolean;
    isRootRequest: boolean;
    suppressFinalDelivery?: boolean;
    contextMode: AgentContextMode;
    taskProfile: TaskProfile;
    scheduleId?: string;
    includeScheduleMemory?: boolean;
    memorySearchQuery?: string;
    topologyRouting?: TopologyRootRunRoutingDecision;
    speaker?: AgentAttributionSnapshot;
    syntheticApprovalRuntimeDependencies: SyntheticApprovalRuntimeDependencies;
    defaultMaxDelegationTurns: number;
    recoveredAttempt?: RecoveredExecutionAttempt;
}, dependencies: RootRunDriverDependencies, moduleDependencies?: RootRunDriverModuleDependencies): Promise<void>;
export {};
//# sourceMappingURL=root-run-driver.d.ts.map