import type { RuntimePaths } from "../config/paths.js";
import { type DbSchedule } from "../db/index.js";
export type ScheduleExecutionDriver = "internal" | "system_crontab" | "system_schtasks";
export type SystemCronRuntimePaths = Pick<RuntimePaths, "stateDir" | "logsDir">;
export interface SystemCronProcessAdapter {
    readonly platform: NodeJS.Platform;
    readonly execPath: string;
    exists(path: string): boolean;
    spawn(command: string, args: string[], options: {
        encoding: "utf-8";
        input?: string;
    }): {
        error?: Error | undefined;
        status: number | null;
        stdout: string;
        stderr: string;
    };
}
export declare function buildManagedSystemCronEntry(schedule: DbSchedule, paths: SystemCronRuntimePaths, processAdapter?: SystemCronProcessAdapter): string[];
export declare function reconcileSystemCronSchedule(schedule: DbSchedule, paths: SystemCronRuntimePaths, processAdapter?: SystemCronProcessAdapter): {
    driver: ScheduleExecutionDriver;
    reason?: string;
};
export declare function removeSystemCronSchedule(scheduleId: string, processAdapter?: SystemCronProcessAdapter): void;
export declare function reconcileScheduleExecution(scheduleId: string, paths: SystemCronRuntimePaths, processAdapter?: SystemCronProcessAdapter): {
    driver: ScheduleExecutionDriver;
    reason?: string;
};
export declare function removeManagedScheduleExecution(scheduleId: string, _paths: SystemCronRuntimePaths, processAdapter?: SystemCronProcessAdapter): void;
//# sourceMappingURL=system-cron.d.ts.map