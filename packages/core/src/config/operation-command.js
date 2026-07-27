import { importDatabaseFromBackup, } from "./operations.js";
import { createConfigurationOperationLifecycle, } from "./operation-lifecycle.js";
const FAILED_COMMANDS = new WeakMap();
function rememberFailedCommand(error, snapshot) {
    if ((typeof error === "object" && error !== null) || typeof error === "function") {
        FAILED_COMMANDS.set(error, snapshot);
    }
}
export function getFailedConfigurationOperationSnapshot(error) {
    if ((typeof error !== "object" || error === null) && typeof error !== "function")
        return null;
    return FAILED_COMMANDS.get(error) ?? null;
}
function event(snapshot, reasonCode) {
    return Object.freeze({
        commandId: snapshot.commandId,
        kind: snapshot.kind,
        state: snapshot.state,
        reasonCode,
    });
}
function productEvent(snapshot, reasonCode) {
    return Object.freeze({
        kind: snapshot.kind,
        state: snapshot.state,
        reasonCode,
    });
}
function transition(lifecycle, logger, next, reasonCode) {
    lifecycle.transition(next, reasonCode);
    const snapshot = lifecycle.snapshot();
    logger.fieldDebug("configuration operation transition", event(snapshot, reasonCode));
    return snapshot;
}
export function runPersistedConfigurationOperation(input) {
    const lifecycle = createConfigurationOperationLifecycle({
        kind: input.kind,
        ...(input.commandId ? { commandId: input.commandId } : {}),
    });
    transition(lifecycle, input.logger, "validated", "input_validated");
    transition(lifecycle, input.logger, "executing", "adapter_started");
    input.logger.development("configuration operation adapter started", event(lifecycle.snapshot(), "adapter_started"));
    let value;
    try {
        value = input.execute();
    }
    catch (error) {
        const failed = transition(lifecycle, input.logger, "failed", "adapter_failed");
        rememberFailedCommand(error, failed);
        input.logger.product("configuration operation failed", productEvent(failed, "adapter_failed"));
        throw error;
    }
    transition(lifecycle, input.logger, "persisted", "adapter_completed");
    input.logger.development("configuration operation adapter completed", event(lifecycle.snapshot(), "adapter_completed"));
    const command = transition(lifecycle, input.logger, "completed", "operation_completed");
    input.logger.product("configuration operation completed", productEvent(command, "operation_completed"));
    return { value, command };
}
export function rejectConfigurationOperation(input) {
    const lifecycle = createConfigurationOperationLifecycle({
        kind: input.kind,
        ...(input.commandId ? { commandId: input.commandId } : {}),
    });
    const command = transition(lifecycle, input.logger, "rejected", input.reasonCode);
    input.logger.product("configuration operation rejected", productEvent(command, input.reasonCode));
    return command;
}
export function runDatabaseImportConfigurationOperation(input) {
    const lifecycle = createConfigurationOperationLifecycle({
        kind: "config.db.import",
        ...(input.commandId ? { commandId: input.commandId } : {}),
    });
    transition(lifecycle, input.logger, "validated", "input_validated");
    let rollbackCompleted = false;
    try {
        const backupPath = input.resolveBackupPath();
        const value = importDatabaseFromBackup({ backupPath }, input.paths, {
            onBackedUp: () => { transition(lifecycle, input.logger, "backed_up", "rollback_backup_created"); },
            onReplacing: () => { transition(lifecycle, input.logger, "replacing", "database_replace_started"); },
            onVerifying: () => { transition(lifecycle, input.logger, "verifying", "database_verification_started"); },
            onRollingBack: () => { transition(lifecycle, input.logger, "rolling_back", "database_rollback_started"); },
            onRollbackCompleted: () => { rollbackCompleted = true; },
        });
        const command = transition(lifecycle, input.logger, "completed", "database_import_completed");
        input.logger.product("configuration operation completed", productEvent(command, "database_import_completed"));
        return { value, command };
    }
    catch (error) {
        const current = lifecycle.snapshot().state;
        const failed = current === "validated"
            ? transition(lifecycle, input.logger, "rejected", "database_import_rejected")
            : current === "rolling_back"
                ? transition(lifecycle, input.logger, "failed", rollbackCompleted ? "database_import_rolled_back" : "database_rollback_failed")
                : lifecycle.snapshot();
        rememberFailedCommand(error, failed);
        input.logger.product("configuration operation failed", productEvent(failed, failed.transitions.at(-1)?.reasonCode ?? "database_import_failed"));
        throw error;
    }
}
//# sourceMappingURL=operation-command.js.map