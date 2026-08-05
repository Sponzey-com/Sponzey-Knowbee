import type { Logger } from "../logger/index.js";
import { type ConfigurationOperationPaths, type DatabaseImportResult } from "./operations.js";
import { type ConfigurationOperationSnapshot, type ConfigurationOperationState } from "./operation-lifecycle.js";
export type ConfigurationOperationLogger = Pick<Logger, "product" | "fieldDebug" | "development">;
export interface ConfigurationOperationLogEvent {
    readonly commandId: string;
    readonly kind: string;
    readonly state: ConfigurationOperationState;
    readonly reasonCode: string;
}
export declare function getFailedConfigurationOperationSnapshot(error: unknown): ConfigurationOperationSnapshot | null;
export declare function runPersistedConfigurationOperation<T>(input: {
    kind: string;
    execute: () => T;
    logger: ConfigurationOperationLogger;
    commandId?: string;
}): {
    value: T;
    command: ConfigurationOperationSnapshot;
};
export declare function rejectConfigurationOperation(input: {
    kind: string;
    reasonCode: string;
    logger: ConfigurationOperationLogger;
    commandId?: string;
}): ConfigurationOperationSnapshot;
export declare function runDatabaseImportConfigurationOperation(input: {
    resolveBackupPath: () => string;
    paths: ConfigurationOperationPaths;
    logger: ConfigurationOperationLogger;
    commandId?: string;
}): {
    value: DatabaseImportResult;
    command: ConfigurationOperationSnapshot;
};
//# sourceMappingURL=operation-command.d.ts.map