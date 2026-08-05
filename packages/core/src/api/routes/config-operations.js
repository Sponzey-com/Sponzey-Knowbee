import { basename } from "node:path";
import { authMiddleware } from "../middleware/auth.js";
import { sanitizeUserFacingError } from "../../runs/error-sanitizer.js";
import { logger, redactLogText } from "../../logger/index.js";
import { buildConfigurationOperationsSnapshot, createDatabaseBackup, dryRunDatabaseMigrations, exportMaskedConfig, exportPromptSources, importPromptSources, recoverPromptSources, resolveDatabaseBackupPath, resolvePromptSourcesExportPath, } from "../../config/operations.js";
import { getFailedConfigurationOperationSnapshot, rejectConfigurationOperation, runDatabaseImportConfigurationOperation, runPersistedConfigurationOperation, } from "../../config/operation-command.js";
import { getApiRuntimeConfig, getApiRuntimePaths } from "../runtime-context.js";
const INTERNAL_PATH_REDACTION = "[internal-path-redacted]";
const CHECKSUM_REDACTION = "[checksum-redacted]";
const operationLogger = logger.child("config-operations");
function resolveWorkDir(value, fallbackWorkDir) {
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallbackWorkDir();
}
function redactPromptSourceMetadata(source) {
    return {
        ...source,
        path: INTERNAL_PATH_REDACTION,
        checksum: CHECKSUM_REDACTION,
    };
}
function redactPromptSourceBackup(backup) {
    return {
        ...backup,
        sourcePath: INTERNAL_PATH_REDACTION,
        backupPath: INTERNAL_PATH_REDACTION,
        checksum: CHECKSUM_REDACTION,
    };
}
function withPromptSourceExportId(result) {
    return {
        ...result,
        exportId: basename(result.exportPath),
    };
}
function redactDatabaseBackupResult(result) {
    return {
        ...result,
        databasePath: INTERNAL_PATH_REDACTION,
        backupPath: INTERNAL_PATH_REDACTION,
        ...(result.walPath ? { walPath: INTERNAL_PATH_REDACTION } : {}),
        ...(result.shmPath ? { shmPath: INTERNAL_PATH_REDACTION } : {}),
        checksum: CHECKSUM_REDACTION,
    };
}
function redactDatabaseImportResult(result) {
    return {
        ...result,
        importedPath: INTERNAL_PATH_REDACTION,
        rollbackBackup: redactDatabaseBackupResult(result.rollbackBackup),
        status: {
            ...result.status,
            databasePath: INTERNAL_PATH_REDACTION,
        },
    };
}
function redactConfigExportResult(result) {
    return {
        ...result,
        configPath: INTERNAL_PATH_REDACTION,
        exportPath: INTERNAL_PATH_REDACTION,
        checksum: CHECKSUM_REDACTION,
    };
}
function redactPromptSourceExportResult(result) {
    return {
        ...withPromptSourceExportId(result),
        exportPath: INTERNAL_PATH_REDACTION,
        checksum: CHECKSUM_REDACTION,
        sources: result.sources.map(redactPromptSourceMetadata),
    };
}
function redactPromptSourceImportResult(result) {
    return {
        ...withPromptSourceExportId(result),
        exportPath: INTERNAL_PATH_REDACTION,
        backups: result.backups.map(redactPromptSourceBackup),
        registry: result.registry.map(redactPromptSourceMetadata),
    };
}
function redactPromptSourceRecoveryResult(result) {
    return {
        ...result,
        promptsDir: INTERNAL_PATH_REDACTION,
        registry: result.registry.map(redactPromptSourceMetadata),
    };
}
function redactMigrationStatus(status) {
    return {
        ...status,
        databasePath: INTERNAL_PATH_REDACTION,
    };
}
function redactConfigurationOperationsSnapshot(snapshot) {
    return {
        ...snapshot,
        database: redactMigrationStatus(snapshot.database),
        promptSources: {
            ...snapshot.promptSources,
            workDir: INTERNAL_PATH_REDACTION,
            versions: snapshot.promptSources.versions.map(redactPromptSourceMetadata),
        },
        config: {
            ...snapshot.config,
            configPath: INTERNAL_PATH_REDACTION,
        },
    };
}
function buildRedactedConfigurationOperationsSnapshot(paths, workDir) {
    return redactConfigurationOperationsSnapshot(buildConfigurationOperationsSnapshot(paths, workDir));
}
function redactMigrationDryRunResult(result) {
    return {
        ...result,
        status: redactMigrationStatus(result.status),
    };
}
function configOperationErrorSummary(error) {
    const rawMessage = error instanceof Error ? error.message : String(error);
    return sanitizeUserFacingError(redactLogText(rawMessage));
}
function sendOperationError(reply, error) {
    const sanitized = configOperationErrorSummary(error);
    const command = getFailedConfigurationOperationSnapshot(error);
    return reply.status(400).send({
        ok: false,
        error: sanitized.userMessage,
        kind: sanitized.kind,
        actionHint: sanitized.actionHint,
        ...(command ? { command } : {}),
    });
}
export function registerConfigOperationsRoute(app) {
    app.get("/api/config/operations", { preHandler: authMiddleware }, async (req) => {
        const paths = getApiRuntimePaths(req);
        return {
            snapshot: buildRedactedConfigurationOperationsSnapshot(paths, resolveWorkDir(req.query.workDir, () => getApiRuntimeConfig(req).profile.workspace)),
        };
    });
    app.get("/api/config/migrations/dry-run", { preHandler: authMiddleware }, async (req) => {
        const paths = getApiRuntimePaths(req);
        return { dryRun: redactMigrationDryRunResult(dryRunDatabaseMigrations(paths.dbFile)) };
    });
    app.post("/api/config/db/backup", { preHandler: authMiddleware }, async (req, reply) => {
        const paths = getApiRuntimePaths(req);
        try {
            const operation = runPersistedConfigurationOperation({
                kind: "config.db.backup",
                logger: operationLogger,
                execute: () => createDatabaseBackup("backup", paths),
            });
            return {
                ok: true,
                backup: redactDatabaseBackupResult(operation.value),
                command: operation.command,
                snapshot: buildRedactedConfigurationOperationsSnapshot(paths, getApiRuntimeConfig(req).profile.workspace),
            };
        }
        catch (error) {
            return sendOperationError(reply, error);
        }
    });
    app.post("/api/config/db/export", { preHandler: authMiddleware }, async (req, reply) => {
        const paths = getApiRuntimePaths(req);
        try {
            const operation = runPersistedConfigurationOperation({
                kind: "config.db.export",
                logger: operationLogger,
                execute: () => createDatabaseBackup("export", paths),
            });
            return {
                ok: true,
                export: redactDatabaseBackupResult(operation.value),
                command: operation.command,
                snapshot: buildRedactedConfigurationOperationsSnapshot(paths, getApiRuntimeConfig(req).profile.workspace),
            };
        }
        catch (error) {
            return sendOperationError(reply, error);
        }
    });
    app.post("/api/config/db/import", { preHandler: authMiddleware }, async (req, reply) => {
        const paths = getApiRuntimePaths(req);
        const backupId = req.body?.backupId ?? req.body?.backupPath;
        if (!backupId) {
            return reply.status(400).send({
                ok: false,
                error: "backupId is required",
                command: rejectConfigurationOperation({
                    kind: "config.db.import",
                    reasonCode: "backup_id_required",
                    logger: operationLogger,
                }),
            });
        }
        try {
            const operation = runDatabaseImportConfigurationOperation({
                resolveBackupPath: () => resolveDatabaseBackupPath(backupId, paths),
                paths,
                logger: operationLogger,
            });
            return {
                ok: true,
                import: redactDatabaseImportResult(operation.value),
                command: operation.command,
                snapshot: buildRedactedConfigurationOperationsSnapshot(paths, getApiRuntimeConfig(req).profile.workspace),
            };
        }
        catch (error) {
            return sendOperationError(reply, error);
        }
    });
    app.post("/api/config/export", { preHandler: authMiddleware }, async (req, reply) => {
        const paths = getApiRuntimePaths(req);
        try {
            const operation = runPersistedConfigurationOperation({
                kind: "config.export",
                logger: operationLogger,
                execute: () => exportMaskedConfig(paths),
            });
            return { ok: true, export: redactConfigExportResult(operation.value), command: operation.command };
        }
        catch (error) {
            return sendOperationError(reply, error);
        }
    });
    app.post("/api/config/prompt-sources/export", { preHandler: authMiddleware }, async (req, reply) => {
        const paths = getApiRuntimePaths(req);
        try {
            const workDir = resolveWorkDir(req.body?.workDir, () => getApiRuntimeConfig(req).profile.workspace);
            const operation = runPersistedConfigurationOperation({
                kind: "config.prompt_sources.export",
                logger: operationLogger,
                execute: () => exportPromptSources(workDir, paths),
            });
            return {
                ok: true,
                export: redactPromptSourceExportResult(operation.value),
                command: operation.command,
                snapshot: buildRedactedConfigurationOperationsSnapshot(paths, workDir),
            };
        }
        catch (error) {
            return sendOperationError(reply, error);
        }
    });
    app.post("/api/config/prompt-sources/import", { preHandler: authMiddleware }, async (req, reply) => {
        const paths = getApiRuntimePaths(req);
        const exportId = req.body?.exportId ?? req.body?.exportPath;
        if (!exportId) {
            return reply.status(400).send({
                ok: false,
                error: "exportId is required",
                command: rejectConfigurationOperation({
                    kind: "config.prompt_sources.import",
                    reasonCode: "export_id_required",
                    logger: operationLogger,
                }),
            });
        }
        try {
            const workDir = resolveWorkDir(req.body.workDir, () => getApiRuntimeConfig(req).profile.workspace);
            const operation = runPersistedConfigurationOperation({
                kind: "config.prompt_sources.import",
                logger: operationLogger,
                execute: () => importPromptSources({
                    workDir,
                    exportPath: resolvePromptSourcesExportPath(exportId, paths),
                    ...(req.body.overwrite !== undefined ? { overwrite: req.body.overwrite } : {}),
                }),
            });
            return {
                ok: true,
                import: redactPromptSourceImportResult(operation.value),
                command: operation.command,
                snapshot: buildRedactedConfigurationOperationsSnapshot(paths, workDir),
            };
        }
        catch (error) {
            return sendOperationError(reply, error);
        }
    });
    app.post("/api/config/prompt-sources/recover", { preHandler: authMiddleware }, async (req, reply) => {
        const paths = getApiRuntimePaths(req);
        try {
            const workDir = resolveWorkDir(req.body?.workDir, () => getApiRuntimeConfig(req).profile.workspace);
            const operation = runPersistedConfigurationOperation({
                kind: "config.prompt_sources.recover",
                logger: operationLogger,
                execute: () => recoverPromptSources(workDir),
            });
            return {
                ok: true,
                recovery: redactPromptSourceRecoveryResult(operation.value),
                command: operation.command,
                snapshot: buildRedactedConfigurationOperationsSnapshot(paths, workDir),
            };
        }
        catch (error) {
            return sendOperationError(reply, error);
        }
    });
}
//# sourceMappingURL=config-operations.js.map