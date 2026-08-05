import type { KnowbeeConfig } from "../config/types.js";
import type { ArtifactStorageContext } from "../artifacts/lifecycle.js";
import type { MemoryJournalRepository } from "../memory/journal.js";
import type { AgentHierarchyStorage } from "../orchestration/hierarchy.js";
import { type ScheduleContract } from "../contracts/index.js";
import { type DbSchedule } from "../db/index.js";
import { startIngressRun } from "../runs/ingress.js";
export interface ScheduledExecutionResult {
    success: boolean;
    summary: string | null;
    error: string | null;
    executionSuccess?: boolean | null;
    deliverySuccess?: boolean | null;
    deliveryDedupeKey?: string | null;
    deliveryError?: string | null;
    retryable?: boolean | undefined;
}
export type ScheduleContractExecutionResult = {
    handled: false;
} | {
    handled: true;
    result: ScheduledExecutionResult;
};
export interface ScheduleContractExecutorDependencies {
    startIngressRunImpl?: typeof startIngressRun;
    deliverTelegramText?: (sessionId: string, text: string) => Promise<unknown>;
    deliverTelegramFile?: (sessionId: string, filePath: string, caption?: string) => Promise<unknown>;
    deliverSlackText?: (sessionId: string, text: string) => Promise<unknown>;
    deliverSlackFile?: (sessionId: string, filePath: string, caption?: string) => Promise<unknown>;
    logInfo?: (message: string, payload?: Record<string, unknown>) => void;
    logWarn?: (message: string) => void;
    logError?: (message: string, payload?: Record<string, unknown>) => void;
}
interface ExecuteScheduleContractInput {
    artifactStorage: ArtifactStorageContext;
    memoryJournal: MemoryJournalRepository;
    hierarchyStorage: AgentHierarchyStorage;
    config: KnowbeeConfig;
    schedule: DbSchedule;
    scheduleRunId: string;
    trigger: string;
    startedAt: number;
    dependencies?: ScheduleContractExecutorDependencies;
}
export declare function resolveScheduleDueAt(params: {
    trigger: string;
    scheduleRunId: string;
    startedAt: number;
}): string;
export declare function buildScheduledAgentExecutionBrief(params: {
    schedule: DbSchedule;
    contract: ScheduleContract;
    dueAt: string;
}): string;
export declare function executeScheduleContract(input: ExecuteScheduleContractInput): Promise<ScheduleContractExecutionResult>;
export {};
//# sourceMappingURL=contract-executor.d.ts.map