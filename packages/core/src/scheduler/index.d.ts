import { type DbSchedule } from "../db/index.js";
import { startIngressRun } from "../runs/ingress.js";
import type { AgentHierarchyStorage } from "../orchestration/hierarchy.js";
import type { KnowbeeConfig } from "../config/types.js";
import type { ArtifactStorageContext } from "../artifacts/lifecycle.js";
import type { MemoryJournalRepository } from "../memory/journal.js";
import { type ScheduledExecutionResult } from "./contract-executor.js";
export interface CanonicalScheduledRequestDependencies {
    startIngressRunImpl: typeof startIngressRun;
}
export declare function executeCanonicalScheduledRequest(params: {
    artifactStorage: ArtifactStorageContext;
    memoryJournal: MemoryJournalRepository;
    hierarchyStorage: AgentHierarchyStorage;
    schedule: DbSchedule;
    scheduleRunId: string;
    config: KnowbeeConfig;
}, dependencies?: CanonicalScheduledRequestDependencies): Promise<ScheduledExecutionResult>;
declare class Scheduler {
    private timer;
    private config;
    private artifactStorage;
    private memoryJournal;
    private hierarchyStorage;
    start(config: KnowbeeConfig, artifactStorage: ArtifactStorageContext, memoryJournal: MemoryJournalRepository, hierarchyStorage: AgentHierarchyStorage): void;
    stop(): void;
    /** Re-tick immediately to pick up schedule changes */
    reload(): void;
    private requireConfig;
    private requireArtifactStorage;
    private requireMemoryJournal;
    private requireHierarchyStorage;
    getHealth(config: KnowbeeConfig): {
        running: boolean;
        activeJobs: number;
        activeJobIds: string[];
        nextRuns: Array<{
            scheduleId: string;
            name: string;
            nextRunAt: number;
        }>;
    };
    private tick;
    runNow(scheduleId: string, trigger: string, config: KnowbeeConfig, artifactStorage: ArtifactStorageContext, memoryJournal: MemoryJournalRepository, hierarchyStorage?: AgentHierarchyStorage): Promise<string>;
    runNowAndWait(scheduleId: string, trigger: string, config: KnowbeeConfig, artifactStorage: ArtifactStorageContext, memoryJournal: MemoryJournalRepository, hierarchyStorage?: AgentHierarchyStorage): Promise<string>;
    private runNowInternal;
    private executeQueuedRun;
    private _execute;
}
export declare const scheduler: Scheduler;
export declare function startScheduler(config: KnowbeeConfig, artifactStorage: ArtifactStorageContext, memoryJournal: MemoryJournalRepository, hierarchyStorage: AgentHierarchyStorage): void;
export declare function stopScheduler(): void;
export declare function runSchedule(scheduleId: string, trigger: string, config: KnowbeeConfig, artifactStorage: ArtifactStorageContext, memoryJournal: MemoryJournalRepository, hierarchyStorage: AgentHierarchyStorage): Promise<string>;
export declare function runScheduleAndWait(scheduleId: string, trigger: string, config: KnowbeeConfig, artifactStorage: ArtifactStorageContext, memoryJournal: MemoryJournalRepository, hierarchyStorage: AgentHierarchyStorage): Promise<string>;
export {};
//# sourceMappingURL=index.d.ts.map