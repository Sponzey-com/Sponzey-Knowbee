import { type AIProvider, type ProviderAuditTrace } from "../ai/index.js";
import type { KnowbeeConfig } from "../config/types.js";
import type { ArtifactStorageContext } from "../artifacts/lifecycle.js";
import type { ChannelSource } from "../channels/contracts.js";
import { buildScheduleRegistrationCancelledEvent, buildScheduleRegistrationCreatedEvent } from "../scheduler/lifecycle.js";
import { type AnalyzeTaskIntakeParams, type TaskExecutionSemantics, type TaskIntakeAnalysisOutcome, type TaskIntentEnvelope, type TaskIntakeResult, type TaskStructuredRequest } from "../agent/intake.js";
import { reviewTaskCompletion } from "../agent/completion-review.js";
import type { AgentContextMode } from "../agent/index.js";
import { resolveRunRoute } from "./routing.js";
import { buildFollowupPrompt, createDefaultScheduleActionDependencies, executeScheduleActions, inferDelegatedTaskProfile, type ScheduleDelayedRunRequest } from "./action-execution.js";
import { emitAssistantTextDelivery, type RunChunkDeliveryHandler } from "./delivery.js";
import { type LoopDirective } from "./loop-directive.js";
import type { TaskProfile } from "./types.js";
import type { WorkerRuntimeTarget } from "./worker-runtime.js";
import type { FirstResponseDeadline } from "./first-response-deadline.js";
import type { FirstResponseReceiptRecorder } from "./first-response-receipt.js";
import type { AgentExecutionDecision, AgentExecutionDecisionTraceSnapshot, AgentExecutionToolBinding } from "../orchestration/execution-decision-contract.js";
import { decideExecutionRoute } from "../orchestration/decide-execution-route.js";
import { buildExecutionGraphSnapshot } from "../orchestration/execution-graph-snapshot.js";
import { runAgentExecutionHarness } from "../orchestration/execution-harness.js";
import { type CanonicalIntakeDiagnosisDescriptor } from "./canonical-intake-diagnosis.js";
export interface DelegatedRunStartParams {
    message: string;
    sessionId: string;
    taskProfile: TaskProfile;
    requestGroupId: string;
    parentRunId?: string | undefined;
    runScope?: "root" | "child" | "analysis" | undefined;
    handoffSummary?: string | undefined;
    originalRequest: string;
    executionSemantics: TaskExecutionSemantics;
    structuredRequest: TaskStructuredRequest;
    intentEnvelope: TaskIntentEnvelope;
    model?: string | undefined;
    providerId?: string | undefined;
    provider?: AIProvider | undefined;
    providerTrace?: ProviderAuditTrace | undefined;
    workerRuntime?: WorkerRuntimeTarget | undefined;
    targetId?: string | undefined;
    targetLabel?: string | undefined;
    agentExecutionDecision?: AgentExecutionDecision | undefined;
    agentExecutionDecisionTrace?: AgentExecutionDecisionTraceSnapshot | undefined;
    workDir: string;
    source: ChannelSource;
    skipIntake?: boolean | undefined;
    toolsEnabled?: boolean | undefined;
    contextMode?: AgentContextMode | undefined;
    onChunk?: RunChunkDeliveryHandler;
}
export interface DelegatedRunStartResult {
    runId?: string | undefined;
    finished?: Promise<{
        status?: string;
        summary?: string;
    } | undefined>;
}
interface IntakeBridgePassDependencies {
    appendRunEvent: (runId: string, message: string) => void;
    updateRunSummary: (runId: string, summary: string) => void;
    incrementDelegationTurnCount: (runId: string, summary: string) => void;
    emitScheduleCreated: (payload: ReturnType<typeof buildScheduleRegistrationCreatedEvent>) => void;
    emitScheduleCancelled: (payload: ReturnType<typeof buildScheduleRegistrationCancelledEvent>) => void;
    scheduleDelayedRun: (params: ScheduleDelayedRunRequest) => void;
    startDelegatedRun: (params: DelegatedRunStartParams) => void | DelegatedRunStartResult | Promise<void | DelegatedRunStartResult>;
    normalizeTaskProfile: (taskProfile: string | undefined) => TaskProfile;
    logInfo: (message: string, payload: Record<string, unknown>) => void;
    recordCanonicalIntakeDiagnosis: (descriptor: CanonicalIntakeDiagnosisDescriptor) => Promise<{
        ok: true;
    } | {
        ok: false;
        reasonCode: string;
    }>;
    authorizeCanonicalIntakePlan: (input: {
        runId: string;
        intake: TaskIntakeResult;
    }) => Promise<{
        ok: true;
        requiredToolNames?: string[] | undefined;
    } | {
        ok: false;
        reasonCode: string;
        safeEvidenceRefs?: readonly string[];
    }>;
    recordCanonicalExecutionStart: (input: {
        runId: string;
        intake: TaskIntakeResult;
    }) => Promise<{
        ok: true;
    } | {
        ok: false;
        reasonCode: string;
    }>;
    releaseCanonicalSimplePath: (input: {
        runId: string;
        workId: string;
        classificationFingerprint: `sha256:${string}`;
        answerSource: "llm_generated";
        requestFingerprint: `sha256:${string}`;
        answerFingerprint: `sha256:${string}`;
    }) => Promise<{
        ok: true;
    } | {
        ok: false;
        reasonCode: string;
    }>;
    recordExecutionDecisionTrace?: (params: {
        runId: string;
        agentExecutionDecision: AgentExecutionDecision;
        executionDecisionTrace: AgentExecutionDecisionTraceSnapshot;
    }) => void;
}
type IntakeAnalysisProvider = (params: AnalyzeTaskIntakeParams) => Promise<TaskIntakeResult | TaskIntakeAnalysisOutcome | null>;
interface IntakeBridgePassModuleDependencies {
    analyzeTaskIntake: IntakeAnalysisProvider;
    emitAssistantTextDelivery?: typeof emitAssistantTextDelivery;
    resolveRunRoute: typeof resolveRunRoute;
    executeScheduleActions: typeof executeScheduleActions;
    createDefaultScheduleActionDependencies: typeof createDefaultScheduleActionDependencies;
    inferDelegatedTaskProfile: typeof inferDelegatedTaskProfile;
    buildFollowupPrompt: typeof buildFollowupPrompt;
    decideExecutionRoute?: typeof decideExecutionRoute;
    buildExecutionGraphSnapshot?: typeof buildExecutionGraphSnapshot;
    runAgentExecutionHarness?: typeof runAgentExecutionHarness;
    reviewTaskCompletion?: typeof reviewTaskCompletion;
}
export declare function resolveIntakeDirectReceiptCompletion(intake: Pick<TaskIntakeResult, "notes" | "user_message">): LoopDirective | null;
export declare function runIntakeBridgePass(params: {
    artifactStorage: ArtifactStorageContext;
    message: string;
    originalRequest: string;
    sessionId: string;
    requestGroupId: string;
    model: string | undefined;
    providerId?: string | undefined;
    provider?: AIProvider | undefined;
    config: KnowbeeConfig;
    workDir: string;
    source: ChannelSource;
    runId: string;
    onChunk: RunChunkDeliveryHandler | undefined;
    signal?: AbortSignal;
    firstResponseDeadline?: FirstResponseDeadline;
    nowMs?: () => number;
    recordFirstResponseReceipt?: FirstResponseReceiptRecorder;
    reuseConversationContext: boolean;
    executionTools?: AgentExecutionToolBinding[] | undefined;
}, dependencies: IntakeBridgePassDependencies, moduleDependencies?: IntakeBridgePassModuleDependencies): Promise<LoopDirective | null>;
export {};
//# sourceMappingURL=intake-bridge-pass.d.ts.map