import type { Logger } from "../logger/index.js"
import {
  importDatabaseFromBackup,
  type ConfigurationOperationPaths,
  type DatabaseImportResult,
} from "./operations.js"
import {
  createConfigurationOperationLifecycle,
  type ConfigurationOperationLifecycle,
  type ConfigurationOperationSnapshot,
  type ConfigurationOperationState,
} from "./operation-lifecycle.js"

export type ConfigurationOperationLogger = Pick<Logger, "product" | "fieldDebug" | "development">

export interface ConfigurationOperationLogEvent {
  readonly commandId: string
  readonly kind: string
  readonly state: ConfigurationOperationState
  readonly reasonCode: string
}

const FAILED_COMMANDS = new WeakMap<object, ConfigurationOperationSnapshot>()

function rememberFailedCommand(error: unknown, snapshot: ConfigurationOperationSnapshot): void {
  if ((typeof error === "object" && error !== null) || typeof error === "function") {
    FAILED_COMMANDS.set(error as object, snapshot)
  }
}

export function getFailedConfigurationOperationSnapshot(error: unknown): ConfigurationOperationSnapshot | null {
  if ((typeof error !== "object" || error === null) && typeof error !== "function") return null
  return FAILED_COMMANDS.get(error as object) ?? null
}

function event(snapshot: ConfigurationOperationSnapshot, reasonCode: string): ConfigurationOperationLogEvent {
  return Object.freeze({
    commandId: snapshot.commandId,
    kind: snapshot.kind,
    state: snapshot.state,
    reasonCode,
  })
}

function productEvent(snapshot: ConfigurationOperationSnapshot, reasonCode: string) {
  return Object.freeze({
    kind: snapshot.kind,
    state: snapshot.state,
    reasonCode,
  })
}

function transition(
  lifecycle: ConfigurationOperationLifecycle,
  logger: ConfigurationOperationLogger,
  next: ConfigurationOperationState,
  reasonCode: string,
): ConfigurationOperationSnapshot {
  lifecycle.transition(next, reasonCode)
  const snapshot = lifecycle.snapshot()
  logger.fieldDebug("configuration operation transition", event(snapshot, reasonCode))
  return snapshot
}

export function runPersistedConfigurationOperation<T>(input: {
  kind: string
  execute: () => T
  logger: ConfigurationOperationLogger
  commandId?: string
}): { value: T; command: ConfigurationOperationSnapshot } {
  const lifecycle = createConfigurationOperationLifecycle({
    kind: input.kind,
    ...(input.commandId ? { commandId: input.commandId } : {}),
  })
  transition(lifecycle, input.logger, "validated", "input_validated")
  transition(lifecycle, input.logger, "executing", "adapter_started")
  input.logger.development("configuration operation adapter started", event(lifecycle.snapshot(), "adapter_started"))

  let value: T
  try {
    value = input.execute()
  } catch (error) {
    const failed = transition(lifecycle, input.logger, "failed", "adapter_failed")
    rememberFailedCommand(error, failed)
    input.logger.product("configuration operation failed", productEvent(failed, "adapter_failed"))
    throw error
  }

  transition(lifecycle, input.logger, "persisted", "adapter_completed")
  input.logger.development("configuration operation adapter completed", event(lifecycle.snapshot(), "adapter_completed"))
  const command = transition(lifecycle, input.logger, "completed", "operation_completed")
  input.logger.product("configuration operation completed", productEvent(command, "operation_completed"))
  return { value, command }
}

export function rejectConfigurationOperation(input: {
  kind: string
  reasonCode: string
  logger: ConfigurationOperationLogger
  commandId?: string
}): ConfigurationOperationSnapshot {
  const lifecycle = createConfigurationOperationLifecycle({
    kind: input.kind,
    ...(input.commandId ? { commandId: input.commandId } : {}),
  })
  const command = transition(lifecycle, input.logger, "rejected", input.reasonCode)
  input.logger.product("configuration operation rejected", productEvent(command, input.reasonCode))
  return command
}

export function runDatabaseImportConfigurationOperation(input: {
  resolveBackupPath: () => string
  paths: ConfigurationOperationPaths
  logger: ConfigurationOperationLogger
  commandId?: string
}): { value: DatabaseImportResult; command: ConfigurationOperationSnapshot } {
  const lifecycle = createConfigurationOperationLifecycle({
    kind: "config.db.import",
    ...(input.commandId ? { commandId: input.commandId } : {}),
  })
  transition(lifecycle, input.logger, "validated", "input_validated")
  let rollbackCompleted = false

  try {
    const backupPath = input.resolveBackupPath()
    const value = importDatabaseFromBackup({ backupPath }, input.paths, {
      onBackedUp: () => { transition(lifecycle, input.logger, "backed_up", "rollback_backup_created") },
      onReplacing: () => { transition(lifecycle, input.logger, "replacing", "database_replace_started") },
      onVerifying: () => { transition(lifecycle, input.logger, "verifying", "database_verification_started") },
      onRollingBack: () => { transition(lifecycle, input.logger, "rolling_back", "database_rollback_started") },
      onRollbackCompleted: () => { rollbackCompleted = true },
    })
    const command = transition(lifecycle, input.logger, "completed", "database_import_completed")
    input.logger.product("configuration operation completed", productEvent(command, "database_import_completed"))
    return { value, command }
  } catch (error) {
    const current = lifecycle.snapshot().state
    const failed = current === "validated"
      ? transition(lifecycle, input.logger, "rejected", "database_import_rejected")
      : current === "rolling_back"
        ? transition(
            lifecycle,
            input.logger,
            "failed",
            rollbackCompleted ? "database_import_rolled_back" : "database_rollback_failed",
          )
        : lifecycle.snapshot()
    rememberFailedCommand(error, failed)
    input.logger.product("configuration operation failed", productEvent(failed, failed.transitions.at(-1)?.reasonCode ?? "database_import_failed"))
    throw error
  }
}
