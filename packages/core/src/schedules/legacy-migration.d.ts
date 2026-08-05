import { type ScheduleContract } from "../contracts/index.js";
import type { KnowbeeConfig } from "../config/types.js";
import { type DbSchedule } from "../db/index.js";
export type LegacyScheduleMigrationRisk = "low" | "medium" | "high" | "blocked";
export type LegacyScheduleMigrationStatus = "already_contract" | "convertible" | "blocked";
export interface LegacyScheduleMigrationPersistencePreview {
    identityKey: string;
    payloadHash: string;
    deliveryKey: string;
    contractSchemaVersion: number;
}
export interface LegacyScheduleMigrationReport {
    scheduleId: string;
    scheduleName: string;
    status: LegacyScheduleMigrationStatus;
    legacy: boolean;
    convertible: boolean;
    risk: LegacyScheduleMigrationRisk;
    confidence: number;
    reasons: string[];
    warnings: string[];
    contract: ScheduleContract | null;
    persistence: LegacyScheduleMigrationPersistencePreview | null;
}
export interface LegacyScheduleMigrationItem {
    scheduleId: string;
    name: string;
    rawPrompt: string;
    cronExpression: string;
    timezone: string | null;
    enabled: boolean;
    target: {
        channel: string;
        sessionId: string | null;
    };
    legacy: boolean;
    convertible: boolean;
    risk: LegacyScheduleMigrationRisk;
    reason: string;
    createdAt: number;
    updatedAt: number;
    lastRunAt: number | null;
}
export declare function buildLegacyScheduleMigrationReport(schedule: DbSchedule, config: KnowbeeConfig): LegacyScheduleMigrationReport;
export declare function dryRunLegacyScheduleMigration(scheduleId: string, options: {
    audit?: boolean;
    config: KnowbeeConfig;
}): LegacyScheduleMigrationReport | null;
export declare function applyLegacyScheduleMigration(scheduleId: string, options: {
    config: KnowbeeConfig;
}): {
    ok: boolean;
    report: LegacyScheduleMigrationReport | null;
    error?: string;
};
export declare function keepLegacySchedule(scheduleId: string, options: {
    config: KnowbeeConfig;
}): {
    ok: boolean;
    report: LegacyScheduleMigrationReport | null;
    error?: string;
};
export declare function listLegacyScheduleMigrationItems(config: KnowbeeConfig): LegacyScheduleMigrationItem[];
//# sourceMappingURL=legacy-migration.d.ts.map